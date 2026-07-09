import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle, Clock, ExternalLink, Trash2, Search } from 'lucide-react';
import { toTitleCase } from '../lib/sanitize';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: string;
  selectedVariant?: { name: string; price: string };
}

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  total_amount: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled';

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Modales personalizados de confirmación y alerta
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadOrders();
    loadStockMap();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStockMap() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, stock');
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((p: { id: string; stock: number }) => {
        map[p.id] = p.stock;
      });
      setStockMap(map);
    } catch (error) {
      console.error('Error loading stock map:', error);
    }
  }

  const handleConfirmOrder = (order: Order) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Pedido',
      message: '¿Confirmar pago y descontar del inventario?',
      onConfirm: async () => {
        setConfirmModal(null);
        setProcessingId(order.id);
        try {
          const { error: orderError } = await supabase
            .from('orders')
            .update({ status: 'confirmed' })
            .eq('id', order.id);

          if (orderError) throw orderError;

          for (const item of order.items) {
            const { data: productData, error: fetchError } = await supabase
              .from('products')
              .select('stock')
              .eq('id', item.id)
              .single();

            if (fetchError || !productData) {
              console.error(`Error obteniendo producto ${item.id}`, fetchError);
              continue;
            }

            const newStock = Math.max(0, productData.stock - item.quantity);

            await supabase
              .from('products')
              .update({ stock: newStock })
              .eq('id', item.id);
          }

          await loadOrders();
          await loadStockMap();
        } catch (error) {
          console.error('Error confirming order:', error);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Hubo un error al confirmar el pedido.'
          });
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const handleCancelOrder = (orderId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancelar Pedido',
      message: '¿Estás seguro de cancelar este pedido? El inventario no se modificará.',
      onConfirm: async () => {
        setConfirmModal(null);
        setProcessingId(orderId);
        try {
          const { error } = await supabase
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('id', orderId);

          if (error) throw error;
          await loadOrders();
        } catch (error) {
          console.error('Error cancelling order:', error);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Hubo un error al cancelar el pedido.'
          });
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const handleDeleteOrder = (orderId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Pedido',
      message: '¿Estás seguro de eliminar permanentemente este pedido del historial?',
      onConfirm: async () => {
        setConfirmModal(null);
        setProcessingId(orderId);
        try {
          const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', orderId);

          if (error) throw error;
          setOrders(orders.filter(o => o.id !== orderId));
        } catch (error) {
          console.error('Error deleting order:', error);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Hubo un error al eliminar el pedido.'
          });
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(dateString));
  };

  // Counts per status for filter badges
  const counts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesSearch = !searchQuery ||
        order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_phone.includes(searchQuery);
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, searchQuery]);

  const STATUS_TABS: { key: StatusFilter; label: string; color: string; activeColor: string }[] = [
    { key: 'all',       label: 'Todos',      color: 'border-black/10 text-black/50 hover:border-black/30',         activeColor: 'border-black bg-black text-white' },
    { key: 'pending',   label: 'Pendiente',  color: 'border-yellow-200 text-yellow-700 hover:border-yellow-400',   activeColor: 'border-yellow-500 bg-yellow-100 text-yellow-800' },
    { key: 'confirmed', label: 'Confirmado', color: 'border-green-200 text-green-700 hover:border-green-400',      activeColor: 'border-green-600 bg-green-100 text-green-800' },
    { key: 'cancelled', label: 'Cancelado',  color: 'border-red-200 text-red-600 hover:border-red-400',            activeColor: 'border-red-500 bg-red-100 text-red-700' },
  ];

  if (loading) {
    return <div className="p-12 text-center text-black/50 font-light">Cargando pedidos...</div>;
  }

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-black/10 bg-gray-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-serif text-black">Gestión de Pedidos</h2>

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-black/20 py-2 pl-9 pr-3 text-sm focus:border-gold focus:outline-none transition-colors"
            />
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2 mt-4">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1 text-xs border rounded-full transition-all font-medium flex items-center gap-1.5 ${
                statusFilter === tab.key ? tab.activeColor : tab.color
              }`}
            >
              {tab.label}
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                statusFilter === tab.key ? 'bg-white/30' : 'bg-black/5'
              }`}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-black/50 font-light">
            {orders.length === 0
              ? 'Aún no hay pedidos registrados.'
              : 'No hay pedidos que coincidan con los filtros seleccionados.'}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-black/60 text-xs uppercase tracking-wider font-light border-b border-black/10">
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Detalle del Pedido</th>
                <th className="px-6 py-4 font-medium">Total</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredOrders.map((order) => (
                <tr key={order.id} className={`transition-colors ${order.status === 'cancelled' ? 'bg-gray-50/50' : 'hover:bg-gray-50/80'}`}>
                  <td className="px-6 py-4 align-top">
                    <div className="font-medium text-black">{toTitleCase(order.customer_name)}</div>
                    <a
                      href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gold hover:underline flex items-center gap-1 mt-1"
                    >
                      {order.customer_phone} <ExternalLink size={10} />
                    </a>
                    <div className="text-[10px] text-black/40 mt-2">{formatDate(order.created_at)}</div>
                  </td>

                  <td className="px-6 py-4">
                    <ul className="space-y-2 text-sm text-black/80">
                      {order.items.map((item, idx) => {
                        const currentStock = stockMap[item.id];
                        const isOutOfStock = currentStock !== undefined && currentStock <= 0;
                        return (
                          <li key={idx} className="flex gap-2 items-start">
                            <span className="font-medium">{item.quantity}x</span>
                            <div>
                              <span className="flex items-center gap-1.5 flex-wrap">
                                {toTitleCase(item.name)}
                                {isOutOfStock && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 uppercase tracking-wide leading-none">
                                    Agotado
                                  </span>
                                )}
                              </span>
                              {item.selectedVariant && (
                                <span className="text-xs text-black/50 block">Var: {toTitleCase(item.selectedVariant.name)}</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </td>

                  <td className="px-6 py-4 align-top font-medium text-black">
                    {formatCurrency(order.total_amount)}
                  </td>

                  <td className="px-6 py-4 align-top">
                    {order.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock size={12} /> Pendiente
                      </span>
                    )}
                    {order.status === 'confirmed' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle2 size={12} /> Confirmado
                      </span>
                    )}
                    {order.status === 'cancelled' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle size={12} /> Cancelado
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      {order.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleConfirmOrder(order)}
                            disabled={processingId === order.id}
                            className="bg-black text-white text-xs px-3 py-1.5 hover:bg-gold transition-colors w-full"
                          >
                            {processingId === order.id ? '...' : 'Confirmar Pago'}
                          </button>
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={processingId === order.id}
                            className="bg-transparent border border-red-200 text-red-600 text-xs px-3 py-1.5 hover:bg-red-50 transition-colors w-full"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                      {order.status !== 'confirmed' && (
                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          disabled={processingId === order.id}
                          className="bg-transparent border border-gray-200 text-gray-400 text-xs px-3 py-1.5 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors w-full flex items-center justify-center gap-1"
                        >
                          <Trash2 size={12} /> Eliminar
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

      {/* Modal de Confirmación Personalizado */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-black/10 shadow-2xl p-6">
            <h3 className="font-serif text-xl text-black mb-4">{confirmModal.title}</h3>
            <p className="text-black/70 text-sm mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmModal(null)}
                className="flex-1 border border-black/20 text-black py-2 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className="flex-1 bg-black text-white py-2 hover:bg-gold transition-colors uppercase tracking-wider text-xs font-medium"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alerta Personalizado */}
      {alertModal && alertModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-90 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-black/10 shadow-2xl p-6">
            <h3 className="font-serif text-xl text-black mb-4">{alertModal.title}</h3>
            <p className="text-black/70 text-sm mb-6">{alertModal.message}</p>
            <button 
              onClick={() => setAlertModal(null)}
              className="w-full bg-black text-white py-2 hover:bg-gold transition-colors uppercase tracking-wider text-xs font-medium"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
