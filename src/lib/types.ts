import type { PromoKind } from './pricing';

export interface Category {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  image: string | null;
}

export type HeroLinkType =
  | 'home' | 'catalog' | 'collection' | 'product' | 'promos' | 'wholesale' | 'entrepreneur' | 'external';

export interface HeroSlide {
  id: string;
  image_desktop: string;
  image_mobile: string | null;
  title: string | null;
  subtitle: string | null;
  button_label: string | null;
  /** Enlace de texto heredado (banners anteriores a la entrega B). */
  link: string | null;
  /** Destino estructurado; NULL en banners viejos que solo usan `link`. */
  link_type?: HeroLinkType | null;
  /** uuid (collection/product) o https (external); NULL para los demás tipos. */
  link_ref?: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export type PromoScope = 'product' | 'category' | 'store';

export interface Promotion {
  id: string;
  scope: PromoScope;
  product_id: string | null;
  category_id: string | null;
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
  /** Precio final con promoción, calculado por el servidor (best_promo) */
  effective_price_cop?: number | null;
  promo_kind?: PromoKind | null;
  promo_value?: number | null;
  /** Solo canal mayorista: precio detal de referencia de la variante */
  retail_price_cop?: number | null;
  retail_effective_price_cop?: number | null;
}

/** Fila devuelta por las RPC catalog_retail y catalog_wholesale (esta última añade los dos campos retail_*) */
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
  retail_price_cop?: number | null;
  retail_effective_price_cop?: number | null;
}

/** Canal de compra: lo decide la cuenta (mayorista aprobado) y nunca se mezclan precios entre canales. */
export type Channel = 'retail' | 'wholesale';

/** @deprecated wholesale_catalog() quedó en desuso; se conserva solo por compatibilidad de tipos. */
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

/** Tipo de cuenta de negocio: decide la lista de precios y el pedido mínimo. Solo lo cambia el admin. */
export type AccountType = 'wholesale' | 'entrepreneur';
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { wholesale: 'Mayorista', entrepreneur: 'Emprendedor' };

export interface Wholesaler {
  user_id: string;
  email: string | null;
  business_name: string | null;
  phone: string | null;
  city: string | null;
  tax_id: string | null;
  status: WholesalerStatus;
  /** Nota interna del admin: solo la devuelve admin_list_wholesalers; el dueño de la cuenta no puede leerla. */
  notes?: string | null;
  /** Tipo real de la cuenta (decide precios). El dueño puede leerlo; solo el admin lo cambia. */
  account_type?: AccountType;
  /** Lo que la persona pidió al registrarse (solo admin_list_wholesalers); nunca autoriza nada. */
  requested_account_type?: AccountType;
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

/**
 * Solo rutas internas o https (mismo criterio que la base).
 * Interna: "/" y luego un carácter permitido (no "//"), sin "..".
 * Externa: https sin credenciales (user@).
 */
export function isSafeLink(link: string | null | undefined): boolean {
  if (!link) return false;
  if (link.includes('..')) return false;
  if (link.startsWith('/')) return /^\/([A-Za-z0-9_%.-][A-Za-z0-9/_?=&#.%-]*)?$/.test(link);
  if (/^https:\/\/\S+$/.test(link)) {
    try {
      const u = new URL(link);
      return u.protocol === 'https:' && !u.username && !u.password && u.hostname.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/** Portada de la burbuja "Promociones" (RPC promo_cover). */
export interface PromoCover {
  image: string;
  productName: string;
  maxDiscountPct: number;
  /** Fecha ISO en que vence la primera promoción vigente; pasada esa hora la burbuja se oculta. */
  validUntil: string | null;
}
