import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Product } from '../context/AppContext';
import { useWholesaleCart, type LineInput } from '../context/WholesaleCartContext';
import { formatCOP, wholesaleSavings } from '../lib/pricing';

interface Row {
  variant: string | null;
  label: string;
  unit: number;
  retailRef: number | null;
}

/** Filas pedibles del producto: una por variante visible, o una sola si no tiene variantes. */
export function wholesaleRows(product: Product): Row[] {
  const variants = product.variants ?? [];
  if (variants.length > 0) {
    return variants
      .map((v) => ({
        variant: v.name,
        label: v.name,
        unit: v.effective_price_cop ?? v.price_cop ?? 0,
        retailRef: v.retail_effective_price_cop ?? v.retail_price_cop ?? null,
      }))
      .filter((r) => r.unit > 0);
  }
  return [{ variant: null, label: product.name, unit: product.effectivePriceCop, retailRef: product.retailRefCop ?? null }];
}

const stepBtn =
  'size-11 shrink-0 flex items-center justify-center border border-black/20 bg-ivory text-ink hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed';

/**
 * Matriz de cantidades por variante (mayorista). En móvil cada variante es una tarjeta apilada: sin scroll lateral.
 * El tope de stock suma TODAS las variantes del producto.
 */
export default function WholesaleProductPanel({ product, onDone }: { product: Product; onDone: () => void }) {
  const cart = useWholesaleCart();
  const rows = useMemo(() => wholesaleRows(product), [product]);
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.variant ?? '', cart.qtyOf(product.id, r.variant)]))
  );
  const hadLines = rows.some((r) => cart.qtyOf(product.id, r.variant) > 0);
  const stock = product.stock;
  const used = rows.reduce((s, r) => s + (qtys[r.variant ?? ''] ?? 0), 0);
  const left = Math.max(stock - used, 0);
  const subtotal = rows.reduce((s, r) => s + r.unit * (qtys[r.variant ?? ''] ?? 0), 0);
  const from = rows.length ? Math.min(...rows.map((r) => r.unit)) : 0;
  const fromRef = rows.find((r) => r.unit === from)?.retailRef ?? null;
  const headSavings = wholesaleSavings(fromRef, from);

  const set = (k: string, next: number) =>
    setQtys((q) => {
      const others = rows.reduce((s, r) => ((r.variant ?? '') === k ? s : s + (q[r.variant ?? ''] ?? 0)), 0);
      const capped = Math.max(0, Math.min(Math.floor(Number.isFinite(next) ? next : 0), 999, Math.max(stock - others, 0)));
      return { ...q, [k]: capped };
    });

  const save = () => {
    const inputs: LineInput[] = rows.map((r) => ({ variant: r.variant, qty: qtys[r.variant ?? ''] ?? 0, unit: r.unit, retailRef: r.retailRef }));
    cart.setProductLines({ id: product.id, name: product.name, image: product.image, stock }, inputs);
    onDone();
  };

  return (
    <div data-testid="wholesale-panel">
      <p className="mb-5">
        <span className="text-xs text-black/60 mr-1">{rows.length > 1 ? 'Desde' : 'Precio mayorista'}</span>
        <span className="text-xl text-gold-dark font-semibold">{formatCOP(from)}</span>
        {fromRef !== null && fromRef > from && <span className="ml-3 text-black/45 line-through text-sm">Detal {formatCOP(fromRef)}</span>}
        {headSavings && <span className="block text-xs text-green-800 mt-1">Ahorras {formatCOP(headSavings.cop)} ({headSavings.pct}%) por unidad frente al detal</span>}
      </p>

      <h3 className="text-xs uppercase tracking-widest text-ink font-semibold mb-3">{rows.length > 1 ? 'Cantidades por opción' : 'Cantidad'}</h3>
      <ul className="space-y-3 mb-4">
        {rows.map((r) => {
          const k = r.variant ?? '';
          const qty = qtys[k] ?? 0;
          const sv = wholesaleSavings(r.retailRef, r.unit);
          return (
            <li key={k || 'base'} className="border border-black/10 bg-white p-3 flex flex-wrap items-center justify-between gap-3" data-testid="wholesale-row">
              <div className="min-w-0 flex-1 basis-40">
                {r.variant && <p className="text-sm text-ink font-medium break-words">{r.variant}</p>}
                <p className="text-sm text-gold-dark font-semibold">
                  {formatCOP(r.unit)}
                  {r.retailRef !== null && r.retailRef > r.unit && <span className="ml-2 text-black/45 line-through text-xs font-normal">Detal {formatCOP(r.retailRef)}</span>}
                </p>
                {sv && <p className="text-[11px] text-green-800">Ahorras {formatCOP(sv.cop)} ({sv.pct}%)</p>}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className={stepBtn} onClick={() => set(k, qty - 1)} disabled={qty <= 0} aria-label={`Disminuir ${r.variant ?? product.name}`}>
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={Math.min(999, qty + left)}
                  value={qty}
                  onChange={(e) => set(k, parseInt(e.target.value, 10))}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={`Cantidad de ${r.variant ?? product.name}`}
                  className="w-14 min-h-11 text-center border border-black/20 bg-ivory text-sm focus:outline-none focus:border-gold-dark"
                />
                <button type="button" className={stepBtn} onClick={() => set(k, qty + 1)} disabled={left <= 0} aria-label={`Aumentar ${r.variant ?? product.name}`}>
                  <Plus size={16} />
                </button>
              </div>
              <p className="basis-full text-right text-sm text-black/70" data-testid="row-subtotal">
                Subtotal: <span className="font-medium text-ink">{formatCOP(r.unit * qty)}</span>
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-black/60 mb-4">
        {stock <= 0 ? 'Agotado' : `Disponible: ${stock} unidades${rows.length > 1 ? ' en total (se comparten entre las opciones)' : ''}. Te quedan ${left} por añadir.`}
      </p>

      <div className="flex items-center justify-between border-t border-black/10 pt-4 mb-4">
        <span className="text-sm text-black/70">{used} {used === 1 ? 'unidad' : 'unidades'}</span>
        <span className="font-serif text-xl text-ink" data-testid="panel-total">{formatCOP(subtotal)}</span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={stock <= 0 || (used === 0 && !hadLines)}
        className="w-full py-3 min-h-11 uppercase tracking-widest text-xs font-semibold bg-ink text-ivory hover:bg-gold-dark transition-colors disabled:opacity-40"
      >
        {used === 0 && hadLines ? 'Quitar del pedido' : hadLines ? 'Actualizar pedido' : 'Añadir al pedido'}
      </button>
    </div>
  );
}
