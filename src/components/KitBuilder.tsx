import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, MessageCircle, Minus, Plus, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatCOP } from '../lib/pricing';
import { whatsappLink } from '../lib/config';
import { sanitizePhone, sanitizeString, readSafeLocalStorage, writeSafeLocalStorage } from '../lib/sanitize';
import { useDialog } from '../lib/useDialog';
import {
  buildKitWhatsapp,
  canAddPiece,
  createKitOrder,
  errorText,
  kitOrderErrorMessage,
  kitTotal,
  loadKitDraft,
  reconcileSelection,
  saveKitDraft,
  useKitCatalog,
  type KitPiece,
  type KitSelection,
} from '../lib/kit';
import StickyBuyBar from './StickyBuyBar';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 bg-ink text-ivory px-6 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 border border-ink text-ink px-6 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ink hover:text-ivory transition-colors';
const stepBtn = 'size-11 inline-flex items-center justify-center border border-black/20 bg-ivory text-ink hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed';

function BudgetBar({ total, cap }: { total: number; cap: number }) {
  const pct = Math.min(100, Math.round((total / cap) * 100));
  const full = total >= cap;
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Total de tu kit frente al tope"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={Math.min(total, cap)}
        aria-valuetext={`${formatCOP(total)} de ${formatCOP(cap)}`}
        className="h-2 bg-black/10 overflow-hidden"
      >
        <div className={`h-full ${pct >= 90 ? 'bg-gold-ink' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-black/70">
        Llevas <strong className="text-ink">{formatCOP(total)}</strong> de {formatCOP(cap)} · {full ? '¡Tope alcanzado!' : `te quedan ${formatCOP(cap - total)}`}
      </p>
    </div>
  );
}

function PieceCard({ piece, qty, total, cap, sel, onChange }: { key?: string; piece: KitPiece; qty: number; total: number; cap: number; sel: KitSelection; onChange: (q: number) => void }) {
  const add = canAddPiece(piece, sel, total, cap);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <li data-testid="kit-piece" className="border border-black/10 bg-ivory flex flex-col">
      <div className="relative aspect-square bg-surface">
        {piece.image && !imgFailed ? (
          <img src={piece.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-black/40" aria-hidden>
            <ImageOff size={28} />
          </span>
        )}
        {qty > 0 && <span className="absolute top-2 right-2 bg-ink text-gold text-[11px] font-semibold px-2 py-1">{qty} en tu kit</span>}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <h3 className="font-serif text-base leading-snug text-ink">{piece.name}</h3>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-gold-ink">{formatCOP(piece.specialPriceCop)}</span>
          {piece.normalPriceCop > piece.specialPriceCop && (
            <s className="text-xs text-black/65">
              <span className="sr-only">Precio normal </span>
              {formatCOP(piece.normalPriceCop)}
            </s>
          )}
        </p>
        <div className="mt-auto">
          {qty === 0 ? (
            <button type="button" onClick={() => add.ok && onChange(1)} aria-disabled={!add.ok} className={`${secondaryBtn} w-full ${add.ok ? '' : 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-ink'}`}>
              Agregar
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <button type="button" className={stepBtn} onClick={() => onChange(qty - 1)} aria-label={`Quitar una unidad de ${piece.name}`}>
                <Minus size={16} aria-hidden />
              </button>
              <span aria-live="polite" className="min-w-8 text-center font-medium">{qty}</span>
              <button type="button" className={stepBtn} onClick={() => onChange(qty + 1)} disabled={!add.ok} aria-label={`Agregar una unidad de ${piece.name}`}>
                <Plus size={16} aria-hidden />
              </button>
            </div>
          )}
          {!add.ok && add.reason && <p className="mt-1 text-xs text-black/65">{add.reason}</p>}
        </div>
      </div>
    </li>
  );
}

function OrderDialog({ pieces, sel, total, cap, onClose, onDone }: { pieces: KitPiece[]; sel: KitSelection; total: number; cap: number; onClose: () => void; onDone: () => void }) {
  const { userName } = useAppContext();
  const panelRef = useDialog<HTMLDivElement>(true, onClose);
  const [name, setName] = useState(userName ?? '');
  const [phone, setPhone] = useState(readSafeLocalStorage('user_whatsapp', 20) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = pieces.filter((p) => (sel[p.productId] ?? 0) > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanName = sanitizeString(name, 100);
    const cleanPhone = sanitizePhone(phone);
    if (cleanName.length < 2) return setError('Escribe tu nombre completo.');
    if (cleanPhone.replace(/\D/g, '').length < 7) return setError('El número de WhatsApp no es válido.');
    // Se abre la ventana ahora (gesto del usuario, necesario en iOS) y se redirige al terminar
    const popup = window.open('about:blank', '_blank');
    setBusy(true);
    try {
      const order = await createKitOrder({ name: cleanName, phone: cleanPhone }, sel);
      writeSafeLocalStorage('user_whatsapp', cleanPhone);
      const url = whatsappLink(buildKitWhatsapp(cleanName, order));
      if (popup) {
        popup.opener = null;
        popup.location.href = url;
      } else {
        window.location.href = url;
      }
      onDone();
    } catch (err) {
      popup?.close();
      setError(kitOrderErrorMessage(errorText(err)));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="kit-dialog-title" className="relative w-full sm:max-w-lg bg-ivory max-h-[92vh] overflow-y-auto p-6">
        <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-2 right-2 size-11 inline-flex items-center justify-center text-black/65 hover:text-ink">
          <X size={22} aria-hidden />
        </button>
        <h2 id="kit-dialog-title" className="font-serif text-2xl text-ink mb-4">Tu kit</h2>
        <ul className="divide-y divide-black/10 mb-4">
          {chosen.map((p) => (
            <li key={p.productId} className="py-2 flex justify-between gap-3 text-sm">
              <span>{sel[p.productId]}× {p.name}</span>
              <span className="font-medium">{formatCOP(p.specialPriceCop * sel[p.productId])}</span>
            </li>
          ))}
        </ul>
        <BudgetBar total={total} cap={cap} />
        <p className="text-xs text-black/65 mt-2">El envío no está incluido; lo coordinamos por WhatsApp.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm">
            Tu nombre
            <input data-autofocus className="w-full border border-black/20 bg-ivory px-3 min-h-11 text-sm focus:outline-none focus:border-gold-dark" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" required />
          </label>
          <label className="block text-sm">
            Tu WhatsApp
            <input className="w-full border border-black/20 bg-ivory px-3 min-h-11 text-sm focus:outline-none focus:border-gold-dark" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} autoComplete="tel" required />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
            <MessageCircle size={16} aria-hidden /> {busy ? 'Enviando…' : 'Pedir por WhatsApp'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** "Arma tu kit": el comprador elige piezas con precio especial hasta el tope; el servidor valida el total. */
export default function KitBuilder() {
  const { catalog, loading, error, reload } = useKitCatalog();
  const [sel, setSel] = useState<KitSelection>({});
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const restored = useRef(false);

  // Borrador guardado: se ajusta al stock, al tope y a los precios vigentes
  useEffect(() => {
    if (!catalog || restored.current) return;
    restored.current = true;
    setSel(reconcileSelection(loadKitDraft(), catalog.pieces, catalog.capCop));
  }, [catalog]);

  useEffect(() => {
    if (restored.current) saveKitDraft(sel);
  }, [sel]);

  const pieces = catalog?.pieces ?? [];
  const cap = catalog?.capCop ?? 0;
  const total = useMemo(() => kitTotal(sel, pieces), [sel, pieces]);
  const categories = useMemo(() => Array.from(new Set(pieces.map((p) => p.category).filter((c): c is string => !!c))).sort(), [pieces]);
  const shown = category ? pieces.filter((p) => p.category === category) : pieces;
  const count = Object.values(sel as KitSelection).reduce((a: number, b: number) => a + b, 0);

  const setQty = (id: string, q: number) =>
    setSel((s) => {
      const next = { ...s };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });

  const askWhatsapp = whatsappLink('Hola, quiero armar mi Kit Emprendedor. ¿Me ayudan?');

  return (
    <div id="arma-tu-kit">
      {loading && <p role="status" className="text-black/65 text-center py-10">Cargando las piezas del kit…</p>}

      {error && (
        <div role="alert" className="text-center py-10 space-y-4">
          <p className="text-black/70">No pudimos cargar las piezas del kit.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={reload} className={secondaryBtn}>Reintentar</button>
            <a href={askWhatsapp} target="_blank" rel="noopener noreferrer" className={primaryBtn}><MessageCircle size={16} aria-hidden /> Escríbenos por WhatsApp</a>
          </div>
        </div>
      )}

      {catalog && pieces.length === 0 && (
        <div className="text-center py-10 space-y-4">
          <p className="text-black/70">Estamos armando las piezas del kit. Escríbenos y te ayudamos con tu pedido.</p>
          <a href={askWhatsapp} target="_blank" rel="noopener noreferrer" className={primaryBtn}><MessageCircle size={16} aria-hidden /> Escríbenos por WhatsApp</a>
        </div>
      )}

      {catalog && pieces.length > 0 && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div>
            {categories.length > 1 && (
              <div role="group" aria-label="Filtrar por colección" className="flex flex-wrap gap-2 mb-5">
                {[null, ...categories].map((c) => (
                  <button
                    key={c ?? 'all'}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`min-h-11 px-4 text-xs uppercase tracking-wider border ${category === c ? 'bg-ink text-ivory border-ink' : 'border-black/20 text-ink hover:bg-surface'}`}
                  >
                    {c ?? 'Todo'}
                  </button>
                ))}
              </div>
            )}
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {shown.map((p) => (
                <PieceCard key={p.productId} piece={p} qty={sel[p.productId] ?? 0} total={total} cap={cap} sel={sel} onChange={(q) => setQty(p.productId, q)} />
              ))}
            </ul>
          </div>

          {/* Resumen (escritorio) */}
          <aside className="hidden lg:block lg:sticky lg:top-28 border border-black/10 bg-ivory p-5 space-y-4" aria-label="Resumen de tu kit">
            <h3 className="font-serif text-xl">Tu kit</h3>
            <BudgetBar total={total} cap={cap} />
            {count === 0 ? <p className="text-sm text-black/65">Aún no eliges piezas.</p> : <p className="text-sm text-black/65">{count} {count === 1 ? 'pieza' : 'piezas'} elegidas</p>}
            <button type="button" disabled={count === 0} onClick={() => setOpen(true)} className={`${primaryBtn} w-full`}>Ver mi kit y pedir</button>
            <p className="text-xs text-black/65">El envío no está incluido.</p>
          </aside>
        </div>
      )}

      {done && <p role="status" className="mt-6 text-center text-green-800">¡Listo! Abrimos WhatsApp con tu pedido. Si no se abrió, escríbenos y lo revisamos.</p>}

      {catalog && pieces.length > 0 && (
        <StickyBuyBar watchId="kit-hero-cta" label={count ? `${count} ${count === 1 ? 'pieza' : 'piezas'} en tu kit` : 'Tu kit'} price={formatCOP(total)}>
          {count > 0 ? (
            <button type="button" onClick={() => setOpen(true)} className={`${primaryBtn} px-5`}>Ver mi kit</button>
          ) : (
            <a href="#arma-tu-kit" className={`${primaryBtn} px-5`}>Elegir piezas</a>
          )}
        </StickyBuyBar>
      )}

      {open && catalog && (
        <OrderDialog
          pieces={pieces}
          sel={sel}
          total={total}
          cap={cap}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setSel({});
            saveKitDraft({});
            setDone(true);
          }}
        />
      )}
    </div>
  );
}
