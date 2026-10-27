import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { WHOLESALE_MIN_FALLBACK } from './pricing';

const MIN_KEY = 'wholesale_min_cache_v1';
const MIN_TTL_MS = 5 * 60 * 1000;
let memo: { value: number; at: number } | null = null;

/** Lee el mínimo mayorista de la base (RPC pública wholesale_min). Cae al valor por defecto solo si la consulta falla. */
export async function fetchWholesaleMin(force = false): Promise<number> {
  const now = Date.now();
  if (!force) {
    if (memo && now - memo.at < MIN_TTL_MS) return memo.value;
    try {
      const raw = sessionStorage.getItem(MIN_KEY);
      const c = raw ? (JSON.parse(raw) as { value: number; at: number }) : null;
      if (c && now - c.at < MIN_TTL_MS && Number.isFinite(c.value)) {
        memo = c;
        return c.value;
      }
    } catch {
      /* sin caché */
    }
  }
  const { data, error } = await supabase.rpc('wholesale_min');
  const n = Array.isArray(data) || data === null ? NaN : Number(data);
  if (error || !Number.isFinite(n) || n < 0) throw error ?? new Error('wholesale_min');
  memo = { value: n, at: now };
  try {
    sessionStorage.setItem(MIN_KEY, JSON.stringify(memo));
  } catch {
    /* modo privado */
  }
  return n;
}

export function forgetWholesaleMin() {
  memo = null;
  try {
    sessionStorage.removeItem(MIN_KEY);
  } catch {
    /* ignore */
  }
}

/** Mínimo de pedido mayorista leído del servidor; mientras carga (o si falla) usa el valor por defecto. */
export function useWholesaleMin(): { min: number; loaded: boolean } {
  const [state, setState] = useState<{ min: number; loaded: boolean }>({ min: memo?.value ?? WHOLESALE_MIN_FALLBACK, loaded: !!memo });
  useEffect(() => {
    let cancelled = false;
    fetchWholesaleMin()
      .then((min) => !cancelled && setState({ min, loaded: true }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
