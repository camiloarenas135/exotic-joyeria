import { isSafeLink, type Category, type HeroSlide } from './types';

export type ResolvedLink =
  | { kind: 'internal'; to: string }
  | { kind: 'external'; href: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rutas fijas permitidas (lista cerrada). */
const FIXED: Record<string, string> = {
  home: '/',
  catalog: '/catalogo',
  promos: '/promociones',
  wholesale: '/mayoristas',
  entrepreneur: '/emprendedor',
};

/**
 * Convierte el destino de un banner en un enlace seguro.
 * - link_type conocido: ruta armada desde una lista cerrada (nunca se concatena texto libre).
 * - link_type desconocido: null (no se renderiza el botón).
 * - link_type NULL: `link` heredado, solo si pasa isSafeLink.
 */
export function resolveLink(
  slide: Pick<HeroSlide, 'link' | 'link_type' | 'link_ref'>,
  ctx: { categories: Pick<Category, 'id' | 'slug'>[] }
): ResolvedLink | null {
  const type = slide.link_type;
  if (type === null || type === undefined) {
    const link = slide.link;
    if (!isSafeLink(link)) return null;
    return link!.startsWith('/') ? { kind: 'internal', to: link! } : { kind: 'external', href: link! };
  }
  if (type in FIXED) return { kind: 'internal', to: FIXED[type] };
  if (type === 'collection') {
    const cat = slide.link_ref ? ctx.categories.find((c) => c.id === slide.link_ref) : undefined;
    // Colección eliminada u oculta: se cae al catálogo completo
    return { kind: 'internal', to: cat ? `/coleccion/${encodeURIComponent(cat.slug)}` : '/catalogo' };
  }
  if (type === 'product') {
    if (!slide.link_ref || !UUID.test(slide.link_ref)) return null;
    return { kind: 'internal', to: `/catalogo?producto=${encodeURIComponent(slide.link_ref)}` };
  }
  if (type === 'external') {
    return slide.link_ref && isSafeLink(slide.link_ref) && slide.link_ref.startsWith('https://')
      ? { kind: 'external', href: slide.link_ref }
      : null;
  }
  return null;
}
