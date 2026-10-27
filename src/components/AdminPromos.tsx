import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { Plus, Trash2, Eye, EyeOff, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyDiscount, formatCOP, type PromoKind } from '../lib/pricing';
import { fromColombiaInput, formatColombia, windowState } from '../lib/colombiaTime';
import type { Promotion, PromoScope } from '../lib/types';
import { useCategories } from '../context/CategoriesContext';
import ProductPicker, { type ProductHit } from './ProductPicker';

interface PromoRow extends Promotion {
  products: { name: string; price_cop: number | null } | null;
  categories: { name: string } | null;
}

function scopeText(p: PromoRow): string {
  if (p.scope === 'store') return 'Toda la tienda';
  if (p.scope === 'category') return `Colección: ${p.categories?.name ?? '(colección eliminada)'}`;
  return `Producto: ${p.products?.name ?? '(producto eliminado)'}`;
}

/** Traduce el rechazo de la base (CHECK/FK) a un mensaje claro. */
function saveErrorMessage(error: { code?: string }): string {
  if (error.code === '23514') return 'La base de datos rechazó la promoción: revisa el alcance, el valor (porcentaje 1–90) y las fechas.';
  if (error.code === '23503') return 'El producto o la colección elegida ya no existe.';
  return 'No se pudo guardar la promoción.';
}

const STATE_LABEL = { active: 'Vigente', upcoming: 'Programada', expired: 'Vencida' } as const;
const STATE_COLOR = {
  active: 'bg-green-100 text-green-800',
  upcoming: 'bg-blue-100 text-blue-800',
  expired: 'bg-gray-200 text-gray-600',
} as const;

export default function AdminPromos() {
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const { categories, refreshPromoCover } = useCategories();
  const [scope, setScope] = useState<PromoScope>('product');
  const [categoryId, setCategoryId] = useState('');
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [kind, setKind] = useState<PromoKind>('percent');
  const [value, setValue] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('promotions')
      .select('*, products(name, price_cop), categories(name)')
      .order('ends_at', { ascending: false });
    if (error) setMessage('No se pudieron cargar las promociones.');
    setPromos((data || []) as unknown as PromoRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setScope('product');
    setCategoryId('');
    setProduct(null);
    setKind('percent');
    setValue('');
    setStartsAt('');
    setEndsAt('');
    setFormError(null);
  };

  const numericValue = parseInt(value, 10);
  const preview =
    scope === 'product' && product?.price_cop && Number.isFinite(numericValue) && numericValue > 0
      ? applyDiscount(product.price_cop, kind, numericValue)
      : null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (scope === 'product' && !product) return setFormError('Elige un producto.');
    if (scope === 'category' && !categoryId) return setFormError('Elige una colección.');
    if (!Number.isInteger(numericValue) || numericValue <= 0) return setFormError('El descuento debe ser un número entero mayor a 0.');
    if (kind === 'percent' && numericValue > 90) return setFormError('El porcentaje máximo es 90 %.');
    if (scope === 'product' && kind === 'fixed' && product?.price_cop && numericValue >= product.price_cop) return setFormError('El valor fijo debe ser menor al precio del producto.');
    const starts = fromColombiaInput(startsAt);
    const ends = fromColombiaInput(endsAt);
    if (!starts || !ends) return setFormError('Indica fecha de inicio y de fin.');
    if (new Date(ends) <= new Date(starts)) return setFormError('La fecha de fin debe ser posterior a la de inicio.');

    setBusy(true);
    const { error } = await supabase.from('promotions').insert([
      { scope, product_id: scope === 'product' ? product!.id : null, category_id: scope === 'category' ? categoryId : null, kind, value: numericValue, starts_at: starts, ends_at: ends, is_active: true },
    ]);
    setBusy(false);
    if (error) return setFormError(saveErrorMessage(error));
    setFormOpen(false);
    resetForm();
    await load();
    void refreshPromoCover();
  };

  const toggleActive = async (p: PromoRow) => {
    const { error } = await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) setMessage('No se pudo cambiar el estado.');
    await load();
    void refreshPromoCover();
  };

  const handleDelete = async (p: PromoRow) => {
    if (!window.confirm('¿Eliminar esta promoción?')) return;
    const { error } = await supabase.from('promotions').delete().eq('id', p.id);
    if (error) setMessage('No se pudo eliminar la promoción.');
    await load();
    void refreshPromoCover();
  };

  const inputCls = 'w-full border border-black/20 p-3 focus:border-gold focus:outline-none bg-white';
  const labelCls = 'block text-xs uppercase tracking-wider text-black/60 mb-2';

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/10 bg-gray-50/50 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-black">Promociones</h2>
          <p className="text-xs text-black/50 mt-1">Aplican solo al detal (no al precio mayorista), sin códigos. No cambian el precio guardado del producto. Hora de Colombia.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setFormOpen(true);
          }}
          className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Nueva promoción
        </button>
      </div>

      {message && (
        <div className="m-6 mb-0 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs flex justify-between gap-3">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSave} noValidate className="m-6 p-4 border border-gold/40 bg-gold/5 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="promo-scope" className={labelCls}>¿A qué aplica?</label>
            <select id="promo-scope" className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as PromoScope)}>
              <option value="product">Producto</option>
              <option value="category">Colección</option>
              <option value="store">Toda la tienda</option>
            </select>
          </div>
          {scope === 'product' && (
            <div>
              <label className={labelCls}>Producto</label>
              <ProductPicker value={product} onChange={setProduct} inputClassName={inputCls} />
            </div>
          )}
          {scope === 'category' && (
            <div>
              <label htmlFor="promo-category" className={labelCls}>Colección</label>
              <select id="promo-category" className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Elige una colección…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {scope !== 'product' && (
            <p className="md:col-span-2 text-xs text-black/60 bg-white border border-black/10 p-3">
              {scope === 'store' ? 'Aplica a todos los productos.' : 'Aplica a los productos de la colección.'} Los productos cuyo precio quedaría en 0, o que no bajarían de precio, no mostrarán la promoción. Si un producto tiene varias promociones, se usa solo la mejor (no se acumulan).
            </p>
          )}
          <div>
            <label className={labelCls}>Tipo de descuento</label>
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as PromoKind)}>
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Valor fijo (COP)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{kind === 'percent' ? 'Porcentaje (1–90)' : 'Valor a descontar (COP)'}</label>
            <input type="number" min={1} max={kind === 'percent' ? 90 : undefined} className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} required />
            {preview !== null && product?.price_cop && (
              <p className="text-xs text-black/50 mt-1">
                {formatCOP(product.price_cop)} → <strong className="text-gold">{formatCOP(preview)}</strong>
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Inicio (hora Colombia)</label>
            <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Fin (hora Colombia)</label>
            <input type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
          </div>
          {formError && <p className="md:col-span-2 text-xs text-red-600">{formError}</p>}
          <div className="md:col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={() => setFormOpen(false)} className="border border-black/20 px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={busy} className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-50">
              <Save size={14} /> Guardar
            </button>
          </div>
        </form>
      )}

      <div className="md:overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-black/50 font-light">Cargando promociones...</div>
        ) : promos.length === 0 ? (
          <div className="p-12 text-center text-black/50 font-light">Aún no hay promociones.</div>
        ) : (
          <table className="responsive-table w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider border-b border-black/10">
                <th className="px-6 py-3 font-medium">Alcance</th>
                <th className="px-6 py-3 font-medium">Descuento</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {promos.map((p) => {
                const state = windowState(p.starts_at, p.ends_at);
                return (
                  <tr key={p.id} className={p.is_active ? 'hover:bg-gray-50/80' : 'bg-gray-50/60 text-black/50'}>
                    <td data-label="Alcance" data-block className="px-6 py-3 font-medium">{scopeText(p)}</td>
                    <td data-label="Descuento" className="px-6 py-3">{p.kind === 'percent' ? `${p.value} %` : formatCOP(p.value)}</td>
                    <td data-label="Vigencia" data-block className="px-6 py-3 text-xs text-black/60">{formatColombia(p.starts_at)}<br />{formatColombia(p.ends_at)}</td>
                    <td data-label="Estado" className="px-6 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${p.is_active ? STATE_COLOR[state] : 'bg-gray-200 text-gray-600'}`}>
                        {p.is_active ? STATE_LABEL[state] : 'Inactiva'}
                      </span>
                    </td>
                    <td data-label="Acciones" data-actions className="px-6 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => toggleActive(p)} className="p-2 text-black/40 hover:text-gold" aria-label={p.is_active ? 'Desactivar' : 'Activar'}>
                          {p.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button onClick={() => handleDelete(p)} className="p-2 text-black/30 hover:text-red-500" aria-label="Eliminar"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
