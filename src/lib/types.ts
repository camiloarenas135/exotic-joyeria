import type { PromoKind } from './pricing';

export interface Category {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  image: string | null;
}

export interface HeroSlide {
  id: string;
  image_desktop: string;
  image_mobile: string | null;
  title: string | null;
  subtitle: string | null;
  button_label: string | null;
  link: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface Promotion {
  id: string;
  product_id: string;
  kind: PromoKind;
  value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export interface ProductVariantRow {
  name: string;
  price: string;
  price_cop?: number | null;
}

/** Fila devuelta por la RPC catalog_retail */
export interface CatalogRow {
  id: string;
  name: string;
  price: string;
  price_cop: number | null;
  effective_price_cop: number | null;
  promo_kind: PromoKind | null;
  promo_value: number | null;
  category: string;
  category_id: string | null;
  stock: number;
  description: string | null;
  variants: ProductVariantRow[] | null;
  images: string[] | null;
  created_at: string;
  total_count: number;
}

export interface WholesaleRow {
  id: string;
  name: string;
  category: string;
  category_id: string | null;
  stock: number;
  description: string | null;
  images: string[] | null;
  wholesale_price_cop: number | null;
  wholesale_variants: { name: string; price_cop: number }[];
}

export type WholesalerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Wholesaler {
  user_id: string;
  email: string | null;
  business_name: string | null;
  phone: string | null;
  city: string | null;
  tax_id: string | null;
  status: WholesalerStatus;
  notes: string | null;
  created_at: string;
}

/** Slug estable y válido para la restricción de la base (^[a-z0-9-]+$). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Solo rutas internas o https (mismo criterio que la base). */
export function isSafeLink(link: string | null | undefined): boolean {
  if (!link) return false;
  return /^\/[A-Za-z0-9/_?=&#.%-]*$/.test(link) || /^https:\/\/\S+$/.test(link);
}
