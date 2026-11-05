import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { adminErrorMessage, formatCOP, orderErrorMessage } from './pricing';
import { sanitizeString } from './sanitize';

/** Tope que se muestra mientras el servidor no responde. El valor real viene de `kit_catalog()` (settings.kit_max_cop). */
export const KIT_DEFAULT_CAP_COP = 500_000;

export interface KitPiece {
  productId: string;
  name: string;
  category: string | null;
  image: string | null;
  normalPriceCop: number;
  specialPriceCop: number;
  stock: number;
}

export interface KitCatalog {
  capCop: number;
  pieces: KitPiece[];
}

/** Selección del comprador: product_id -> cantidad. */
export type KitSelection = Record<string, number>;

interface RawPiece {
  product_id: string;
  name: string;
  category: string | null;
  image: string | null;
  normal_price_cop: number;
  special_price_cop: number;
  stock: number;
}

function mapPiece(r: RawPiece): KitPiece {
  return {
    productId: r.product_id,
    name: r.name,
    category: r.category ?? null,
    image: r.image ?? null,
    normalPriceCop: r.normal_price_cop,
    specialPriceCop: r.special_price_cop,
    stock: r.stock,
  };
}

export async function fetchKitCatalog(): Promise<KitCatalog> {
  const { data, error } = await supabase.rpc('kit_catalog');
  if (error) throw error;
  const d = data as { cap_cop?: number; pieces?: RawPiece[] } | null;
  return { capCop: d?.cap_cop && d.cap_cop > 0 ? d.cap_cop : KIT_DEFAULT_CAP_COP, pieces: (d?.pieces ?? []).map(mapPiece) };
}

/** Catálogo del kit (tope + piezas habilitadas). `enabled=false` evita la llamada (p. ej. para el mayorista). */
export function useKitCatalog(enabled = true): { catalog: KitCatalog | null; loading: boolean; error: boolean; reload: () => void } {
  const [catalog, setCatalog] = useState<KitCatalog | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchKitCatalog()
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { catalog, loading, error, reload };
}

// --- Cálculo (solo para la interfaz: el total real lo valida el servidor) ----------------------------------------

export function kitTotal(sel: KitSelection, pieces: KitPiece[]): number {
  return pieces.reduce((sum, p) => sum + p.specialPriceCop * (sel[p.productId] ?? 0), 0);
}

/** ¿Cabe una unidad más de esta pieza dentro del tope y del stock? */
export function canAddPiece(p: KitPiece, sel: KitSelection, total: number, cap: number): { ok: boolean; reason?: string } {
  const qty = sel[p.productId] ?? 0;
  if (qty >= p.stock) return { ok: false, reason: 'No hay más unidades' };
  if (total + p.specialPriceCop > cap) return { ok: false, reason: `No cabe: te faltan ${formatCOP(total + p.specialPriceCop - cap)}` };
  return { ok: true };
}

/** Quita lo que ya no existe, ajusta al stock y recorta hasta que el total quepa en el tope (borrador viejo). */
export function reconcileSelection(sel: KitSelection, pieces: KitPiece[], cap: number): KitSelection {
  const out: KitSelection = {};
  let total = 0;
  for (const p of pieces) {
    let q = Math.min(Math.max(Math.floor(sel[p.productId] ?? 0), 0), p.stock);
    while (q > 0 && total + q * p.specialPriceCop > cap) q -= 1;
    if (q > 0) {
      out[p.productId] = q;
      total += q * p.specialPriceCop;
    }
  }
  return out;
}

export function selectionToPieces(sel: KitSelection): { product_id: string; qty: number }[] {
  return Object.entries(sel)
    .filter(([, qty]) => qty > 0)
    .map(([product_id, qty]) => ({ product_id, qty }));
}

// --- Borrador en el navegador -----------------------------------------------------------------------------------------

const DRAFT_KEY = 'kit_draft_v1';

export function loadKitDraft(): KitSelection {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: KitSelection = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^[0-9a-f-]{36}$/i.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveKitDraft(sel: KitSelection): void {
  try {
    if (Object.keys(sel).length === 0) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(sel));
  } catch {
    /* sin almacenamiento: el kit sigue funcionando sin borrador */
  }
}

// --- Pedido ------------------------------------------------------------------------------------------------------------------

export interface KitOrderResult {
  order_id: string;
  total: number;
  cap: number;
  lines: { product_id: string; name: string; qty: number; unit_price: number; line_total: number }[];
}

export async function createKitOrder(customer: { name: string; phone: string }, sel: KitSelection): Promise<KitOrderResult> {
  const { data, error } = await supabase.rpc('create_kit_order', { p_customer: customer, p_pieces: selectionToPieces(sel) });
  if (error) throw error;
  return data as KitOrderResult;
}

const KIT_ERRORS: Record<string, string> = {
  KIT_EMPTY: 'Aún no has elegido piezas para tu kit.',
  NOT_IN_KIT: 'Una de las piezas ya no está disponible para el kit. Actualiza la página.',
  NOT_RETAIL: 'El kit es solo para compras al detal. Con tu cuenta mayorista compra desde la tienda mayorista.',
};

/** Traduce el error de create_kit_order a español. */
export function kitOrderErrorMessage(raw: string | undefined): string {
  const [code, a, b] = (raw ?? '').split(':');
  if (code === 'KIT_OVER_CAP') {
    return `Tu kit llega a ${formatCOP(parseInt(a, 10))} y el máximo es ${formatCOP(parseInt(b, 10))}. Quita alguna pieza.`;
  }
  if (code === 'NOT_IN_KIT' && a) return `${a} ya no está disponible para el kit. Actualiza la página.`;
  if (KIT_ERRORS[code]) return KIT_ERRORS[code];
  return orderErrorMessage(raw);
}

export function buildKitWhatsapp(name: string, order: KitOrderResult): string {
  let msg = `¡Hola! Soy ${sanitizeString(name, 100)}. Armé mi Kit Emprendedor:\n\n`;
  order.lines.forEach((l) => {
    msg += `${l.qty}x ${sanitizeString(l.name, 100)} - ${formatCOP(l.unit_price)} c/u\n`;
  });
  msg += `\n*Total del kit: ${formatCOP(order.total)}* (el envío se coordina aparte)\n\n`;
  msg += 'Quedo atento/a para coordinar el pago y el envío. ¡Gracias!';
  return msg;
}

// --- Admin -----------------------------------------------------------------------------------------------------------------------

export interface AdminKitPiece {
  productId: string;
  name: string;
  category: string | null;
  image: string | null;
  normalPriceCop: number | null;
  specialPriceCop: number;
  enabled: boolean;
  sort: number;
  stock: number | null;
  hasVariants: boolean;
}

export async function adminKitList(): Promise<{ capCop: number; pieces: AdminKitPiece[] }> {
  const { data, error } = await supabase.rpc('admin_kit_list');
  if (error) throw error;
  const d = data as { cap_cop: number; pieces: Record<string, any>[] };
  return {
    capCop: d.cap_cop,
    pieces: (d.pieces ?? []).map((r) => ({
      productId: r.product_id,
      name: r.name,
      category: r.category ?? null,
      image: r.image ?? null,
      normalPriceCop: r.normal_price_cop ?? null,
      specialPriceCop: r.special_price_cop,
      enabled: !!r.enabled,
      sort: r.sort ?? 0,
      stock: r.stock ?? null,
      hasVariants: !!r.has_variants,
    })),
  };
}

export async function adminKitUpsert(productId: string, specialPrice: number, enabled: boolean, sort = 0): Promise<void> {
  const { error } = await supabase.rpc('admin_kit_upsert', { p_product_id: productId, p_special_price: specialPrice, p_enabled: enabled, p_sort: sort });
  if (error) throw error;
}

export async function adminKitRemove(productId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_kit_remove', { p_product_id: productId });
  if (error) throw error;
}

export async function adminKitSetCap(cap: number): Promise<void> {
  const { error } = await supabase.rpc('admin_kit_set_cap', { p_cap: cap });
  if (error) throw error;
}

const KIT_ADMIN_ERRORS: Record<string, string> = {
  VARIANT_PRODUCT: 'Este producto tiene variantes y no puede entrar al kit',
  PRICE_ABOVE_NORMAL: 'El precio especial no puede ser mayor al precio normal de',
  PRICE_ABOVE_CAP: 'El precio especial no puede superar el tope del kit:',
  NO_PRICE: 'El producto no tiene precio normal:',
  INVALID_CAP: 'El tope debe ser un número entero entre 1 y 2.000.000.000.',
};

export function kitAdminErrorMessage(raw: string | undefined): string {
  const [code, detail] = (raw ?? '').split(':');
  const base = KIT_ADMIN_ERRORS[code];
  if (base) return detail ? `${base} ${detail}.` : base;
  return adminErrorMessage(raw);
}

export const errorText = (err: unknown): string | undefined =>
  err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
