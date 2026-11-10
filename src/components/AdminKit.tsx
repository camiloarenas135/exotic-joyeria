import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ImageOff, Plus, Save, Search, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCOP } from '../lib/pricing';
import { sanitizeSearchQuery } from '../lib/sanitize';
import {
  adminKitList,
  adminKitRemove,
  adminKitSetCap,
  adminKitUpsert,
  errorText,
  kitAdminErrorMessage,
  type AdminKitPiece,
} from '../lib/kit';

interface FoundProduct {
  id: string;
  name: string;
  price_cop: number | null;
  stock: number | null;
  variants: unknown;
  images: string[] | null;
}

type Notice = { kind: 'success' | 'error'; text: string };

const toInt = (s: string): number => {
  const digits = s.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : NaN;
};

const input = 'border border-black/20 bg-ivory px-3 min-h-11 text-sm focus:outline-none focus:border-gold-dark';
const btn = 'inline-flex items-center justify-center gap-2 min-h-11 px-4 text-xs uppercase tracking-wider font-medium transition-colors disabled:opacity-50';

/** Admin del Emprendedor: tope, piezas habilitadas y su precio especial (por producto). */
export default function AdminKit() {
  const [cap, setCap] = useState<number>(500000);
  const [capDraft, setCapDraft] = useState('');
  const [pieces, setPieces] = useState<AdminKitPiece[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [term, setTerm] = useState('');
  const [found, setFound] = useState<FoundProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [newPrice, setNewPrice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const r = await adminKitList();
      setCap(r.capCop);
      setCapDraft(String(r.capCop));
      setPieces(r.pieces);
      setDrafts(Object.fromEntries(r.pieces.map((p) => [p.productId, String(p.specialPriceCop)])));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<void>, okText: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'success', text: okText });
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: kitAdminErrorMessage(errorText(err)) });
    } finally {
      setBusy(null);
    }
  };

  const saveCap = () => {
    const n = toInt(capDraft);
    if (!Number.isFinite(n) || n < 1) return setNotice({ kind: 'error', text: 'Escribe un tope válido (número entero mayor a 0).' });
    void run('cap', () => adminKitSetCap(n), 'Tope actualizado.');
  };

  const search = async () => {
    const q = sanitizeSearchQuery(term, 80);
    if (q.length < 2) return setFound([]);
    setSearching(true);
    const { data, error } = await supabase.from('products').select('id,name,price_cop,stock,variants,images').ilike('name', `%${q}%`).order('name').limit(12);
    setSearching(false);
    if (error) return setNotice({ kind: 'error', text: 'No pudimos buscar productos. Intenta de nuevo.' });
    setFound((data ?? []) as FoundProduct[]);
  };

  const inKit = useMemo(() => new Set(pieces.map((p) => p.productId)), [pieces]);
  const cheapest = useMemo(() => {
    const ok = pieces.filter((p) => p.enabled && (p.stock ?? 0) > 0 && !p.hasVariants);
    return ok.length ? Math.min(...ok.map((p) => p.specialPriceCop)) : null;
  }, [pieces]);

  const hasVariants = (p: FoundProduct) => Array.isArray(p.variants) && p.variants.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl text-ink">Emprendedor</h2>
        <p className="text-sm text-black/65 mt-1">
          El comprador arma su kit con las piezas que habilites aquí, a su precio especial. El total nunca puede superar el tope. El envío no está incluido.
        </p>
      </div>

      <div aria-live="polite">
        {notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`text-sm px-4 py-3 border ${notice.kind === 'error' ? 'border-red-300 text-red-700 bg-red-50' : 'border-green-300 text-green-800 bg-green-50'}`}>
            {notice.text}
          </p>
        )}
      </div>

      {/* Tope */}
      <section className="border border-black/10 p-4 sm:p-6 space-y-3">
        <h3 className="text-sm uppercase tracking-wider font-medium">Tope del kit</h3>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="text-sm flex-1 max-w-xs">
            Total máximo (COP)
            <input className={`${input} w-full`} inputMode="numeric" value={capDraft} onChange={(e) => setCapDraft(e.target.value)} aria-describedby="kit-cap-help" />
          </label>
          <button type="button" onClick={saveCap} disabled={busy === 'cap' || toInt(capDraft) === cap} className={`${btn} bg-ink text-ivory hover:bg-gold-dark`}>
            <Save size={16} aria-hidden /> Guardar tope
          </button>
        </div>
        <p id="kit-cap-help" className="text-xs text-black/65">
          Hoy: {formatCOP(cap)}. Ninguna pieza puede costar más que el tope.
          {cheapest !== null ? ` Con las piezas activas, la pieza más barata del kit cuesta ${formatCOP(cheapest)}.` : ' No hay piezas activas con stock: el comprador verá el kit vacío.'}
        </p>
      </section>

      {/* Agregar */}
      <section className="border border-black/10 p-4 sm:p-6 space-y-4">
        <h3 className="text-sm uppercase tracking-wider font-medium">Agregar una pieza</h3>
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          role="search"
        >
          <input className={`${input} flex-1`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Busca un producto por nombre" aria-label="Buscar producto" maxLength={80} />
          <button type="submit" disabled={searching} className={`${btn} border border-ink text-ink hover:bg-ink hover:text-ivory`}>
            <Search size={16} aria-hidden /> Buscar
          </button>
        </form>
        {found.length > 0 && (
          <ul className="divide-y divide-black/10 border border-black/10">
            {found.map((p) => {
              const blocked = hasVariants(p) ? 'Tiene variantes: no puede entrar al kit' : p.price_cop == null ? 'Sin precio normal' : inKit.has(p.id) ? 'Ya está en el kit' : null;
              const val = newPrice[p.id] ?? (p.price_cop != null ? String(p.price_cop) : '');
              return (
                <li key={p.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-black/65">
                      Precio normal {p.price_cop != null ? formatCOP(p.price_cop) : '—'} · Stock {p.stock ?? 0}
                    </p>
                  </div>
                  {blocked ? (
                    <p className="text-xs text-black/65">{blocked}</p>
                  ) : (
                    <div className="flex gap-2 items-end">
                      <label className="text-xs">
                        Precio especial
                        <input className={`${input} w-32 block`} inputMode="numeric" value={val} onChange={(e) => setNewPrice((m) => ({ ...m, [p.id]: e.target.value }))} />
                      </label>
                      <button
                        type="button"
                        disabled={busy === `add-${p.id}`}
                        onClick={() => {
                          const n = toInt(val);
                          if (!Number.isFinite(n) || n < 1) return setNotice({ kind: 'error', text: 'Escribe un precio especial válido.' });
                          void run(`add-${p.id}`, () => adminKitUpsert(p.id, n, true, pieces.length), `${p.name} se agregó al kit.`);
                        }}
                        className={`${btn} bg-ink text-ivory hover:bg-gold-dark`}
                      >
                        <Plus size={16} aria-hidden /> Agregar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Piezas */}
      <section className="space-y-3">
        <h3 className="text-sm uppercase tracking-wider font-medium">Piezas del kit ({pieces.length})</h3>
        {loading && <p role="status" className="text-black/65">Cargando…</p>}
        {loadError && (
          <p role="alert" className="text-red-700 text-sm">
            No pudimos cargar el kit. <button className="underline" onClick={() => void load()}>Reintentar</button>
          </p>
        )}
        {!loading && !loadError && pieces.length === 0 && <p className="text-black/65 text-sm">Aún no hay piezas. Busca un producto arriba y agrégalo.</p>}
        <ul className="space-y-3">
          {pieces.map((p) => {
            const draft = drafts[p.productId] ?? String(p.specialPriceCop);
            const n = toInt(draft);
            const invalid = !Number.isFinite(n) || n < 1 || (p.normalPriceCop != null && n > p.normalPriceCop) || n > cap;
            const dirty = n !== p.specialPriceCop;
            const warn = p.hasVariants ? 'Ahora tiene variantes: no se muestra en el kit' : (p.stock ?? 0) <= 0 ? 'Sin stock: no se muestra en el kit' : null;
            const errId = `kit-err-${p.productId}`;
            return (
              <li key={p.productId} className="border border-black/10 p-3 sm:p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-14 object-cover shrink-0" />
                  ) : (
                    <span className="size-14 bg-surface flex items-center justify-center shrink-0" aria-hidden>
                      <ImageOff size={18} className="text-black/40" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-black/65">
                      {p.category ?? 'Sin colección'} · Normal {p.normalPriceCop != null ? formatCOP(p.normalPriceCop) : '—'} · Stock {p.stock ?? 0}
                    </p>
                    {warn && (
                      <p className="text-xs text-amber-800 flex items-center gap-1 mt-1">
                        <AlertTriangle size={12} aria-hidden /> {warn}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs">
                    Precio especial
                    <input
                      className={`${input} w-32 block`}
                      inputMode="numeric"
                      value={draft}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? errId : undefined}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.productId]: e.target.value }))}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs min-h-11">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={p.enabled}
                      disabled={busy === p.productId}
                      onChange={(e) => void run(p.productId, () => adminKitUpsert(p.productId, p.specialPriceCop, e.target.checked, p.sort), e.target.checked ? 'Pieza activada.' : 'Pieza desactivada.')}
                    />
                    Activa
                  </label>
                  <button
                    type="button"
                    disabled={!dirty || invalid || busy === p.productId}
                    onClick={() => void run(p.productId, () => adminKitUpsert(p.productId, n, p.enabled, p.sort), 'Precio guardado.')}
                    className={`${btn} border border-ink text-ink hover:bg-ink hover:text-ivory`}
                  >
                    <Save size={16} aria-hidden /> Guardar
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.productId}
                    onClick={() => {
                      if (window.confirm(`¿Quitar "${p.name}" del kit?`)) void run(p.productId, () => adminKitRemove(p.productId), 'Pieza quitada del kit.');
                    }}
                    aria-label={`Quitar ${p.name} del kit`}
                    className="size-11 inline-flex items-center justify-center text-black/65 hover:text-red-600"
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </div>
                {invalid && (
                  <p id={errId} role="alert" className="text-xs text-red-700 lg:basis-full">
                    El precio debe ser mayor a 0, no superar el precio normal{p.normalPriceCop != null ? ` (${formatCOP(p.normalPriceCop)})` : ''} ni el tope ({formatCOP(cap)}).
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
