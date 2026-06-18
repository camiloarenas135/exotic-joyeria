/**
 * Fuente única de verdad para las categorías de productos.
 * Importar desde aquí en lugar de definir arrays locales en cada componente.
 */
export const PRODUCT_CATEGORIES = [
  'Anillos',
  'Cadenas',
  'Candongas',
  'Exclusivo',
  'Pulseras',
  'Pulseras Tejidas',
  'Relojes',
  'Tobilleras',
  'Topos Broche',
  'Topos Rosca',
  'Dijes',
  'Insumos',
  'Rodio',
  'Plata Ley 925',
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

/** Filtros del catálogo público (incluye "Ver Todo" al inicio) */
export const CATALOG_FILTERS = ['Ver Todo', ...PRODUCT_CATEGORIES] as const;
