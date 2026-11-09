import { useState, useEffect, useCallback } from 'react';
import { Check, X, Ban, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeString } from '../lib/sanitize';
import { adminErrorMessage } from '../lib/pricing';
import { formatColombia } from '../lib/colombiaTime';
import type { Wholesaler, WholesalerStatus } from '../lib/types';
import AdminWholesalePrices from './AdminWholesalePrices';

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

type Section = 'requests' | 'products';

export default function AdminWholesalers({ onPendingChange }: { onPendingChange?: () => void }) {
  const [section, setSection] = useState<Section>('requests');
  const [message, setMessage] = useState<{ kind: 'success' | 'warn' | 'error'; text: string } | null>(null);

  // ----- Solicitudes -----
  const [filter, setFilter] = useState<WholesalerStatus | 'all'>('pending');
  const [list, setList] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    // La lista completa (con la nota interna) solo la entrega la RPC de admin; la tabla ya no se lee con select('*')
    const { data, error } = await supabase.rpc('admin_list_wholesalers', { p_status: filter === 'all' ? null : filter });
    if (error) {
      setMessage({ kind: 'error', text: 'No se pudieron cargar los mayoristas.' });
      setLoading(false);
      return; // un fallo no vacía la lista que ya se estaba viendo
    }
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
      setMessage({ kind: 'error', text: /NOT_FOUND|FORBIDDEN/.test(error.message) ? adminErrorMessage(error.message) : 'No se pudo actualizar el estado. Intenta de nuevo.' });
    } else if (status === 'approved') {
      // Único correo del flujo: aviso de aprobación (Resend). Si falla, el estado ya quedó guardado.
      const { data, error: mailError } = await supabase.functions.invoke('wholesale-mail', { body: { action: 'approved', user_id: w.user_id } });
      if (mailError || !data?.ok) {
        setMessage({ kind: 'warn', text: `${who} quedó aprobado, pero el correo no se pudo enviar. Avísale por WhatsApp para que ingrese.` });
      } else if (data.sent === false) {
        // La función responde ok pero no envía: ya se le había avisado antes (no es un envío nuevo)
        setMessage({ kind: 'warn', text: `${who} quedó aprobado. No se envió un correo nuevo: ya se había enviado un correo anteriormente.` });
      } else {
        setMessage({ kind: 'success', text: `${who} quedó aprobado y le enviamos un correo para que ya pueda ingresar.` });
      }
    } else if (status === 'rejected') {
      setMessage({ kind: 'success', text: `Solicitud de ${who} rechazada. No se envía correo; avísale por WhatsApp si quieres.` });
    } else if (status === 'suspended') {
      setMessage({ kind: 'success', text: `${who} fue suspendido: pierde el acceso a precios mayoristas de inmediato.` });
    } else {
      setMessage({ kind: 'success', text: `Estado de ${who} actualizado.` });
    }
    setBusyId(null);
    await loadList();
    onPendingChange?.();
  };

  const sectionBtn = (key: Section, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={section === key}
      onClick={() => setSection(key)}
      className={`px-4 min-h-11 text-xs uppercase tracking-wider font-medium border-b-2 ${section === key ? 'border-gold text-gold-ink' : 'border-transparent text-black/65 hover:text-black'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Sección mayoristas" className="flex gap-2 border-b border-black/10">
        {sectionBtn('requests', 'Solicitudes')}
        {sectionBtn('products', 'Productos')}
      </div>

      {message && (
        <div role="status" className={`p-3 border text-sm flex justify-between gap-3 ${message.kind === 'success' ? 'bg-green-50 border-green-200 text-green-900' : message.kind === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Cerrar aviso"><X size={14} /></button>
        </div>
      )}

      {section === 'requests' ? (
        <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-black/10 bg-gray-50/50">
            <h2 className="text-xl font-serif text-black">Mayoristas</h2>
            <div className="flex flex-wrap gap-2 mt-3">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 text-xs border rounded-full transition-all font-medium ${filter === f.key ? 'border-gold text-gold-ink bg-gold/5' : 'border-black/10 text-black/65 hover:text-black'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="md:overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-black/65 font-light">Cargando...</div>
            ) : list.length === 0 ? (
              <div className="p-12 text-center text-black/65 font-light">No hay mayoristas en esta lista.</div>
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
                        <div className="text-xs text-black/65">{w.city}{w.tax_id ? ` · NIT/CC ${w.tax_id}` : ''}</div>
                        <div className="text-[10px] text-black/65 mt-1">Registro: {formatColombia(w.created_at)}</div>
                        {w.notes && <div className="text-xs text-black/60 mt-1 italic">Nota: {w.notes}</div>}
                      </td>
                      <td data-label="Contacto" data-block className="px-6 py-4 text-sm">
                        <div className="text-black/70">{w.email}</div>
                        {w.phone && (
                          <a href={`https://wa.me/${w.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-ink hover:underline inline-flex items-center gap-1 mt-1">
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
                            <button disabled={busyId === w.user_id} onClick={() => changeStatus(w, 'approved')} className="px-3 py-1.5 min-h-11 text-xs bg-green-600 text-white hover:bg-green-700 flex items-center gap-1 disabled:opacity-50">
                              <Check size={13} /> Aprobar
                            </button>
                          )}
                          {w.status === 'pending' && (
                            <button disabled={busyId === w.user_id} onClick={() => changeStatus(w, 'rejected')} className="px-3 py-1.5 min-h-11 text-xs border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1 disabled:opacity-50">
                              <X size={13} /> Rechazar
                            </button>
                          )}
                          {w.status === 'approved' && (
                            <button disabled={busyId === w.user_id} onClick={() => changeStatus(w, 'suspended')} className="px-3 py-1.5 min-h-11 text-xs border border-black/20 text-black/70 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50">
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
      ) : (
        <AdminWholesalePrices />
      )}
    </div>
  );
}
