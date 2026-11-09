import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Power, Save, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeSearchQuery } from '../lib/sanitize';
import { adminErrorMessage } from '../lib/pricing';

interface VariantItem {
  id: string;
  name: string;
  stock: number;
  price_cop: number | null;
}

interface ProductRow {
  product_id: string;
  name: string;
  product_stock: number;
  snapshot: number | null;
  variants_sum: number;
  needs_review: boolean;
  variants: VariantItem[];
}

interface EnableReport {
  enabled: boolean;
  differences: { product_id: string; name: string; product_stock: number; variants_sum: number }[];
  legacy_pending_orders: number;
}

type Notice = { kind: 'success' | 'warn' | 'error'; text: string };

const inputCls = 'border border-black/20 p-2 min-h-11 text-sm focus:border-gold focus:outline-none bg-white';

/**
 * Reparto del stock de cada producto entre sus variantes y interruptor del modo "stock por variante".
 * Apagado (valor inicial): el sitio sigue usando las unidades del producto. Encendido: cada variante se vende con su propio stock
 * y las unidades del producto pasan a ser la suma de sus variantes.
 */
export default function AdminVariantStock() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'on' | 'off' | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [report, setReport] = useState<EnableReport | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(sanitizeSearchQuery(search)), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadMode = useCallback(async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', 'variant_stock_mode').maybeSingle();
    setMode(data?.value === 'on' ? 'on' : 'off');
  }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_variant_stock_list', { p_search: debounced || null, p_only_review: onlyReview });
    if (id !== reqId.current) return;
    if (error) {
      setNotice({ kind: 'error', text: adminErrorMessage(error.message) });
      setRows([]);
    } else {
      setRows((data || []) as ProductRow[]);
    }
    setLoading(false);
  }, [debounced, onlyReview]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadMode();
  }, [loadMode]);

  const valueOf = (v: VariantItem) => (v.id in drafts ? drafts[v.id] : String(v.stock));
  const dirtyVariants = (r: ProductRow) => r.variants.filter((v) => v.id in drafts && drafts[v.id] !== '' && Number(drafts[v.id]) !== v.stock);
  const sumOf = (r: ProductRow) => r.variants.reduce((acc, v) => acc + (v.id in drafts && drafts[v.id] !== '' ? Number(drafts[v.id]) : v.stock), 0);

  const saveProduct = async (r: ProductRow) => {
    const changed = dirtyVariants(r);
    if (changed.length === 0) return;
    setBusy(`save:${r.product_id}`);
    setNotice(null);
    let failed: string | null = null;
    for (const v of changed) {
      // Control optimista: si otro administrador o un pedido confirmado cambió el stock, no se pisa en silencio
      const { error } = await supabase.rpc('admin_set_stock', { p_variant: v.id, p_stock: Number(drafts[v.id]), p_expected: v.stock });
      if (error) {
        failed = adminErrorMessage(error.message);
        break;
      }
    }
    setBusy(null);
    if (failed) setNotice({ kind: 'error', text: `${failed} Se guardó lo anterior a la variante con problema; recarga para ver el stock actual.` });
    else setNotice({ kind: 'success', text: `Stock de “${r.name}” guardado.` });
    setDrafts((d) => {
      const next = { ...d };
      changed.forEach((v) => delete next[v.id]);
      return next;
    });
    await load();
  };

  const enable = async (force: boolean) => {
    if (force && !window.confirm('Algunos productos no cuadran todavía. Al encender, las unidades de cada producto pasarán a ser la suma de sus variantes. ¿Encender de todos modos?')) return;
    setBusy('enable');
    setNotice(null);
    const { data, error } = await supabase.rpc('admin_enable_variant_stock', { p_force: force });
    setBusy(null);
    if (error) return setNotice({ kind: 'error', text: adminErrorMessage(error.message) });
    const res = data as EnableReport;
    if (res.enabled) {
      setReport(null);
      setNotice({ kind: 'success', text: 'Stock por variante ENCENDIDO. Desde ahora cada variante se vende con su propio stock.' });
    } else {
      setReport(res);
    }
    await Promise.all([loadMode(), load()]);
  };

  const disable = async () => {
    if (!window.confirm('Se vuelve al stock por producto. Las unidades de cada producto se conservan (son la suma de sus variantes). ¿Apagar?')) return;
    setBusy('disable');
    const { error } = await supabase.rpc('admin_disable_variant_stock');
    setBusy(null);
    if (error) return setNotice({ kind: 'error', text: adminErrorMessage(error.message) });
    setNotice({ kind: 'success', text: 'Stock por variante APAGADO. El sitio vuelve a usar las unidades del producto.' });
    await Promise.all([loadMode(), load()]);
  };

  const pendingReview = rows.filter((r) => r.needs_review).length;

  return (
    <div data-testid="variant-stock">
      <div className="p-4 sm:p-6 border-b border-black/10 bg-gray-50/50 space-y-4">
        <div>
          <h3 className="text-lg font-serif text-black">Reparto de stock por variante</h3>
          <p className="text-xs text-black/65 mt-1">
            {mode === 'on'
              ? 'ENCENDIDO: cada variante se vende con su propio stock y las unidades del producto son la suma de sus variantes.'
              : 'APAGADO: el sitio sigue usando las unidades del producto. Reparte el stock entre las variantes; cuando todas las sumas cuadren, enciéndelo.'}
          </p>
        </div>

        {notice && (
          <div role="status" className={`p-3 border text-sm flex justify-between gap-3 ${notice.kind === 'success' ? 'bg-green-50 border-green-200 text-green-900' : notice.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X size={14} /></button>
          </div>
        )}

        {report && !report.enabled && (
          <div role="alert" className="p-3 border border-amber-300 bg-amber-50 text-sm text-amber-900 space-y-2" data-testid="enable-report">
            <p className="font-medium flex items-center gap-2"><AlertTriangle size={14} aria-hidden /> Todavía no se puede encender sin revisar:</p>
            {report.differences.length > 0 && (
              <ul className="list-disc pl-5">
                {report.differences.map((d) => (
                  <li key={d.product_id}>{d.name}: el producto tiene {d.product_stock} unidades y sus variantes suman {d.variants_sum}.</li>
                ))}
              </ul>
            )}
            {report.legacy_pending_orders > 0 && (
              <p>Hay {report.legacy_pending_orders} pedido(s) pendiente(s) con una línea sin variante de un producto con variantes. Cancélalos y rehazlos, o confírmalos antes de encender.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void enable(true)} disabled={busy !== null} className="px-3 min-h-11 text-xs border border-amber-700 text-amber-900 bg-white hover:bg-amber-100 disabled:opacity-50">
                Encender de todos modos
              </button>
              <button type="button" onClick={() => setReport(null)} className="px-3 min-h-11 text-xs underline">Seguir repartiendo</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs uppercase tracking-wider text-black/60">
            Buscar
            <div className="relative mt-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/65" />
              <input className={`${inputCls} pl-9 w-64 normal-case tracking-normal`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del producto" maxLength={100} />
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm min-h-11">
            <input type="checkbox" className="size-4" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
            Solo por revisar{pendingReview > 0 && !onlyReview ? ` (${pendingReview})` : ''}
          </label>
          <div className="ml-auto flex gap-2">
            {mode === 'on' ? (
              <button type="button" onClick={() => void disable()} disabled={busy !== null} className="px-4 min-h-11 text-xs uppercase tracking-wider border border-black/30 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                <Power size={14} /> Apagar stock por variante
              </button>
            ) : (
              <button type="button" onClick={() => void enable(false)} disabled={busy !== null || mode === null} className="px-4 min-h-11 text-xs uppercase tracking-wider bg-black text-white hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-50">
                <Power size={14} /> Encender stock por variante
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="p-12 text-center text-black/65 font-light">Cargando...</div>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center text-black/65 font-light">{onlyReview ? 'No hay productos por revisar.' : 'No hay productos con variantes.'}</div>
      ) : (
        <ul className="divide-y divide-black/5">
          {rows.map((r) => {
            const dirty = dirtyVariants(r).length > 0;
            const sum = sumOf(r);
            const mismatch = sum !== r.product_stock;
            return (
              <li key={r.product_id} data-testid="vs-row" className="p-4 sm:px-6 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium text-black">{r.name}</span>
                  <span className="text-xs text-black/65">Unidades del producto: {r.product_stock}</span>
                  <span className={`text-xs ${mismatch ? 'text-amber-800 font-medium' : 'text-black/65'}`}>Suma de variantes: {sum}</span>
                  {r.needs_review && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">Revisar reparto</span>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {r.variants.map((v) => (
                    <label key={v.id} className="flex items-center justify-between gap-3 border border-black/10 px-3 py-2 text-sm">
                      <span className="min-w-0 break-words">{v.name}</span>
                      <input
                        className={`${inputCls} w-24 text-right`}
                        type="number"
                        min={0}
                        max={1000000}
                        inputMode="numeric"
                        aria-label={`Stock de ${r.name}, variante ${v.name}`}
                        value={valueOf(v)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value.replace(/[^\d]/g, '') }))}
                        onKeyDown={(e) => e.key === 'Enter' && dirty && void saveProduct(r)}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveProduct(r)}
                    disabled={!dirty || busy === `save:${r.product_id}`}
                    aria-label={`Guardar stock de ${r.name}`}
                    className="bg-black text-white px-4 min-h-11 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-30"
                  >
                    <Save size={14} /> Guardar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
