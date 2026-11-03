import { useState, useEffect, useCallback, type FormEvent, type ChangeEvent } from 'react';
import { ArrowUp, ArrowDown, Plus, Pencil, Trash2, Eye, EyeOff, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCategories } from '../context/CategoriesContext';
import { slugify, type Category } from '../lib/types';
import { sanitizeString } from '../lib/sanitize';

interface CategoryRow extends Category {
  product_count: number;
}

const SLUG_RE = /^[a-z0-9-]+$/;

export default function AdminCategories() {
  const { refresh } = useCategories();
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('id, slug, name, sort_order, is_active, image')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      setMessage('No se pudieron cargar las colecciones.');
      setLoading(false);
      return;
    }
    const list = (data || []) as Category[];
    const counts = await Promise.all(
      list.map(async (c) => {
        const { count } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('category_id', c.id);
        return count || 0;
      })
    );
    setRows(list.map((c, i) => ({ ...c, product_count: counts[i] })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const afterSave = async () => {
    await load();
    await refresh();
  };

  const openNew = () => {
    setEditing(null);
    setIsNew(true);
    setName('');
    setSlug('');
    setSlugTouched(false);
    setFormError(null);
  };

  const openEdit = (c: CategoryRow) => {
    setEditing(c);
    setIsNew(false);
    setName(c.name);
    setSlug(c.slug);
    setSlugTouched(true); // el slug no cambia al renombrar
    setFormError(null);
  };

  const closeForm = () => {
    setEditing(null);
    setIsNew(false);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeString(name, 60);
    const cleanSlug = slug.trim();
    if (!cleanName) return setFormError('El nombre es obligatorio.');
    if (!SLUG_RE.test(cleanSlug)) return setFormError('El enlace solo puede tener minúsculas, números y guiones.');
    setBusy(true);
    setFormError(null);
    const { error } = isNew
      ? await supabase.from('categories').insert([{ name: cleanName, slug: cleanSlug, sort_order: rows.length + 1 }])
      : await supabase.from('categories').update({ name: cleanName, slug: cleanSlug }).eq('id', editing!.id);
    setBusy(false);
    if (error) {
      setFormError(error.code === '23505' ? 'Ya existe una colección con ese enlace.' : 'No se pudo guardar la colección.');
      return;
    }
    closeForm();
    await afterSave();
  };

  const toggleActive = async (c: CategoryRow) => {
    setBusy(true);
    const { error } = await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id);
    setBusy(false);
    if (error) setMessage('No se pudo cambiar el estado.');
    await afterSave();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    const { error } = await supabase.rpc('reorder_categories', { p_ids: ids });
    setBusy(false);
    if (error) setMessage('No se pudo reordenar.');
    await afterSave();
  };

  const handleDelete = async (c: CategoryRow) => {
    if (c.product_count > 0) {
      setMessage(
        `"${c.name}" tiene ${c.product_count} producto(s) y no se puede eliminar. Usa "Desactivar" para ocultarla del menú, o mueve los productos a otra colección.`
      );
      return;
    }
    if (!window.confirm(`¿Eliminar la colección "${c.name}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from('categories').delete().eq('id', c.id);
    setBusy(false);
    if (error) setMessage('No se pudo eliminar la colección.');
    await afterSave();
  };

  const showForm = isNew || editing !== null;

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/10 bg-gray-50/50 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-black">Colecciones</h2>
          <p className="text-xs text-black/65 mt-1">Un solo nivel. Alimentan el menú, el pie de página y los filtros.</p>
        </div>
        <button
          onClick={openNew}
          className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Nueva colección
        </button>
      </div>

      {message && (
        <div className="m-6 mb-0 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs flex justify-between gap-3">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="m-6 p-4 border border-gold/40 bg-gold/5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Nombre</label>
            <input
              value={name}
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value);
                if (isNew && !slugTouched) setSlug(slugify(e.target.value));
              }}
              className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Enlace (/coleccion/…)</label>
            <input
              value={slug}
              maxLength={60}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none bg-white font-mono text-sm"
              required
            />
            {!isNew && editing && slug.trim() !== editing.slug && (
              <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 mt-2">
                Vas a cambiar la URL de /coleccion/{editing.slug} a /coleccion/{slug.trim() || '…'}. Los enlaces guardados o compartidos (pie de página, redes, enlaces externos) con la dirección anterior dejarán de funcionar. Los banners no se afectan porque guardan la colección, no el enlace.
              </p>
            )}
            {!isNew && !(editing && slug.trim() !== editing.slug) && <p className="text-[10px] text-black/65 mt-1">Cambiar el enlace rompe los links ya compartidos.</p>}
          </div>
          {formError && <p className="md:col-span-2 text-xs text-red-600">{formError}</p>}
          <div className="md:col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={closeForm} className="border border-black/20 px-4 py-2 text-xs uppercase tracking-wider hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-black text-white px-4 py-2 text-xs uppercase tracking-wider hover:bg-gold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={14} /> Guardar
            </button>
          </div>
        </form>
      )}

      <div className="md:overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-black/65 font-light">Cargando colecciones...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-black/65 font-light">Aún no hay colecciones.</div>
        ) : (
          <table className="responsive-table w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider border-b border-black/10">
                <th className="px-6 py-3 font-medium">Orden</th>
                <th className="px-6 py-3 font-medium">Nombre</th>
                <th className="px-6 py-3 font-medium">Enlace</th>
                <th className="px-6 py-3 font-medium text-center">Productos</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((c, i) => (
                <tr key={c.id} className={c.is_active ? 'hover:bg-gray-50/80' : 'bg-gray-50/60 text-black/65'}>
                  <td data-label="Orden" data-block className="px-6 py-3">
                    <div className="flex gap-1">
                      <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Subir" className="p-1 border border-black/10 hover:bg-black hover:text-white disabled:opacity-30">
                        <ArrowUp size={14} />
                      </button>
                      <button disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Bajar" className="p-1 border border-black/10 hover:bg-black hover:text-white disabled:opacity-30">
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </td>
                  <td data-label="Nombre" className="px-6 py-3 font-medium">{c.name}</td>
                  <td data-label="Enlace" className="px-6 py-3 font-mono text-xs">{c.slug}</td>
                  <td data-label="Productos" className="px-6 py-3 text-center">{c.product_count}</td>
                  <td data-label="Estado" className="px-6 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {c.is_active ? 'Activa' : 'Oculta'}
                    </span>
                  </td>
                  <td data-label="Acciones" data-actions className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-2 text-black/65 hover:text-gold" title="Editar" aria-label="Editar"><Pencil size={16} /></button>
                      <button onClick={() => toggleActive(c)} disabled={busy} className="p-2 text-black/65 hover:text-gold" title={c.is_active ? 'Desactivar' : 'Activar'} aria-label={c.is_active ? 'Desactivar' : 'Activar'}>
                        {c.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button onClick={() => handleDelete(c)} disabled={busy} className="p-2 text-black/65 hover:text-red-500" title="Eliminar" aria-label="Eliminar"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
