import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { WHOLESALE_MIN_FALLBACK, ENTREPRENEUR_MIN_FALLBACK } from './pricing';
import type { AccountType } from './types';

const MIN_TTL_MS = 5 * 60 * 1000;
// Un mínimo y una caché por tipo de cuenta: el de emprendedor nunca se mezcla con el mayorista
const KEY: Record<AccountType, string> = { wholesale: 'wholesale_min_cache_v1', entrepreneur: 'entrepreneur_min_cache_v1' };
const RPC: Record<AccountType, string> = { wholesale: 'wholesale_min', entrepreneur: 'entrepreneur_min' };
const FALLBACK: Record<AccountType, number> = { wholesale: WHOLESALE_MIN_FALLBACK, entrepreneur: ENTREPRENEUR_MIN_FALLBACK };
const memo: Record<AccountType, { value: number; at: number } | null> = { wholesale: null, entrepreneur: null };

/** Lee el mínimo del tipo de cuenta de la base (RPC pública). Falla si la consulta falla: quien llama decide el valor por defecto. */
export async function fetchWholesaleMin(force = false, type: AccountType = 'wholesale'): Promise<number> {
  const now = Date.now();
  if (!force) {
    const m = memo[type];
    if (m && now - m.at < MIN_TTL_MS) return m.value;
    try {
      const raw = sessionStorage.getItem(KEY[type]);
      const c = raw ? (JSON.parse(raw) as { value: number; at: number }) : null;
      if (c && now - c.at < MIN_TTL_MS && Number.isFinite(c.value)) {
        memo[type] = c;
        return c.value;
      }
    } catch {
      /* sin caché */
    }
  }
  const { data, error } = await supabase.rpc(RPC[type]);
  const n = Array.isArray(data) || data === null ? NaN : Number(data);
  if (error || !Number.isFinite(n) || n < 0) throw error ?? new Error(RPC[type]);
  memo[type] = { value: n, at: now };
  try {
    sessionStorage.setItem(KEY[type], JSON.stringify(memo[type]));
  } catch {
    /* modo privado */
  }
  return n;
}

export function forgetWholesaleMin() {
  memo.wholesale = null;
  memo.entrepreneur = null;
  try {
    sessionStorage.removeItem(KEY.wholesale);
    sessionStorage.removeItem(KEY.entrepreneur);
  } catch {
    /* ignore */
  }
}

/** Mínimo de pedido del tipo de cuenta, leído del servidor; mientras carga (o si falla) usa el valor por defecto. */
export function useWholesaleMin(type: AccountType = 'wholesale'): { min: number; loaded: boolean } {
  const [state, setState] = useState<{ min: number; loaded: boolean }>({ min: memo[type]?.value ?? FALLBACK[type], loaded: !!memo[type] });
  useEffect(() => {
    let cancelled = false;
    setState({ min: memo[type]?.value ?? FALLBACK[type], loaded: !!memo[type] });
    fetchWholesaleMin(false, type)
      .then((min) => !cancelled && setState({ min, loaded: true }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [type]);
  return state;
}
