import type { Product } from '../context/AppContext';

/** Productos ya cargados por las grillas: el modal abre al instante sin otra consulta. Se vacía al cambiar de canal. */
export const knownProducts = new Map<string, Product>();

export function rememberProducts(products: Product[]) {
  products.forEach((p) => knownProducts.set(p.id, p));
}

export function forgetProducts() {
  knownProducts.clear();
}
