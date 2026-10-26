import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { Check, X, Ban, Phone, Plus, Trash2, Eye, EyeOff, Pencil, Save, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeSearchQuery, sanitizeString } from '../lib/sanitize';
import { formatCOP } from '../lib/pricing';
import { formatColombia } from '../lib/colombiaTime';
import type { Wholesaler, WholesalerStatus } from '../lib/types';

interface PriceRow {
  id: string;
  product_id: string;
  variant_name: string | null;
  price_cop: number;
  is_visible: boolean;
  products: { name: string } | null;
}

interface ProductHit {
  id: string;
  name: string;
  price_cop: number | null;
  variants: { name: string; price_cop?: number | null }[] | null;
}

const STATUS_FILTERS: { key: WholesalerStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'rejected', label: 'Rechazados' },
  { key: 'suspended', label: 'Suspendidos' },
  { key: 'all', label: 'Todos' },
];

const STATUS_COLOR: Record<WholesalerStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-gray-200 text-gray-700',
};

const STATUS_TEXT: Record<WholesalerStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
};

export default function AdminWholesalers() {
  const [message, setMessage] = useState<{ kind: 'success' | 'warn' | 'error'; text: string } | null>(null);

  // ----- Solicitudes -----
  const [filter, setFilter] = useState<WholesalerStatus | 'all'>('pending');
  const [list, setList] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('wholesalers').select('*').order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) setMessage({ kind: 'error', text: 'No se pudieron cargar los mayoristas.' });
    setList((data || []) as Wholesaler[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const changeStatus = async (w: Wholesaler, status: WholesalerStatus) => {
    let notes: string | null = null;
    if (status === 'rejected' || status === 'suspended') {
      const reason = window.prompt(status === 'rejected' ? 'Motivo del rechazo (opcional):' : 'Motivo de la suspensión (opcional):');
      if (reason === null) return;
      notes = sanitizeString(reason, 500) || null;
    }
    setBusyId(w.user_id);
    const { error } = await supabase.rpc('set_wholesaler_status', { p_user: w.user_id, p_status: status, p_notes: notes });
    const who = w.business_name || w.email || 'El mayorista';
    if (error) {
      setMessage({ kind: 'error', text: 'No se pudo actualizar el estado. Intenta de nuevo.' });
    } else if (status === 'approved') {
      // Único correo del flujo: aviso de aprobación (Resend). Si falla, el estado ya quedó guardado.
      const { data, error: mailError } = await supabase.functions.invoke('wholesale-mail', { body: { action: 'approved', user_id: w.user_id } });
      setMessage(
        mailError || !data?.ok
          ? { kind: 'warn', text: `${who} quedó aprobado, pero el correo no se pudo enviar. Avísale por WhatsApp para que ingrese.` }
          : { kind: 'success', text: `${who} quedó aprobado y le enviamos un correo para que ya pueda ingresar.` }
      );
    } else if (status === 'rejected') {
      setMessage({ kind: 'success', text: `Solicitud de ${who} rechazada. No se envía correo; avísale por WhatsApp si quieres.` });
    } else if (status === 'suspended') {
      setMessage({ kind: 'success', text: `${who} fue suspendido: pierde el acceso a precios mayoristas de inmediato.` });
    } else {
      setMessage({ kind: 'success', text: `Estado de ${who} actualizado.` });
    }
    setBusyId(null);
    await loadList();
  };

  // ----- Productos mayoristas -----
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [baseInput, setBaseInput] = useState('');
  const [variantInputs, setVariantInputs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPrices = useCallback(async () => {
    setLoadingPrices(true);
    const { data, error } = await supabase
      .from('wholesale_prices')
      .select('id, product_id, variant_name, price_cop, is_visible, products(name)')
      .order('product_id');
    if (error) setMessage({ kind: 'error', text: 'No se pudieron cargar los precios mayoristas.' });
    setPrices((data || []) as unknown as PriceRow[]);
    setLoadingPrices(false);
  }, []);

  useEffect(() => {
    loadPrices();
  }, [loadPrices]);

  useEffect(() => {
    const q = sanitizeSearchQuery(search);
    if (!formOpen || product || q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name, price_cop, variants').ilike('name', `%${q}%`).limit(8);
      setHits((data || []) as ProductHit[]);
    }, 300);
    return () => clearTimeout(t);
  }, [search, product, formOpen]);

  const startForm = async (productId?: string) => {
    setFormError(null);
    setSearch('');
    setBaseInput('');
    setVariantInputs({});
    setProduct(null);
    setFormOpen(true);
    if (!productId) return;
    const { data } = await supabase.from('products').select('id, name, price_cop, variants').eq('id', productId).single();
    if (!data) return;
    setProduct(data as ProductHit);
    const rows = prices.filter((p) => p.product_id === productId);
    setBaseInput(String(rows.find((r) => r.variant_name === null)?.price_cop ?? ''));
    const vi: Record<string, string> = {};
    rows.filter((r) => r.variant_name !== null).forEach((r) => (vi[r.variant_name as string] = String(r.price_cop)));
    setVariantInputs(vi);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!product) return setFormError('Elige un producto.');
    const toPrice = (s: string): number | null => {
      if (!s.trim()) return null;
      const n = parseInt(s.replace(/\D/g, ''), 10);
      return Number.isInteger(n) && n > 0 ? n : NaN;
    };
    const base = toPrice(baseInput);
    const variantList = (product.variants || []).map((v) => ({ name: v.name, price: toPrice(variantInputs[v.name] || '') }));
    if (Number.isNaN(base) || variantList.some((v) => Number.isNaN(v.price))) return setFormError('Los precios deben ser números enteros mayores a 0.');
    const rows: { product_id: string; variant_name: string | null; price_cop: number }[] = [];
    if (base) rows.push({ product_id: product.id, variant_name: null, price_cop: base });
    variantList.forEach((v) => {
      if (v.price) rows.push({ product_id: product.id, variant_name: v.name, price_cop: v.price });
    });
    if (rows.length === 0) return setFormError('Escribe al menos un precio mayorista.');

    setSaving(true);
    // Conserva la visibilidad actual de las filas que ya existían
    const visibility = new Map(prices.filter((p) => p.product_id === product.id).map((p) => [p.variant_name ?? '', p.is_visible]));
    const del = await supabase.from('wholesale_prices').delete().eq('product_id', product.id);
    if (del.error) {
      setSaving(false);
      return setFormError('No se pudo guardar.');
    }
    const ins = await supabase
      .from('wholesale_prices')
      .insert(rows.map((r) => ({ ...r, is_visible: visibility.get(r.variant_name ?? '') ?? true })));
    setSaving(false);
    if (ins.error) return setFormError('No se pudo guardar.');
    setFormOpen(false);
    await loadPrices();
  };

  const toggleVisible = async (row: PriceRow) => {
    const { error } = await supabase.from('wholesale_prices').update({ is_visible: !row.is_visible }).eq('id', row.id);
    if (error) setMessage({ kind: 'error', text: 'No se pudo cambiar la visibilidad.' });
    await loadPrices();
  };

  const removeRow = async (row: PriceRow) => {
    if (!window.confirm('¿Quitar este precio mayorista?')) return;
    const { error } = await supabase.from('wholesale_prices').delete().eq('id', row.id);
    if (error) setMessage({ kind: 'error', text: 'No se pudo eliminar.' });
    await loadPrices();
  };

  const inputCls = 'w-full border border-black/20 p-3 focus:border-gold focus:outline-none bg-white';
  const labelCls = 'block text-xs uppercase tracking-wider text-black/60 mb-2';

  return (
    <div className="space-y-8">
      {message && (
        <div role="status" className={`p-3 border text-sm flex justify-between gap-3 ${message.kind === 'success' ? 'bg-green-50 border-green-200 text-green-900' : message.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      {/* Solicitudes */}
      <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-black/10 bg-gray-50/50">
          <h2 className="text-xl font-serif text-black">Mayoristas</h2>
          <div className="flex flex-wrap gap-2 mt-3">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 text-xs border rounded-full transition-all font-medium ${filter === f.key ? 'border-gold text-gold bg-gold/5' : 'border-black/10 text-black/50 hover:text-black'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="md:overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-black/50 font-light">Cargando...</div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center text-black/50 font-light">No hay mayoristas en esta lista.</div>
          ) : (
            <table className="responsive-table w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider border-b border-black/10">
                  <th className="px-6 py-3 font-medium">Negocio</th>
                  <th className="px-6 py-3 font-medium">Contacto</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {list.map((w) => (
                  <tr key={w.user_id} className="hover:bg-gray-50/80 align-top">
                    <td data-label="Negocio" data-block className="px-6 py-4">
                      <div className="font-medium text-black">{w.business_name || '(sin nombre)'}</div>
                      <div className="text-xs text-black/50">{w.city}{w.tax_id ? ` · NIT/CC ${w.tax_id}` : ''}</div>
                      <div className="text-[10px] text-black/40 mt-1">Registro: {formatColombia(w.created_at)}</div>
                      {w.notes && <div className="text-xs text-black/60 mt-1 italic">Nota: {w.notes}</div>}
                    </td>
                    <td data-label="Contacto" data-block className="px-6 py-4 text-sm">
                      <div className="text-black/70">{w.email}</div>
                      {w.phone && (
                        <a href={`https://wa.me/${w.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline inline-flex items-center gap-1 mt-1">
                          <Phone size={11} /> {w.phone} · WhatsApp
                        </a>
                      )}
                    </td>
                    <td data-label="Estado" className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[w.status]}`}>{STATUS_TEXT[w.status]}</span>
                    </td>
                    <td data-label="Acciones" data-actions className="px-6 py-4">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {w.status !== 'approved' && (
                          <button disabled={busyId === w.user_id} onClick={() => changeStatus(w, 'approved')} className="px-3 py-1.5 text-xs bg-green-600 text-white hover:bg-green-700 flex items-center gap-1 disabled:opacity-50">
                            <Check size={13} /> Aprobar
                          </button>
                        )}
                        {w.status === 'pending' && (
                          <button disabled={busyId === w.user_id} onClick={() => changeStatus(w, 'rejected')} className="px-3 py-1.5 text-xs border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1 disabled:opacity-50">
                            <X size={13} /> Rechazar
                          </button>
                        )}
                        {w.status === 'approved' && (
                          <button disabled={busyId === w.user_id} onClick={() => changeStatus(w, 'suspended')} className="px-3 py-1.5 text-xs border border-black/20 text-black/70 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50">
                            <Ban size={13} /> Suspender
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Productos mayoristas */}
      <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-black/10 bg-gray-50/50 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h2 className="text-xl font-serif text-black">Productos mayoristas</h2>
            <p className="text-xs text-black/50 mt-1">Solo los productos de esta lista aparecen en el panel mayorista, con el precio que escribas aquí.</p>
          </div>
          <button onClick={() => startForm()} className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2">
            <Plus size={16} /> Agregar producto
          </button>
        </div>

        {formOpen && (
          <form onSubmit={handleSave} className="m-6 p-4 border border-gold/40 bg-gold/5 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelCls}>Producto</label>
              {product ? (
                <div className="flex items-center justify-between border border-black/20 bg-white p-3">
                  <span className="text-sm">{product.name} · detal {formatCOP(product.price_cop)}</span>
                  <button type="button" onClick={() => setProduct(null)} aria-label="Quitar producto"><X size={16} /></button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                  <input className={`${inputCls} pl-9`} placeholder="Busca por nombre (mín. 2 letras)" value={search} onChange={(e) => setSearch(e.target.value)} />
                  {hits.length > 0 && (
                    <ul className="absolute z-10 left-0 right-0 bg-white border border-black/10 shadow-lg max-h-56 overflow-y-auto">
                      {hits.map((h) => (
                        <li key={h.id}>
                          <button type="button" onClick={() => setProduct(h)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between gap-3">
                            <span className="truncate">{h.name}</span>
                            <span className="text-black/50 shrink-0">{formatCOP(h.price_cop)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {product && (
              <>
                <div>
                  <label className={labelCls}>Precio mayorista base (COP)</label>
                  <input inputMode="numeric" className={inputCls} value={baseInput} onChange={(e) => setBaseInput(e.target.value)} placeholder="Ej: 35000" />
                </div>
                {(product.variants || []).map((v) => (
                  <div key={v.name}>
                    <label className={labelCls}>Variante: {v.name}</label>
                    <input inputMode="numeric" className={inputCls} value={variantInputs[v.name] || ''} onChange={(e) => setVariantInputs({ ...variantInputs, [v.name]: e.target.value })} placeholder="Vacío = no disponible" />
                  </div>
                ))}
              </>
            )}
            {formError && <p className="md:col-span-2 text-xs text-red-600">{formError}</p>}
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setFormOpen(false)} className="border border-black/20 px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={saving} className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-50">
                <Save size={14} /> Guardar
              </button>
            </div>
          </form>
        )}

        <div className="md:overflow-x-auto">
          {loadingPrices ? (
            <div className="p-12 text-center text-black/50 font-light">Cargando...</div>
          ) : prices.length === 0 ? (
            <div className="p-12 text-center text-black/50 font-light">Aún no hay productos en el panel mayorista.</div>
          ) : (
            <table className="responsive-table w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider border-b border-black/10">
                  <th className="px-6 py-3 font-medium">Producto</th>
                  <th className="px-6 py-3 font-medium">Variante</th>
                  <th className="px-6 py-3 font-medium text-right">Precio mayorista</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {prices.map((r) => (
                  <tr key={r.id} className={r.is_visible ? 'hover:bg-gray-50/80' : 'bg-gray-50/60 text-black/40'}>
                    <td data-label="Producto" data-block className="px-6 py-3 font-medium">{r.products?.name || '(producto eliminado)'}</td>
                    <td data-label="Variante" className="px-6 py-3 text-sm">{r.variant_name || 'Base'}</td>
                    <td data-label="Precio mayorista" className="px-6 py-3 text-right">{formatCOP(r.price_cop)}</td>
                    <td data-label="Acciones" data-actions className="px-6 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => startForm(r.product_id)} className="p-2 text-black/40 hover:text-gold" aria-label="Editar precios"><Pencil size={16} /></button>
                        <button onClick={() => toggleVisible(r)} className="p-2 text-black/40 hover:text-gold" aria-label={r.is_visible ? 'Ocultar' : 'Mostrar'}>
                          {r.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button onClick={() => removeRow(r)} className="p-2 text-black/30 hover:text-red-500" aria-label="Quitar"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
