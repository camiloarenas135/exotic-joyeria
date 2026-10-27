import { supabase } from './supabase';
import { toTitleCase, sanitizeSearchQuery } from './sanitize';
import { parseCOP } from './pricing';
import type { Product } from '../context/AppContext';
import type { CatalogRow, Channel, PromoCover } from './types';

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

export function mapRow(row: CatalogRow, channel: Channel = 'retail'): Product {
  const base = row.price_cop ?? parseCOP(row.price);
  const wholesale = channel === 'wholesale';
  return {
    channel,
    retailRefCop: wholesale ? (row.retail_effective_price_cop ?? row.retail_price_cop ?? undefined) : undefined,
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
      retail_price_cop: v.retail_price_cop ?? null,
      retail_effective_price_cop: v.retail_effective_price_cop ?? null,
    })),
  };
}

/**
 * Consulta el catálogo del canal: orden, filtros y paginación los resuelve el servidor.
 * 'wholesale' usa catalog_wholesale (solo mayoristas aprobados) y nunca manda p_promo_only: allí no hay promociones.
 */
export async function fetchCatalog(q: CatalogQuery, channel: Channel = 'retail'): Promise<{ products: Product[]; total: number }> {
  const pageSize = q.pageSize ?? PAGE_SIZE;
  const page = Math.max(q.page ?? 1, 1);
  const search = q.search ? sanitizeSearchQuery(q.search) : '';
  if (channel === 'wholesale') {
    const { data, error } = await supabase.rpc('catalog_wholesale', {
      p_category: q.categoryId ?? null,
      p_search: search || null,
      p_sort: q.sort ?? 'price_asc',
      p_in_stock: q.inStock ?? false,
      p_min: q.min ?? null,
      p_max: q.max ?? null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;
    const rows = (data || []) as CatalogRow[];
    return { products: rows.map((r) => mapRow(r, 'wholesale')), total: rows[0]?.total_count ?? 0 };
  }
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
  return { products: rows.map((r) => mapRow(r)), total: rows[0]?.total_count ?? 0 };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trae un producto por id para el enlace profundo ?producto=.
 * Usa catalog_retail con p_id: precio efectivo y promoción salen del servidor (best_promo).
 * Devuelve null si el id es inválido o no existe.
 */
export async function fetchProductById(id: string, channel: Channel = 'retail'): Promise<Product | null> {
  if (!UUID_RE.test(id)) return null;
  if (channel === 'wholesale') {
    const { data, error } = await supabase.rpc('catalog_wholesale', {
      p_category: null, p_search: null, p_sort: 'price_asc', p_in_stock: false, p_min: null, p_max: null,
      p_limit: 1, p_offset: 0, p_id: id,
    });
    if (error) throw error;
    const row = ((data || []) as CatalogRow[])[0];
    return row ? mapRow(row, 'wholesale') : null;
  }
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

export interface CoversResult {
  covers: Record<string, string>;
  /** Mayorista: colecciones con al menos un producto publicado. Detal: null (todas). */
  availableIds: string[] | null;
}

/**
 * Portadas de colecciones: categories.image o, si no hay, foto de un producto de esa colección.
 * Detal: collection_covers. Mayorista: collection_covers_wholesale (solo colecciones con productos publicados).
 */
export async function fetchCollectionCovers(channel: Channel = 'retail'): Promise<CoversResult> {
  const { data, error } = await supabase.rpc(channel === 'wholesale' ? 'collection_covers_wholesale' : 'collection_covers');
  if (error) throw error;
  const covers: Record<string, string> = {};
  const ids: string[] = [];
  for (const r of (data ?? []) as { category_id: string; image: string | null }[]) {
    ids.push(r.category_id);
    if (r.image) covers[r.category_id] = r.image;
  }
  return { covers, availableIds: channel === 'wholesale' ? ids : null };
}

/** Burbuja "Promociones": una fila si hay promociones vigentes con foto; null si no hay. */
export async function fetchPromoCover(): Promise<PromoCover | null> {
  const { data, error } = await supabase.rpc('promo_cover');
  if (error) throw error;
  const r = ((data ?? []) as { image: string | null; product_name: string | null; max_discount_pct: number | null; valid_until: string | null }[])[0];
  if (!r || !r.image) return null;
  return {
    image: r.image,
    productName: r.product_name ?? '',
    maxDiscountPct: Math.max(Math.round(r.max_discount_pct ?? 0), 0),
    validUntil: r.valid_until ?? null,
  };
}
