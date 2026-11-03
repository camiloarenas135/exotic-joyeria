import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import imageCompression from 'browser-image-compression';
import { Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Save, X, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isSafeLink, type HeroSlide, type HeroLinkType } from '../lib/types';
import { useCategories } from '../context/CategoriesContext';
import ProductPicker, { type ProductHit } from './ProductPicker';
import { sanitizeString } from '../lib/sanitize';
import { toColombiaInput, fromColombiaInput, formatColombia, windowState } from '../lib/colombiaTime';

type DestKey = HeroLinkType | 'none' | 'legacy';

const DEST_OPTIONS: { value: Exclude<DestKey, 'legacy'>; label: string }[] = [
  { value: 'none', label: 'Sin enlace (el botón no se muestra)' },
  { value: 'home', label: 'Inicio' },
  { value: 'catalog', label: 'Todo el catálogo' },
  { value: 'collection', label: 'Una colección' },
  { value: 'product', label: 'Un producto' },
  { value: 'promos', label: 'Promociones' },
  { value: 'wholesale', label: 'Mayoristas' },
  { value: 'entrepreneur', label: 'Emprendedor' },
  { value: 'external', label: 'Enlace externo (avanzado)' },
];

/** Traduce el rechazo de la base (CHECK/FK) a un mensaje claro. */
function saveErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '23514') return 'La base de datos rechazó el destino del enlace. Revisa que el tipo y el valor sean coherentes (el enlace externo debe ser https:// sin usuario ni "..").';
  if (error.code === '23503') return 'La colección o el producto elegido ya no existe. Elige otro destino.';
  if (error.code === '42501') return 'No tienes permiso para guardar banners.';
  return 'No se pudo guardar el banner.';
}

interface FormState {
  image_desktop: string;
  image_mobile: string;
  title: string;
  subtitle: string;
  button_label: string;
  /** Destino elegido en el selector */
  dest: DestKey;
  /** uuid de colección o URL https, según el destino */
  ref: string;
  /** Enlace de texto de un banner anterior, se conserva hasta elegir otro destino */
  legacyLink: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

const EMPTY: FormState = {
  image_desktop: '',
  image_mobile: '',
  title: '',
  subtitle: '',
  button_label: '',
  dest: 'none',
  ref: '',
  legacyLink: '',
  is_active: true,
  starts_at: '',
  ends_at: '',
};

const STATE_LABEL = { active: 'Vigente', upcoming: 'Programado', expired: 'Vencido' } as const;
const STATE_COLOR = {
  active: 'bg-green-100 text-green-800',
  upcoming: 'bg-blue-100 text-blue-800',
  expired: 'bg-gray-200 text-gray-600',
} as const;

async function uploadWebp(file: File, maxWidth: number): Promise<string> {
  const allowed = ['jpg', 'jpeg', 'png', 'webp'];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!allowed.includes(ext)) throw new Error('Usa una imagen .jpg, .png o .webp.');
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.4,
    maxWidthOrHeight: maxWidth,
    initialQuality: 0.85,
    fileType: 'image/webp',
    useWebWorker: false, // el worker descarga código de jsdelivr y la CSP lo bloquea
  });
  const path = `hero/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.webp`;
  const { error } = await supabase.storage.from('product-images').upload(path, compressed, {
    contentType: 'image/webp',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export default function AdminBanners() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);
  const { categories } = useCategories();
  const [product, setProduct] = useState<ProductHit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) setMessage('No se pudieron cargar los banners.');
    setSlides((data || []) as HeroSlide[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY);
    setProduct(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (s: HeroSlide) => {
    const dest: DestKey = s.link_type ?? (s.link ? 'legacy' : 'none');
    setProduct(null);
    if (s.link_type === 'product' && s.link_ref) {
      supabase.from('products').select('id, name, price_cop').eq('id', s.link_ref).maybeSingle().then(({ data }) => {
        setProduct((data as ProductHit | null) ?? { id: s.link_ref as string, name: '(producto no encontrado)', price_cop: null });
      });
    }
    setEditingId(s.id);
    setForm({
      image_desktop: s.image_desktop,
      image_mobile: s.image_mobile || '',
      title: s.title || '',
      subtitle: s.subtitle || '',
      button_label: s.button_label || '',
      dest,
      ref: s.link_ref || '',
      legacyLink: s.link || '',
      is_active: s.is_active,
      starts_at: toColombiaInput(s.starts_at),
      ends_at: toColombiaInput(s.ends_at),
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>, kind: 'desktop' | 'mobile') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(kind);
    setFormError(null);
    try {
      const url = await uploadWebp(file, kind === 'desktop' ? 1920 : 900);
      setForm((f) => (kind === 'desktop' ? { ...f, image_desktop: url } : { ...f, image_mobile: url }));
    } catch (err: any) {
      setFormError(err?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.image_desktop) return setFormError('Sube la imagen de escritorio.');
    let link_type: HeroLinkType | null = null;
    let link_ref: string | null = null;
    let link: string | null = null;
    if (form.dest === 'legacy') {
      link = form.legacyLink;
    } else if (form.dest !== 'none') {
      link_type = form.dest;
      if (form.dest === 'collection') {
        if (!form.ref) return setFormError('Elige la colección a la que lleva el banner.');
        link_ref = form.ref;
      } else if (form.dest === 'product') {
        if (!product) return setFormError('Busca y elige el producto al que lleva el banner.');
        link_ref = product.id;
      } else if (form.dest === 'external') {
        const url = form.ref.trim();
        if (!/^https:\/\//.test(url) || !isSafeLink(url)) return setFormError('El enlace externo debe empezar con "https://" y no puede llevar usuario ni "..".');
        link_ref = url;
      }
    }
    const starts = form.starts_at ? fromColombiaInput(form.starts_at) : null;
    const ends = form.ends_at ? fromColombiaInput(form.ends_at) : null;
    if (starts && ends && new Date(ends) <= new Date(starts)) return setFormError('La fecha de fin debe ser posterior a la de inicio.');

    const payload = {
      image_desktop: form.image_desktop,
      image_mobile: form.image_mobile || null,
      title: sanitizeString(form.title, 120) || null,
      subtitle: sanitizeString(form.subtitle, 240) || null,
      button_label: sanitizeString(form.button_label, 40) || null,
      link_type,
      link_ref,
      link,
      is_active: form.is_active,
      starts_at: starts,
      ends_at: ends,
    };
    setBusy(true);
    const { error } = editingId
      ? await supabase.from('hero_slides').update(payload).eq('id', editingId)
      : await supabase.from('hero_slides').insert([{ ...payload, sort_order: slides.length + 1 }]);
    setBusy(false);
    if (error) return setFormError(saveErrorMessage(error));
    setFormOpen(false);
    await load();
  };

  const toggleActive = async (s: HeroSlide) => {
    const { error } = await supabase.from('hero_slides').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) setMessage('No se pudo cambiar el estado.');
    await load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const a = slides[index];
    const b = slides[target];
    setBusy(true);
    const results = await Promise.all([
      supabase.from('hero_slides').update({ sort_order: target + 1 }).eq('id', a.id),
      supabase.from('hero_slides').update({ sort_order: index + 1 }).eq('id', b.id),
    ]);
    setBusy(false);
    if (results.some((r) => r.error)) setMessage('No se pudo reordenar.');
    await load();
  };

  const handleDelete = async (s: HeroSlide) => {
    if (!window.confirm('¿Eliminar este banner?')) return;
    const { error } = await supabase.from('hero_slides').delete().eq('id', s.id);
    if (error) setMessage('No se pudo eliminar el banner.');
    await load();
  };

  const inputCls = 'w-full border border-black/20 p-3 focus:border-gold focus:outline-none bg-white';
  const labelCls = 'block text-xs uppercase tracking-wider text-black/60 mb-2';

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/10 bg-gray-50/50 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-black">Banners del inicio</h2>
          <p className="text-xs text-black/65 mt-1">Slides del carrusel principal. Si no hay ninguno vigente se muestra el hero por defecto.</p>
        </div>
        <button onClick={openNew} className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2">
          <Plus size={16} /> Nuevo banner
        </button>
      </div>

      {message && (
        <div className="m-6 mb-0 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs flex justify-between gap-3">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      {formOpen && (
        <form onSubmit={handleSave} className="m-6 p-4 border border-gold/40 bg-gold/5 grid gap-4 md:grid-cols-2">
          {(['desktop', 'mobile'] as const).map((kind) => {
            const value = kind === 'desktop' ? form.image_desktop : form.image_mobile;
            return (
              <div key={kind}>
                <label className={labelCls}>Imagen {kind === 'desktop' ? 'de escritorio (obligatoria)' : 'de móvil (opcional)'}</label>
                <div className="border border-dashed border-black/20 bg-white p-3 flex flex-col gap-2">
                  {value && <img src={value} alt="Vista previa" className="w-full max-h-40 object-cover" />}
                  <label className="cursor-pointer text-xs uppercase tracking-wider flex items-center gap-2 text-black/60 hover:text-gold">
                    <Upload size={14} />
                    {uploading === kind ? 'Subiendo...' : value ? 'Cambiar imagen' : 'Subir imagen'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleFile(e, kind)} disabled={uploading !== null} />
                  </label>
                </div>
              </div>
            );
          })}
          <div>
            <label className={labelCls}>Título</label>
            <input className={inputCls} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Subtítulo</label>
            <input className={inputCls} maxLength={240} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Texto del botón</label>
            <input className={inputCls} maxLength={40} value={form.button_label} onChange={(e) => setForm({ ...form, button_label: e.target.value })} />
          </div>
          <div>
            <label htmlFor="banner-dest" className={labelCls}>¿A dónde lleva?</label>
            <select
              id="banner-dest"
              className={inputCls}
              value={form.dest}
              onChange={(e) => setForm({ ...form, dest: e.target.value as DestKey, ref: '' })}
            >
              {form.legacyLink && form.dest === 'legacy' && <option value="legacy">Enlace personalizado (anterior)</option>}
              {DEST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.dest === 'legacy' && <p className="text-[11px] text-black/65 mt-1 break-all">Se conserva el enlace anterior: {form.legacyLink}. Elige otro destino para reemplazarlo.</p>}
          </div>
          {form.dest === 'collection' && (
            <div>
              <label htmlFor="banner-collection" className={labelCls}>Colección</label>
              <select id="banner-collection" className={inputCls} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })}>
                <option value="">Elige una colección…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {form.dest === 'product' && (
            <div>
              <label className={labelCls}>Producto</label>
              <ProductPicker value={product} onChange={setProduct} showPrice={false} inputClassName={inputCls} />
            </div>
          )}
          {form.dest === 'external' && (
            <div>
              <label htmlFor="banner-external" className={labelCls}>Dirección https://</label>
              <input id="banner-external" type="url" inputMode="url" className={inputCls} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelCls}>Inicio (hora Colombia)</label>
            <input type="datetime-local" className={inputCls} value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Fin (hora Colombia)</label>
            <input type="datetime-local" className={inputCls} value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Activo
          </label>

          {form.image_desktop && (
            <div className="md:col-span-2 relative h-40 overflow-hidden bg-black text-white">
              <img src={form.image_desktop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
              <div className="relative z-10 h-full flex flex-col justify-center items-start p-6">
                {form.title && <p className="font-serif text-2xl">{form.title}</p>}
                {form.subtitle && <p className="text-sm text-white/80">{form.subtitle}</p>}
                {form.button_label && <span className="mt-3 bg-gold text-black px-4 py-2 text-xs uppercase tracking-wider">{form.button_label}</span>}
              </div>
            </div>
          )}

          {formError && <p className="md:col-span-2 text-xs text-red-600">{formError}</p>}
          <div className="md:col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={() => setFormOpen(false)} className="border border-black/20 px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={busy || uploading !== null} className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-50">
              <Save size={14} /> Guardar
            </button>
          </div>
        </form>
      )}

      <div className="p-6 space-y-4">
        {loading ? (
          <div className="text-center text-black/65 font-light py-8">Cargando banners...</div>
        ) : slides.length === 0 ? (
          <div className="text-center text-black/65 font-light py-8">Aún no hay banners. Se usa el hero por defecto.</div>
        ) : (
          slides.map((s, i) => {
            const state = windowState(s.starts_at, s.ends_at);
            return (
              <div key={s.id} className={`border border-black/10 flex flex-col sm:flex-row gap-4 p-3 ${s.is_active ? '' : 'opacity-60'}`}>
                <img src={s.image_desktop} alt={s.title || 'Banner'} className="w-full sm:w-56 h-28 object-cover bg-gray-100" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-black truncate">{s.title || '(sin título)'}</p>
                  <p className="text-xs text-black/65 truncate">{s.subtitle}</p>
                  <p className="text-[11px] text-black/65 mt-1">{formatColombia(s.starts_at)} → {formatColombia(s.ends_at)}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.is_active ? STATE_COLOR[state] : 'bg-gray-200 text-gray-600'}`}>
                      {s.is_active ? STATE_LABEL[state] : 'Inactivo'}
                    </span>
                  </div>
                </div>
                <div className="flex sm:flex-col items-center gap-1">
                  <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Subir" className="p-1.5 border border-black/10 hover:bg-black hover:text-white disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button disabled={busy || i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Bajar" className="p-1.5 border border-black/10 hover:bg-black hover:text-white disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button onClick={() => openEdit(s)} aria-label="Editar" className="p-1.5 text-black/65 hover:text-gold"><Pencil size={16} /></button>
                  <button onClick={() => toggleActive(s)} aria-label={s.is_active ? 'Desactivar' : 'Activar'} className="p-1.5 text-black/65 hover:text-gold">{s.is_active ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  <button onClick={() => handleDelete(s)} aria-label="Eliminar" className="p-1.5 text-black/65 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
