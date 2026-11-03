import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ImageOff, Save, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeSearchQuery } from '../lib/sanitize';
import { adminErrorMessage, formatCOP } from '../lib/pricing';
import { fetchWholesaleMin, forgetWholesaleMin } from '../lib/wholesale';
import { useCategories } from '../context/CategoriesContext';

interface VariantItem {
  name: string;
  retail_price_cop: number | null;
  wholesale_price_cop: number | null;
  is_visible: boolean | null;
}

interface AdminRow {
  id: string;
  name: string;
  category: string | null;
  category_id: string | null;
  image: string | null;
  stock: number | null;
  price_cop: number | null;
  variants: { base: { wholesale_price_cop: number; is_visible: boolean } | null; items: VariantItem[] };
  wholesale_price_cop: number | null;
  wholesale_status: 'published' | 'hidden' | 'none';
  total_count: number;
}

type StatusFilter = 'all' | 'published' | 'hidden' | 'none' | 'no_stock';
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'hidden', label: 'Ocultos' },
  { value: 'none', label: 'Sin precio mayorista' },
  { value: 'no_stock', label: 'Sin stock' },
];
const STATUS_LABEL: Record<AdminRow['wholesale_status'], string> = { published: 'Publicado', hidden: 'Oculto', none: 'Sin precio' };
const PAGE_SIZE = 50;
const CHUNK = 500;

/** Borrador de precios de una fila: clave '' = precio base, otra clave = nombre de variante. */
type Draft = Record<string, string>;

type Notice = { kind: 'success' | 'warn' | 'error'; text: string };

const toInt = (s: string): number | null => {
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isSafeInteger(n) ? n : NaN;
};

/** Precios mayoristas actuales de una fila, por clave ('' = base). */
function currentPrices(r: AdminRow): Record<string, number | null> {
  if (r.variants.items.length > 0) return Object.fromEntries(r.variants.items.map((v) => [v.name, v.wholesale_price_cop]));
  return { '': r.variants.base?.wholesale_price_cop ?? null };
}

/** Precio detal de referencia por clave. */
function retailOf(r: AdminRow, key: string): number | null {
  if (r.variants.items.length > 0) return r.variants.items.find((v) => v.name === key)?.retail_price_cop ?? null;
  return r.price_cop;
}

const inputCls = 'w-full border border-black/20 p-2 min-h-11 text-sm focus:border-gold focus:outline-none bg-white';

async function inChunks<T>(items: T[], run: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += CHUNK) await run(items.slice(i, i + CHUNK));
}

/** Tabla de TODOS los productos con su estado mayorista: precio editable en línea, publicar/ocultar y acciones en lote. */
export default function AdminWholesalePrices() {
  const { categories } = useCategories();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pct, setPct] = useState('');
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const reqId = useRef(0);

  // Mínimo
  const [minInput, setMinInput] = useState('');
  const [minBusy, setMinBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(sanitizeSearchQuery(search));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_wholesale_products', {
      p_search: debounced || null,
      p_category: category || null,
      p_status: status,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (id !== reqId.current) return; // respuesta vieja
    if (error) {
      setNotice({ kind: 'error', text: adminErrorMessage(error.message) });
      setRows([]);
      setTotal(0);
    } else {
      const list = (data || []) as AdminRow[];
      setRows(list);
      setTotal(list[0]?.total_count ?? 0);
    }
    setLoading(false);
  }, [debounced, category, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // La selección y los borradores sin guardar se descartan al cambiar de filtro o de página
  useEffect(() => {
    setSelected(new Set());
  }, [debounced, category, status, page]);

  useEffect(() => {
    fetchWholesaleMin(true)
      .then((n) => setMinInput(String(n)))
      .catch(() => undefined);
  }, []);

  const pctNum = (() => {
    const n = parseInt(pct, 10);
    return Number.isInteger(n) && n >= 1 && n <= 90 ? n : null;
  })();
  const suggested = (retail: number | null): string => (pctNum !== null && retail ? String(Math.max(1, Math.round((retail * (100 - pctNum)) / 100))) : '');

  const valueOf = (r: AdminRow, key: string): string => {
    const d = drafts[r.id];
    if (d && key in d) return d[key];
    const cur = currentPrices(r)[key];
    return cur === null || cur === undefined ? '' : String(cur);
  };

  const setValue = (r: AdminRow, key: string, v: string) => setDrafts((d) => ({ ...d, [r.id]: { ...(d[r.id] ?? {}), [key]: v.replace(/\D/g, '') } }));

  /** Filas a guardar de un borrador: solo lo que cambió y no está vacío. */
  const pendingRows = (r: AdminRow): { rows: { product_id: string; variant_name: string | null; price_cop: number }[]; invalid: boolean } => {
    const d = drafts[r.id];
    const out: { product_id: string; variant_name: string | null; price_cop: number }[] = [];
    let invalid = false;
    if (!d) return { rows: out, invalid };
    const cur = currentPrices(r);
    for (const key of Object.keys(d)) {
      const raw = d[key].trim();
      if (raw === '') continue;
      const n = toInt(raw);
      if (n === null || Number.isNaN(n) || n < 1) {
        invalid = true;
        continue;
      }
      if (cur[key] === n) continue;
      out.push({ product_id: r.id, variant_name: key === '' ? null : key, price_cop: n });
    }
    return { rows: out, invalid };
  };
  const isDirty = (r: AdminRow) => {
    const p = pendingRows(r);
    return p.rows.length > 0 || p.invalid;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({ kind: 'error', text: adminErrorMessage((e as { message?: string })?.message) });
    } finally {
      setBusy(null);
    }
  };

  const upsert = async (payload: { product_id: string; variant_name: string | null; price_cop: number; is_visible?: boolean }[]) => {
    await inChunks(payload, async (chunk) => {
      const { error } = await supabase.rpc('admin_upsert_wholesale_prices', { p_rows: chunk });
      if (error) throw error;
    });
  };

  const saveRow = (r: AdminRow) =>
    run(`save:${r.id}`, async () => {
      const p = pendingRows(r);
      if (p.invalid) throw { message: 'INVALID_PRICE' };
      if (p.rows.length === 0) return;
      await upsert(p.rows);
      setDrafts((d) => {
        const next = { ...d };
        delete next[r.id];
        return next;
      });
      const ge = p.rows.some((x) => {
        const ref = retailOf(r, x.variant_name ?? '');
        return ref !== null && x.price_cop >= ref;
      });
      setNotice(
        ge
          ? { kind: 'warn', text: `Guardado, pero el precio mayorista de “${r.name}” quedó igual o por encima del detal. Revísalo.` }
          : { kind: 'success', text: `Precio de “${r.name}” guardado.` }
      );
      await load();
    });

  const toggle = (r: AdminRow) =>
    run(`vis:${r.id}`, async () => {
      const { error } = await supabase.rpc('admin_set_wholesale_visibility', { p_product_ids: [r.id], p_visible: r.wholesale_status !== 'published' });
      if (error) throw error;
      await load();
    });

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const bulkVisibility = (visible: boolean) =>
    run('bulk-vis', async () => {
      const ids = selectedRows.map((r) => r.id);
      let changed = 0;
      await inChunks(ids, async (chunk) => {
        const { data, error } = await supabase.rpc('admin_set_wholesale_visibility', { p_product_ids: chunk, p_visible: visible });
        if (error) throw error;
        changed += Number(data) || 0;
      });
      setNotice({ kind: 'success', text: `${visible ? 'Publicados' : 'Ocultos'}: ${changed} precios actualizados en ${ids.length} productos seleccionados.` });
      await load();
    });

  const bulkPrice = (label: string, fn: (retail: number) => number) =>
    run('bulk-price', async () => {
      const payload: { product_id: string; variant_name: string | null; price_cop: number }[] = [];
      let skipped = 0;
      let ge = 0;
      for (const r of selectedRows) {
        const keys = r.variants.items.length > 0 ? r.variants.items.map((v) => v.name) : [''];
        let any = false;
        for (const key of keys) {
          const ref = retailOf(r, key);
          if (!ref || ref < 1) continue;
          const price = Math.max(1, Math.round(fn(ref)));
          if (price >= ref) ge++;
          payload.push({ product_id: r.id, variant_name: key === '' ? null : key, price_cop: price });
          any = true;
        }
        if (!any) skipped++;
      }
      if (payload.length === 0) {
        setNotice({ kind: 'warn', text: 'Ninguno de los productos seleccionados tiene precio detal para calcular.' });
        return;
      }
      await upsert(payload);
      setDrafts((d) => {
        const next = { ...d };
        selectedRows.forEach((r) => delete next[r.id]);
        return next;
      });
      const extra = [skipped ? `${skipped} sin precio detal se omitieron` : '', ge ? `${ge} precios quedaron iguales o por encima del detal` : ''].filter(Boolean).join('; ');
      setNotice({ kind: ge || skipped ? 'warn' : 'success', text: `${label}: ${payload.length} precios guardados${extra ? ` (${extra})` : ''}.` });
      await load();
    });

  const bulkRemove = () => {
    if (!window.confirm(`¿Quitar el precio mayorista de ${selectedRows.length} productos? Dejarán de aparecer para los mayoristas.`)) return;
    void run('bulk-remove', async () => {
      const ids = selectedRows.map((r) => r.id);
      let removed = 0;
      await inChunks(ids, async (chunk) => {
        const { data, error } = await supabase.rpc('admin_remove_wholesale_prices', { p_product_ids: chunk });
        if (error) throw error;
        removed += Number(data) || 0;
      });
      setNotice({ kind: 'success', text: `Se quitaron ${removed} precios mayoristas de ${ids.length} productos.` });
      setSelected(new Set());
      await load();
    });
  };

  const saveMin = async () => {
    setNotice(null);
    const n = toInt(minInput);
    if (n === null || Number.isNaN(n) || n > 1_000_000_000) return setNotice({ kind: 'error', text: adminErrorMessage('INVALID_MIN') });
    setMinBusy(true);
    const { error } = await supabase.rpc('admin_set_wholesale_min', { p_cop: n });
    setMinBusy(false);
    if (error) return setNotice({ kind: 'error', text: adminErrorMessage(error.message) });
    forgetWholesaleMin();
    setNotice({ kind: 'success', text: `Pedido mínimo mayorista actualizado a ${formatCOP(n)}.` });
  };

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const anyDirty = useMemo(() => rows.some(isDirty), [rows, drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden" data-testid="wholesale-prices">
      <div className="p-4 sm:p-6 border-b border-black/10 bg-gray-50/50 space-y-4">
        <div>
          <h2 className="text-xl font-serif text-black">Productos mayoristas</h2>
          <p className="text-xs text-black/65 mt-1">
            Todos los productos de la tienda. Un producto aparece para los mayoristas solo si tiene precio mayorista y está Publicado.
          </p>
        </div>

        {notice && (
          <div role="status" className={`p-3 border text-sm flex justify-between gap-3 ${notice.kind === 'success' ? 'bg-green-50 border-green-200 text-green-900' : notice.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X size={14} /></button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs uppercase tracking-wider text-black/60 sm:col-span-2 lg:col-span-1">
            Buscar
            <div className="relative mt-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/65" />
              <input className={`${inputCls} pl-9 normal-case tracking-normal`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre del producto" maxLength={100} />
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wider text-black/60">
            Colección
            <select className={`${inputCls} mt-1 normal-case tracking-normal`} value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-wider text-black/60">
            Estado
            <select className={`${inputCls} mt-1 normal-case tracking-normal`} value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); }}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-wider text-black/60">
            Sugerido: −% sobre el detal (opcional)
            <input className={`${inputCls} mt-1 normal-case tracking-normal`} inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ej: 40" aria-label="Porcentaje sugerido sobre el detal" />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-black/10 pt-4">
          <label className="block text-xs uppercase tracking-wider text-black/60">
            Pedido mínimo mayorista (COP)
            <input className={`${inputCls} mt-1 w-48 normal-case tracking-normal`} inputMode="numeric" value={minInput} onChange={(e) => setMinInput(e.target.value.replace(/[^\d]/g, ''))} aria-label="Pedido mínimo mayorista" />
          </label>
          <button type="button" onClick={saveMin} disabled={minBusy} className="bg-black text-white px-4 min-h-11 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-50">
            <Save size={14} /> Guardar mínimo
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="p-3 sm:px-6 bg-gold/10 border-b border-gold/30 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Acciones en lote" data-testid="bulk-bar">
          <span className="text-sm font-medium mr-2">{selected.size} seleccionados</span>
          <button disabled={!!busy} onClick={() => bulkVisibility(true)} className="px-3 min-h-11 text-xs border border-black/30 bg-white hover:bg-gray-50 disabled:opacity-50">Publicar</button>
          <button disabled={!!busy} onClick={() => bulkVisibility(false)} className="px-3 min-h-11 text-xs border border-black/30 bg-white hover:bg-gray-50 disabled:opacity-50">Ocultar</button>
          <button disabled={!!busy} onClick={() => bulkPrice('Copiar precio del detal', (r) => r)} className="px-3 min-h-11 text-xs border border-black/30 bg-white hover:bg-gray-50 disabled:opacity-50">Copiar precio del detal</button>
          <button disabled={!!busy || pctNum === null} title={pctNum === null ? 'Escribe un porcentaje sugerido (1 a 90) arriba' : undefined} onClick={() => bulkPrice(`Aplicar −${pctNum}%`, (r) => (r * (100 - (pctNum ?? 0))) / 100)} className="px-3 min-h-11 text-xs border border-black/30 bg-white hover:bg-gray-50 disabled:opacity-50">
            Aplicar −{pctNum ?? 'X'}% al detal
          </button>
          <button disabled={!!busy} onClick={bulkRemove} className="px-3 min-h-11 text-xs border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50">Quitar</button>
          <button onClick={() => setSelected(new Set())} className="px-3 min-h-11 text-xs underline">Deseleccionar</button>
        </div>
      )}

      <div className="md:overflow-x-auto">
        {loading && rows.length === 0 ? (
          <div className="p-12 text-center text-black/65 font-light">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-black/65 font-light">No hay productos con esos filtros.</div>
        ) : (
          <table className="responsive-table w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider border-b border-black/10">
                <th className="px-3 py-3 font-medium w-10">
                  <input type="checkbox" aria-label="Seleccionar todos los de esta página" checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="size-4" />
                </th>
                <th className="px-3 py-3 font-medium">Producto</th>
                <th className="px-3 py-3 font-medium">Colección</th>
                <th className="px-3 py-3 font-medium text-right">Stock</th>
                <th className="px-3 py-3 font-medium text-right">Detal</th>
                <th className="px-3 py-3 font-medium">Precio mayorista</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((r) => {
                const variants = r.variants.items;
                const keys = variants.length > 0 ? variants.map((v) => v.name) : [''];
                const dirty = isDirty(r);
                return (
                  <tr key={r.id} data-testid="wp-row" className={`align-top ${r.wholesale_status === 'hidden' ? 'bg-gray-50/60' : ''}`}>
                    <td data-label="" className="px-3 py-3">
                      <input type="checkbox" aria-label={`Seleccionar ${r.name}`} checked={selected.has(r.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="size-4" />
                    </td>
                    <td data-label="Producto" data-block className="px-3 py-3">
                      <div className="flex items-center gap-3 text-left">
                        <div className="size-12 bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center text-black/65">
                          {r.image ? <img src={r.image} alt="" width={48} height={48} loading="lazy" className="size-full object-cover" referrerPolicy="no-referrer" /> : <ImageOff size={16} />}
                        </div>
                        <span className="font-medium text-black break-words min-w-0">{r.name}</span>
                      </div>
                    </td>
                    <td data-label="Colección" className="px-3 py-3 text-sm text-black/70">{r.category || '—'}</td>
                    <td data-label="Stock" className={`px-3 py-3 text-sm text-right ${(r.stock ?? 0) <= 0 ? 'text-red-700 font-medium' : ''}`}>{r.stock ?? 0}</td>
                    <td data-label="Detal" className="px-3 py-3 text-sm text-right">
                      {variants.length > 0 ? 'Por variante' : formatCOP(r.price_cop)}
                    </td>
                    <td data-label="Precio mayorista" data-block className="px-3 py-3 min-w-56">
                      <div className="space-y-2 text-left">
                        {keys.map((key) => {
                          const label = key === '' ? `Precio mayorista de ${r.name}` : `Precio mayorista de ${r.name}, variante ${key}`;
                          const retail = retailOf(r, key);
                          const val = valueOf(r, key);
                          const n = toInt(val);
                          const warn = n !== null && !Number.isNaN(n) && retail !== null && n >= retail;
                          return (
                            <div key={key || 'base'}>
                              {key !== '' && <span className="block text-xs text-black/60 mb-0.5">{key}{retail !== null ? ` · detal ${formatCOP(retail)}` : ''}</span>}
                              <input
                                className={`${inputCls} ${warn ? 'border-amber-500' : ''}`}
                                inputMode="numeric"
                                aria-label={label}
                                value={val}
                                placeholder={suggested(retail) || 'Sin precio'}
                                onChange={(e) => setValue(r, key, e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && dirty && void saveRow(r)}
                              />
                              {warn && (
                                <p data-testid="warn-ge-retail" className="mt-1 text-[11px] text-amber-800 flex items-center gap-1">
                                  <AlertTriangle size={12} aria-hidden /> El mayorista queda igual o por encima del detal ({formatCOP(retail)}).
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td data-label="Estado" className="px-3 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.wholesale_status === 'published'}
                        aria-label={`${STATUS_LABEL[r.wholesale_status]}: ${r.name}`}
                        disabled={r.wholesale_status === 'none' || busy === `vis:${r.id}`}
                        onClick={() => toggle(r)}
                        className={`inline-flex items-center gap-2 min-h-11 px-3 text-xs border disabled:opacity-40 ${r.wholesale_status === 'published' ? 'border-green-600 bg-green-50 text-green-800' : 'border-black/20 text-black/60'}`}
                      >
                        <span aria-hidden className={`inline-block w-7 h-4 rounded-full relative ${r.wholesale_status === 'published' ? 'bg-green-600' : 'bg-black/25'}`}>
                          <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${r.wholesale_status === 'published' ? 'left-3.5' : 'left-0.5'}`} />
                        </span>
                        {STATUS_LABEL[r.wholesale_status]}
                      </button>
                    </td>
                    <td data-label="Acciones" data-actions className="px-3 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => saveRow(r)}
                          disabled={!dirty || busy === `save:${r.id}`}
                          className="bg-black text-white px-4 min-h-11 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center justify-center gap-2 disabled:opacity-30 w-full md:w-auto"
                          aria-label={`Guardar precio de ${r.name}`}
                        >
                          <Save size={14} /> Guardar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-black/10 bg-gray-50/30">
        <p className="text-xs text-black/65">
          {total === 0 ? '0 productos' : `Mostrando ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total}`}
          {anyDirty ? ' · hay precios sin guardar en esta página' : ''}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0} aria-label="Página anterior" className="size-11 flex items-center justify-center border border-black/10 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-black/60 px-2">Página {page + 1} de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))} disabled={page >= totalPages - 1} aria-label="Página siguiente" className="size-11 flex items-center justify-center border border-black/10 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
