import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, MessageCircle, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useChannel } from '../context/ChannelContext';
import { useWholesaleCart, type WLine } from '../context/WholesaleCartContext';
import { fetchWholesaleMin, useWholesaleMin } from '../lib/wholesale';
import { formatCOP, orderErrorMessage, wholesaleSavings } from '../lib/pricing';
import { sanitizeString, sanitizePhone } from '../lib/sanitize';
import { whatsappLink } from '../lib/config';

interface OrderResult {
  total: number;
  lines: { name: string; variant: string | null; qty: number; unit_price: number }[];
}

const stepBtn = 'size-11 flex items-center justify-center border border-black/20 bg-ivory text-ink hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed';
const issueBtn = 'min-h-11 px-3 border border-red-300 text-red-700 hover:bg-red-50';

/** Pedido mayorista: líneas agrupadas por producto, stepper, avisos de disponibilidad y envío por WhatsApp. */
export default function WholesaleCartDrawer() {
  const { wholesaler, refreshWholesaler } = useChannel();
  const cart = useWholesaleCart();
  const { min } = useWholesaleMin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { drawerOpen, setDrawerOpen } = cart;

  useEffect(() => {
    if (!drawerOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus();
    };
  }, [drawerOpen, setDrawerOpen]);

  const groups = useMemo(() => {
    const map = new Map<string, WLine[]>();
    cart.lines.forEach((l) => map.set(l.productId, [...(map.get(l.productId) ?? []), l]));
    return Array.from(map.values());
  }, [cart.lines]);

  if (!drawerOpen) return null;

  const missing = Math.max(min - cart.total, 0);
  const empty = cart.lines.length === 0;
  const blockingIssue = (Object.keys(cart.issues) as string[]).some((k) => cart.issues[k].kind !== 'price');
  const reason = empty
    ? 'Añade productos para poder enviar tu pedido.'
    : cart.validating
      ? 'Verificando precios y disponibilidad…'
      : blockingIssue
        ? 'Resuelve los avisos de arriba (quita o ajusta las líneas) para poder enviar.'
        : cart.lines.some((l) => l.unit === null)
          ? 'No pudimos verificar los precios todavía. Revisa tu conexión e intenta de nuevo.'
          : missing > 0
            ? `Te faltan ${formatCOP(missing)} para el pedido mínimo de ${formatCOP(min)}.`
            : null;
  const canSend = reason === null && !busy;

  const checkout = async () => {
    setError(null);
    const popup = window.open('about:blank', '_blank');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc('create_order', {
        p_channel: 'wholesale',
        // El servidor toma nombre y teléfono del perfil del mayorista; esto es solo respaldo
        p_customer: { name: sanitizeString(wholesaler?.business_name || 'Mayorista', 100), phone: sanitizePhone(wholesaler?.phone || '') },
        p_lines: cart.lines.map((l) => ({ product_id: l.productId, variant: l.variant, qty: l.qty })),
      });
      if (err) throw err;
      const order = data as OrderResult;
      let msg = `¡Hola! Soy ${sanitizeString(wholesaler?.business_name || '', 100)} (mayorista). Quiero hacer este pedido:\n\n`;
      order.lines.forEach((l) => {
        msg += `${l.qty}x ${sanitizeString(l.name, 100)}${l.variant ? ` (${sanitizeString(l.variant, 50)})` : ''} - ${formatCOP(l.unit_price)}\n`;
      });
      msg += `\n*Total: ${formatCOP(order.total)}*`;
      if (popup) {
        popup.opener = null;
        popup.location.href = whatsappLink(msg);
      } else window.location.href = whatsappLink(msg);
      cart.clear();
      setDrawerOpen(false);
    } catch (e) {
      popup?.close();
      const raw = e instanceof Error ? e.message : (e as { message?: string })?.message;
      setError(orderErrorMessage(raw, 'wholesale'));
      const code = (raw ?? '').split(':')[0];
      if (code === 'NOT_WHOLESALER') void refreshWholesaler(); // suspendida o revocada durante la sesión
      else if (code === 'MIN_WHOLESALE') void fetchWholesaleMin(true).catch(() => undefined);
      else if (['OUT_OF_STOCK', 'NOT_IN_CHANNEL', 'VARIANT_REQUIRED', 'VARIANT_NOT_FOUND', 'PRODUCT_NOT_FOUND'].includes(code)) void cart.validate();
    } finally {
      setBusy(false);
    }
  };

  const adjustTo = (l: WLine, group: WLine[]) => {
    const others = group.filter((x) => x.key !== l.key).reduce((s, x) => s + x.qty, 0);
    const room = Math.max((l.stock ?? 0) - others, 0);
    if (room <= 0) cart.remove(l.key);
    else cart.setQty(l.key, room);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setDrawerOpen(false)} />
      <div role="dialog" aria-modal="true" aria-label="Mi pedido mayorista" className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-ivory z-[70] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-black/10">
          <h2 className="font-serif text-2xl text-ink">Mi pedido</h2>
          <button ref={closeRef} onClick={() => setDrawerOpen(false)} className="p-2 -m-2 text-black/50 hover:text-ink" aria-label="Cerrar pedido">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {empty ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-black/60">Aún no has añadido productos a tu pedido.</p>
              <Link to="/catalogo" onClick={() => setDrawerOpen(false)} className="inline-flex items-center justify-center min-h-11 px-6 border border-ink text-xs uppercase tracking-widest hover:bg-ink hover:text-ivory transition-colors">
                Ir al catálogo
              </Link>
            </div>
          ) : (
            <ul className="space-y-6">
              {groups.map((g) => (
                <li key={g[0].productId} className="border border-black/10 bg-white p-3" data-testid="order-group">
                  <div className="flex gap-3 mb-3">
                    <div className="size-16 bg-surface shrink-0 overflow-hidden">
                      {g[0].image && <img src={g[0].image} alt="" width={64} height={64} className="size-full object-cover" referrerPolicy="no-referrer" />}
                    </div>
                    <p className="font-serif text-sm text-ink self-center break-words min-w-0">{g[0].name || 'Producto'}</p>
                  </div>
                  <ul className="space-y-4">
                    {g.map((l) => {
                      const issue = cart.issues[l.key];
                      const sv = l.unit !== null ? wholesaleSavings(l.retailRef, l.unit) : null;
                      const label = `${l.name}${l.variant ? ` ${l.variant}` : ''}`;
                      return (
                        <li key={l.key} data-testid="order-line" className={issue && issue.kind !== 'price' ? 'bg-amber-50/60 p-2 -m-2' : ''}>
                          {issue && (
                            <div role="alert" className={`mb-2 text-xs flex flex-wrap items-center gap-2 ${issue.kind === 'price' ? 'text-amber-900' : 'text-red-800'}`}>
                              <AlertTriangle size={14} aria-hidden />
                              <span className="flex-1 min-w-0">{issue.text}</span>
                              {issue.kind === 'unavailable' && (
                                <button type="button" onClick={() => cart.remove(l.key)} className={issueBtn}>Quitar</button>
                              )}
                              {issue.kind === 'stock' && (
                                <>
                                  <button type="button" onClick={() => adjustTo(l, g)} className={issueBtn}>Ajustar</button>
                                  <button type="button" onClick={() => cart.remove(l.key)} className={issueBtn}>Quitar</button>
                                </>
                              )}
                              {issue.kind === 'price' && (
                                <button type="button" onClick={() => cart.dismissIssue(l.key)} className="min-h-11 px-3 border border-amber-400 hover:bg-amber-100">Entendido</button>
                              )}
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              {l.variant && <p className="text-ink break-words">{l.variant}</p>}
                              <p className="text-gold-dark font-medium">
                                {l.unit !== null ? formatCOP(l.unit) : '—'}
                                {l.retailRef !== null && l.unit !== null && l.retailRef > l.unit && <span className="ml-2 text-black/45 line-through text-xs font-normal">Detal {formatCOP(l.retailRef)}</span>}
                              </p>
                              {sv && <p className="text-[11px] text-green-800">Ahorras {formatCOP(sv.cop * l.qty)} en esta línea</p>}
                            </div>
                            <button type="button" onClick={() => cart.remove(l.key)} className="size-11 -mt-2 -mr-2 flex items-center justify-center text-black/40 hover:text-red-600" aria-label={`Quitar ${label} del pedido`}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1">
                              <button type="button" className={stepBtn} onClick={() => cart.setQty(l.key, l.qty - 1)} aria-label={`Disminuir ${label}`}>
                                <Minus size={14} />
                              </button>
                              <span className="w-10 text-center text-sm font-medium" data-testid="line-qty" aria-live="polite">{l.qty}</span>
                              <button
                                type="button"
                                className={stepBtn}
                                onClick={() => cart.setQty(l.key, l.qty + 1)}
                                disabled={l.stock !== null && g.reduce((s, x) => s + x.qty, 0) >= l.stock}
                                aria-label={`Aumentar ${label}`}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <span className="text-sm font-medium text-ink" data-testid="line-subtotal">{formatCOP((l.unit ?? 0) * l.qty)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!empty && (
          <div className="p-5 border-t border-black/10 bg-surface">
            <div className="flex justify-between items-center mb-3">
              <span className="text-black/60 text-sm">Total ({cart.units} {cart.units === 1 ? 'unidad' : 'unidades'})</span>
              <span className="font-serif text-xl text-ink" data-testid="drawer-total">{formatCOP(cart.total)}</span>
            </div>
            {reason && <p data-testid="send-reason" className="text-sm text-gold-dark mb-3">{reason}</p>}
            {!reason && <p className="text-sm text-green-800 mb-3">Alcanzaste el pedido mínimo. El total final lo valida el servidor.</p>}
            {error && <div role="alert" className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
            <button
              type="button"
              onClick={checkout}
              disabled={!canSend}
              className="w-full min-h-11 py-3 bg-[#1f8f4a] text-white uppercase tracking-widest text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#187a3e] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageCircle size={16} aria-hidden /> {busy ? 'Procesando…' : 'Enviar pedido por WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
