import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchProductById } from '../lib/catalog';
import { formatCOP } from '../lib/pricing';
import { useChannel } from './ChannelContext';

/** Carrito mayorista: propio, atado al usuario. Nunca se comparte con el carrito al detal. */
export const wholesaleCartKey = (uid: string) => `wholesale_cart_v2:${uid}`;
export const WHOLESALE_CART_PREFIX = 'wholesale_cart_v2:';
const OLD_KEY = 'wholesale_cart_v1';
const MAX_QTY = 999;

export interface WLine {
  key: string;
  productId: string;
  variant: string | null;
  qty: number;
  name: string;
  image: string;
  /** Precio mayorista unitario según la última validación; null = aún sin validar (carrito migrado). */
  unit: number | null;
  /** Detal de referencia (con promoción vigente) para mostrar el ahorro. */
  retailRef: number | null;
  /** Stock total del producto (se comparte entre variantes). */
  stock: number | null;
}

export interface LineIssue {
  kind: 'unavailable' | 'stock' | 'price';
  text: string;
}

/** Cantidades que el panel del producto deja en el pedido (una por variante, o una sola sin variantes). */
export interface LineInput {
  variant: string | null;
  qty: number;
  unit: number;
  retailRef: number | null;
}

export const lineKey = (productId: string, variant: string | null) => `${productId}::${variant ?? ''}`;

interface WholesaleCartType {
  lines: WLine[];
  /** Unidades totales */
  units: number;
  total: number;
  issues: Record<string, LineIssue>;
  /** Hay líneas no disponibles / sin stock suficiente / sin validar: el envío debe bloquearse. */
  blocked: boolean;
  validating: boolean;
  qtyOf: (productId: string, variant: string | null) => number;
  /** Deja exactamente estas cantidades para el producto (0 quita la línea). */
  setProductLines: (p: { id: string; name: string; image: string; stock: number }, inputs: LineInput[]) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  dismissIssue: (key: string) => void;
  validate: () => Promise<void>;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

const Ctx = createContext<WholesaleCartType | undefined>(undefined);

function sanitizeLines(raw: unknown): WLine[] {
  if (!Array.isArray(raw)) return [];
  const out: WLine[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const pid = typeof l?.productId === 'string' ? l.productId : typeof l?.id === 'string' ? l.id : null; // v1 usaba "id"
    const qty = Number(l?.qty);
    if (!pid || !Number.isInteger(qty) || qty < 1) continue;
    const variant = typeof l.variant === 'string' && l.variant ? l.variant : null;
    out.push({
      key: lineKey(pid, variant),
      productId: pid,
      variant,
      qty: Math.min(qty, MAX_QTY),
      name: typeof l.name === 'string' ? l.name.slice(0, 200) : '',
      image: typeof l.image === 'string' ? l.image : '',
      unit: typeof l.unit === 'number' && l.unit > 0 ? l.unit : null,
      retailRef: typeof l.retailRef === 'number' && l.retailRef > 0 ? l.retailRef : null,
      stock: typeof l.stock === 'number' && l.stock >= 0 ? l.stock : null,
    });
  }
  return out;
}

function loadFor(uid: string): WLine[] {
  try {
    const raw = localStorage.getItem(wholesaleCartKey(uid));
    if (raw !== null) return sanitizeLines(JSON.parse(raw));
    // Migración del carrito v1 (sin dueño): se adopta una sola vez y se borra; el servidor revalida precios y stock
    const old = localStorage.getItem(OLD_KEY);
    if (old !== null) {
      localStorage.removeItem(OLD_KEY);
      return sanitizeLines(JSON.parse(old));
    }
  } catch {
    /* carrito dañado: se descarta */
  }
  return [];
}

export function WholesaleCartProvider({ children }: { children: ReactNode }) {
  const { session, channel, refreshWholesaler } = useChannel();
  const uid = session?.user.id ?? null;
  const [owner, setOwner] = useState<string | null>(null);
  const [lines, setLines] = useState<WLine[]>([]);
  const [issues, setIssues] = useState<Record<string, LineIssue>>({});
  const [validating, setValidating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  // Cambio de usuario: el carrito del anterior se descarta de la memoria y se carga el del nuevo
  useEffect(() => {
    setIssues({});
    setDrawerOpen(false);
    if (!uid) {
      setLines([]);
      setOwner(null);
      return;
    }
    setLines(loadFor(uid));
    setOwner(uid);
  }, [uid]);

  // Persistencia (solo cuando lo cargado pertenece al usuario actual)
  useEffect(() => {
    if (!uid || owner !== uid) return;
    try {
      localStorage.setItem(wholesaleCartKey(uid), JSON.stringify(lines));
    } catch {
      /* sin almacenamiento */
    }
  }, [lines, uid, owner]);

  const validate = useCallback(async () => {
    const snapshot = linesRef.current;
    const forUid = uidRef.current;
    if (snapshot.length === 0 || !forUid) return;
    setValidating(true);
    try {
      const ids: string[] = Array.from(new Set<string>(snapshot.map((l) => l.productId)));
      const found = new Map<string, Awaited<ReturnType<typeof fetchProductById>>>();
      let failed = false;
      for (let i = 0; i < ids.length; i += 5) {
        await Promise.all(
          ids.slice(i, i + 5).map(async (id) => {
            try {
              found.set(id, await fetchProductById(id, 'wholesale'));
            } catch {
              failed = true;
            }
          })
        );
      }
      if (uidRef.current !== forUid) return;
      // Si una consulta falló (red), no se marca nada como "no disponible": se reintenta luego
      const nextIssues: Record<string, LineIssue> = {};
      const stockByProduct = new Map<string, number>();
      const updated = linesRef.current.map((l) => {
        if (!found.has(l.productId)) return l;
        const prod = found.get(l.productId);
        if (!prod) {
          nextIssues[l.key] = { kind: 'unavailable', text: 'Ya no está disponible en el catálogo mayorista.' };
          return l;
        }
        const variants = prod.variants ?? [];
        stockByProduct.set(prod.id, prod.stock);
        let unit: number | null;
        let ref: number | null;
        if (l.variant === null) {
          if (variants.length > 0) {
            nextIssues[l.key] = { kind: 'unavailable', text: 'Este producto ahora se pide por variante: quita esta línea y elige una opción.' };
            return { ...l, name: prod.name, image: prod.image, stock: prod.stock };
          }
          unit = prod.effectivePriceCop;
          ref = prod.retailRefCop ?? null;
        } else {
          const v = variants.find((x) => x.name === l.variant);
          if (!v) {
            nextIssues[l.key] = { kind: 'unavailable', text: 'Esta opción ya no está disponible.' };
            return { ...l, name: prod.name, image: prod.image, stock: prod.stock };
          }
          unit = v.effective_price_cop ?? v.price_cop ?? null;
          ref = v.retail_effective_price_cop ?? v.retail_price_cop ?? null;
        }
        if (unit !== null && l.unit !== null && unit !== l.unit) {
          nextIssues[l.key] = { kind: 'price', text: `El precio cambió de ${formatCOP(l.unit)} a ${formatCOP(unit)} por unidad.` };
        }
        return { ...l, name: prod.name, image: prod.image, unit, retailRef: ref, stock: prod.stock };
      });
      // Tope por stock SUMANDO variantes del mismo producto
      const sums = new Map<string, number>();
      updated.forEach((l) => sums.set(l.productId, (sums.get(l.productId) ?? 0) + l.qty));
      updated.forEach((l) => {
        const stock = stockByProduct.get(l.productId);
        if (stock === undefined || nextIssues[l.key]?.kind === 'unavailable') return;
        if ((sums.get(l.productId) ?? 0) > stock) {
          nextIssues[l.key] = {
            kind: 'stock',
            text: stock <= 0 ? 'Sin stock por ahora.' : `Solo hay ${stock} unidades de este producto (entre todas sus opciones).`,
          };
        }
      });
      setLines(updated);
      setIssues((prev) => {
        // Se conserva lo que no se pudo revisar (falló la red) y se reemplaza lo demás
        const merged: Record<string, LineIssue> = {};
        // Un aviso de cambio de precio se queda hasta que el usuario lo descarte (aunque la siguiente validación ya no lo detecte)
        (Object.keys(prev) as string[]).forEach((k) => {
          if (prev[k].kind === 'price' && updated.some((x) => x.key === k)) merged[k] = prev[k];
        });
        if (failed) {
          (Object.keys(prev) as string[]).forEach((k) => {
            const v = prev[k];
            const l = updated.find((x) => x.key === k);
            if (l && !found.has(l.productId)) merged[k] = v;
          });
        }
        return { ...merged, ...nextIssues };
      });
      if (!failed && ids.some((id) => found.get(id) === null)) {
        // Un producto desapareció: por si fue porque la cuenta dejó de estar aprobada, se revisa el estado
        void refreshWholesaler();
      }
    } finally {
      setValidating(false);
    }
  }, [refreshWholesaler]);

  // Se valida al entrar al canal con líneas, al abrir el pedido y al volver a la pestaña
  const hasLines = lines.length > 0;
  const ownerReady = owner === uid && uid !== null;
  useEffect(() => {
    if (channel !== 'wholesale' || !ownerReady || !hasLines) return;
    void validate();
  }, [channel, ownerReady, hasLines, validate, drawerOpen]);
  useEffect(() => {
    if (channel !== 'wholesale') return;
    const onVisible = () => document.visibilityState === 'visible' && void validate();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [channel, validate]);

  const capFor = useCallback((all: WLine[], target: WLine): number => {
    const others = all.filter((l) => l.productId === target.productId && l.key !== target.key).reduce((s, l) => s + l.qty, 0);
    const stock = target.stock;
    return Math.min(MAX_QTY, stock === null ? MAX_QTY : Math.max(stock - others, 0));
  }, []);

  const setProductLines = useCallback<WholesaleCartType['setProductLines']>((p, inputs) => {
    setLines((prev) => {
      const rest = prev.filter((l) => l.productId !== p.id);
      const mine: WLine[] = [];
      let used = 0;
      for (const i of inputs) {
        const qty = Math.max(0, Math.min(Math.floor(i.qty), MAX_QTY, Math.max(p.stock - used, 0)));
        if (qty < 1) continue;
        used += qty;
        mine.push({
          key: lineKey(p.id, i.variant),
          productId: p.id,
          variant: i.variant,
          qty,
          name: p.name,
          image: p.image,
          unit: i.unit,
          retailRef: i.retailRef,
          stock: p.stock,
        });
      }
      return [...rest, ...mine];
    });
    setIssues((prev) => {
      const next = { ...prev };
      inputs.forEach((i) => delete next[lineKey(p.id, i.variant)]);
      return next;
    });
  }, []);

  const setQty = useCallback(
    (key: string, qty: number) => {
      setLines((prev) => {
        const target = prev.find((l) => l.key === key);
        if (!target) return prev;
        if (qty <= 0) return prev.filter((l) => l.key !== key);
        const capped = Math.min(Math.floor(qty), capFor(prev, target));
        if (capped <= 0) return prev;
        return prev.map((l) => (l.key === key ? { ...l, qty: capped } : l));
      });
      setIssues((prev) => {
        if (!prev[key] || prev[key].kind !== 'stock') return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [capFor]
  );

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setIssues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setIssues({});
  }, []);

  const dismissIssue = useCallback((key: string) => {
    setIssues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const qtyOf = useCallback((productId: string, variant: string | null) => lines.find((l) => l.key === lineKey(productId, variant))?.qty ?? 0, [lines]);

  const units = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + (l.unit ?? 0) * l.qty, 0);
  const blocked = validating || lines.some((l) => l.unit === null) || (Object.keys(issues) as string[]).some((k) => issues[k].kind !== 'price');

  const value = useMemo(
    () => ({ lines, units, total, issues, blocked, validating, qtyOf, setProductLines, setQty, remove, clear, dismissIssue, validate, drawerOpen, setDrawerOpen }),
    [lines, units, total, issues, blocked, validating, qtyOf, setProductLines, setQty, remove, clear, dismissIssue, validate, drawerOpen]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWholesaleCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWholesaleCart must be used within a WholesaleCartProvider');
  return ctx;
}
