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
      effective_price_cop: v.effective_price_cop ?? undefined,
      promo_kind: v.promo_kind ?? null,
      promo_value: v.promo_value ?? null,
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
 * Usa catalog_retail con p_id: precio efectivo y promoción salen del servidor (best_promo).
 * Devuelve null si el id es inválido o no existe.
 */
export async function fetchProductById(id: string): Promise<Product | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.rpc('catalog_retail', {
    p_category: null,
    p_search: null,
    p_sort: 'price_asc',
    p_in_stock: false,
    p_promo_only: false,
    p_min: null,
    p_max: null,
    p_limit: 1,
    p_offset: 0,
    p_id: id,
  });
  if (error) throw error;
  const row = ((data || []) as CatalogRow[])[0];
  return row ? mapRow(row) : null;
}

/** Portadas de colecciones: categories.image o, si no hay, foto de un producto de esa colección (RPC collection_covers). */
export async function fetchCollectionCovers(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('collection_covers');
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { category_id: string; image: string | null }[]) {
    if (r.image) out[r.category_id] = r.image;
  }
  return out;
}
