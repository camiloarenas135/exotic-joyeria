import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Stock por variante. Mientras el interruptor del servidor está apagado, el tope sigue siendo el stock del producto (como siempre);
 * encendido, cada variante tiene el suyo. El servidor valida igual en cada pedido: esto solo evita ofrecer lo que no hay.
 */
let mode: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function fetchVariantStockMode(): Promise<boolean> {
  if (mode !== null) return Promise.resolve(mode);
  inflight ??= Promise.resolve(supabase.rpc('variant_stock_enabled'))
    .then(({ data, error }) => {
      if (!error && typeof data === 'boolean') mode = data;
      return mode ?? false;
    })
    .catch(() => false)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useVariantStockMode(): boolean {
  const [on, setOn] = useState<boolean>(mode ?? false);
  useEffect(() => {
    let cancelled = false;
    void fetchVariantStockMode().then((m) => !cancelled && setOn(m));
    return () => {
      cancelled = true;
    };
  }, []);
  return on;
}

interface WithStock {
  stock: number;
  variants?: { name: string; stock?: number | null }[];
}

/** Unidades disponibles de un producto o de una de sus variantes (por nombre). */
export function stockFor(product: WithStock, variantName: string | undefined, byVariant: boolean): number {
  if (byVariant && variantName !== undefined) {
    const v = product.variants?.find((x) => x.name === variantName);
    if (v && typeof v.stock === 'number') return Math.max(v.stock, 0);
  }
  return Math.max(product.stock, 0);
}

/** "Quedan N" solo cuando quedan pocas (N <= 5). */
export const LOW_STOCK_NOTICE = 5;
