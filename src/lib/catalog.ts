import { supabase } from './supabase';
import { toTitleCase, sanitizeSearchQuery } from './sanitize';
import { parseCOP } from './pricing';
import type { Product } from '../context/AppContext';
import type { CatalogRow } from './types';

export const PAGE_SIZE = 24;

export type SortKey = 'price_asc' | 'price_desc' | 'newest' | 'name';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'newest', label: 'Novedades' },
  { value: 'name', label: 'Nombre (A–Z)' },
];

export interface CatalogQuery {
  categoryId?: string | null;
  search?: string;
  sort?: SortKey;
  inStock?: boolean;
  promoOnly?: boolean;
  min?: number | null;
  max?: number | null;
  page?: number; // base 1
  pageSize?: number;
}

export function mapRow(row: CatalogRow): Product {
  const base = row.price_cop ?? parseCOP(row.price);
  return {
    id: row.id,
    name: toTitleCase(row.name),
    price: row.price,
    priceCop: base,
    effectivePriceCop: row.effective_price_cop ?? base,
    promoKind: row.promo_kind,
    promoValue: row.promo_value,
    image: row.images?.[0] || '',
    images: row.images || [],
    category: toTitleCase(row.category),
    stock: row.stock ?? 0,
    description: row.description || '',
    variants: (row.variants || []).map((v) => ({
      name: v.name,
      price: v.price,
      price_cop: v.price_cop ?? parseCOP(v.price),
    })),
  };
}

/** Consulta el catálogo al detal: orden, filtros y paginación los resuelve el servidor. */
export async function fetchCatalog(q: CatalogQuery): Promise<{ products: Product[]; total: number }> {
  const pageSize = q.pageSize ?? PAGE_SIZE;
  const page = Math.max(q.page ?? 1, 1);
  const search = q.search ? sanitizeSearchQuery(q.search) : '';
  const { data, error } = await supabase.rpc('catalog_retail', {
    p_category: q.categoryId ?? null,
    p_search: search || null,
    p_sort: q.sort ?? 'price_asc',
    p_in_stock: q.inStock ?? false,
    p_promo_only: q.promoOnly ?? false,
    p_min: q.min ?? null,
    p_max: q.max ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;
  const rows = (data || []) as CatalogRow[];
  return { products: rows.map(mapRow), total: rows[0]?.total_count ?? 0 };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trae un producto por id para el enlace profundo ?producto=.
 * No hay RPC por id (y esta entrega no toca la base): se lee la fila pública de `products`
 * y se busca en catalog_retail (misma categoría + nombre) para obtener precio efectivo y promo.
 * Limitación: si el nombre tiene caracteres que sanitizeSearchQuery elimina, o la coincidencia
 * no entra en 100 filas, se devuelve el producto SIN promoción (precio base).
 * Devuelve null si el id es inválido o no existe.
 */
export async function fetchProductById(id: string): Promise<Product | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, price_cop, category, category_id, stock, description, variants, images, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Omit<CatalogRow, 'effective_price_cop' | 'promo_kind' | 'promo_value' | 'total_count'>;
  try {
    const search = sanitizeSearchQuery(row.name);
    if (search === row.name.trim()) {
      const { data: rows } = await supabase.rpc('catalog_retail', {
        p_category: row.category_id ?? null,
        p_search: search,
        p_sort: 'price_asc',
        p_in_stock: false,
        p_promo_only: false,
        p_min: null,
        p_max: null,
        p_limit: 100,
        p_offset: 0,
      });
      const match = ((rows || []) as CatalogRow[]).find((r) => r.id === id);
      if (match) return mapRow(match);
    }
  } catch {
    /* sin promo: se usa el precio base */
  }
  return mapRow({ ...row, effective_price_cop: null, promo_kind: null, promo_value: null, total_count: 1 });
}
