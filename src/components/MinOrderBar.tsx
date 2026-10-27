import { useEffect, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useWholesaleCart } from '../context/WholesaleCartContext';
import { useWholesaleMin } from '../lib/wholesale';
import { formatCOP } from '../lib/pricing';

/**
 * Barra fija inferior del mayorista: progreso hacia el pedido mínimo. El aviso para lectores de pantalla (aria-live)
 * solo cambia al CRUZAR el umbral, no con cada unidad que se añade.
 */
export default function MinOrderBar() {
  const { total, units, setDrawerOpen, validating } = useWholesaleCart();
  const { min } = useWholesaleMin();
  const reached = total >= min && units > 0;
  const missing = Math.max(min - total, 0);
  const pct = min > 0 ? Math.min(Math.round((total / min) * 100), 100) : 100;

  const [announce, setAnnounce] = useState('');
  const first = useRef(true);
  const prev = useRef(reached);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = reached;
      return;
    }
    if (prev.current !== reached) {
      prev.current = reached;
      setAnnounce(reached ? 'Alcanzaste el pedido mínimo. Ya puedes enviar tu pedido.' : `Estás por debajo del pedido mínimo de ${formatCOP(min)}.`);
    }
  }, [reached, min]);

  return (
    <div
      data-testid="min-order-bar"
      className="fixed bottom-0 inset-x-0 z-40 bg-ivory border-t border-black/15 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3 sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 text-xs sm:text-sm mb-1.5">
            <span className="text-ink font-medium truncate">
              {units} {units === 1 ? 'unidad' : 'unidades'} · <span data-testid="bar-total">{formatCOP(total)}</span>
            </span>
            <span className={`shrink-0 ${reached ? 'text-green-800' : 'text-gold-dark'}`} data-testid="bar-status">
              {reached ? 'Mínimo alcanzado' : `Faltan ${formatCOP(missing)}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Progreso hacia el pedido mínimo de ${formatCOP(min)}`}
            aria-valuemin={0}
            aria-valuemax={min}
            aria-valuenow={Math.min(total, min)}
            aria-valuetext={`${formatCOP(Math.min(total, min))} de ${formatCOP(min)}`}
            className="h-1.5 bg-black/10 overflow-hidden"
          >
            <div className={`h-full transition-[width] duration-300 motion-reduce:transition-none ${reached ? 'bg-green-700' : 'bg-gold-dark'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="hidden sm:block text-[11px] text-black/55 mt-1">Pedido mínimo: {formatCOP(min)}{validating ? ' · verificando precios…' : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 bg-ink text-ivory px-4 sm:px-6 min-h-11 text-xs uppercase tracking-[0.18em] font-semibold hover:bg-gold-dark transition-colors"
        >
          <ShoppingBag size={16} aria-hidden /> Ver pedido
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
    </div>
  );
}
