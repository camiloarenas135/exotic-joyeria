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
