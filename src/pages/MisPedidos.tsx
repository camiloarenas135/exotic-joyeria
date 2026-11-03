import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useChannel } from '../context/ChannelContext';
import { formatCOP } from '../lib/pricing';

interface OrderLine {
  name: string;
  variant: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
}
interface MyOrder {
  id: string;
  created_at: string;
  status: string;
  total_cop: number | null;
  lines: OrderLine[];
}

const PAGE = 20;
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En revisión', cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  confirmed: { label: 'Confirmado', cls: 'bg-green-50 text-green-900 border-green-200' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-50 text-red-900 border-red-200' },
};

/** /mayoristas/pedidos: historial de los pedidos del propio mayorista (RPC my_wholesale_orders). */
export default function MisPedidos() {
  const { channel, resolving } = useChannel();
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = 'Mis pedidos | Exotic Joyería';
  }, []);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    setError(false);
    const { data, error: err } = await supabase.rpc('my_wholesale_orders', { p_limit: PAGE, p_offset: offset });
    if (err || !Array.isArray(data)) {
      setError(true);
    } else {
      const rows = data as (MyOrder & { total_count: number })[];
      setOrders((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setTotal(rows[0] ? Number(rows[0].total_count) : offset === 0 ? 0 : total);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (channel === 'wholesale') void load(0);
  }, [channel, load]);

  if (resolving) return null;
  if (channel !== 'wholesale') return <Navigate to="/mayoristas" replace />;

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <nav aria-label="Migas de pan" className="text-xs text-black/60 mb-4 flex items-center gap-2">
        <Link to="/" className="hover:text-ink">Inicio</Link>
        <span aria-hidden>/</span>
        <span className="text-ink">Mis pedidos</span>
      </nav>
      <h1 className="font-serif text-3xl md:text-4xl text-ink">Mis pedidos</h1>
      <div className="h-px w-16 bg-gold mt-4 mb-8" />

      {error && (
        <p role="alert" className="text-sm text-red-700 mb-4">
          No pudimos cargar tus pedidos.{' '}
          <button className="underline" onClick={() => void load(0)}>Reintentar</button>
        </p>
      )}
      {!loading && !error && orders.length === 0 && (
        <p className="text-black/70" data-testid="no-orders">Aún no has enviado pedidos. Cuando lo hagas, aparecerán aquí con su estado.</p>
      )}

      <ul className="space-y-4" data-testid="my-orders">
        {orders.map((o) => {
          const st = STATUS[o.status] ?? { label: o.status, cls: 'bg-surface text-ink border-black/10' };
          return (
            <li key={o.id} className="border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-black/70">
                  {new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                  <span className="text-black/65"> · #{o.id.slice(0, 8)}</span>
                </p>
                <span className={`text-[11px] uppercase tracking-widest border px-2 py-1 ${st.cls}`}>{st.label}</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer min-h-11 flex items-center justify-between text-ink">
                  <span>{o.lines.reduce((s, l) => s + l.qty, 0)} unidades</span>
                  <b>{formatCOP(o.total_cop)}</b>
                </summary>
                <ul className="mt-2 divide-y divide-black/10 text-sm">
                  {o.lines.map((l, i) => (
                    <li key={i} className="py-2 flex justify-between gap-3">
                      <span>
                        {l.qty} × {l.name}
                        {l.variant ? ` (${l.variant})` : ''}
                      </span>
                      <span className="shrink-0">{formatCOP(l.line_total)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      <div role="status" aria-live="polite">{loading && <p className="text-black/60 mt-4">Cargando…</p>}</div>
      {!loading && orders.length < total && (
        <button onClick={() => void load(orders.length)} aria-label={`Ver más pedidos (mostrando ${orders.length} de ${total})`} className="mt-6 w-full border border-ink text-ink min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ink hover:text-ivory">
          Ver más
        </button>
      )}
    </section>
  );
}
