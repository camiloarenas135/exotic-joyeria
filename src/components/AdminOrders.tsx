import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle, Clock, ExternalLink, Trash2 } from 'lucide-react';

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

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
    
    // Configurar tiempo real (opcional)
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

  const handleConfirmOrder = async (order: Order) => {
    if (!window.confirm('¿Confirmar pago y descontar del inventario?')) return;
    
    setProcessingId(order.id);
    try {
      // 1. Cambiar estado a confirmado
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'confirmed' })
        .eq('id', order.id);

      if (orderError) throw orderError;

      // 2. Descontar inventario por cada producto
      for (const item of order.items) {
        // Obtener el stock actual del producto
        const { data: productData, error: fetchError } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.id)
          .single();

        if (fetchError || !productData) {
          console.error(`Error obteniendo producto ${item.id}`, fetchError);
          continue; // Si falla uno, intentamos con el siguiente
        }

        const newStock = Math.max(0, productData.stock - item.quantity);

        // Actualizar el stock
        await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.id);
      }

      await loadOrders();
    } catch (error) {
      console.error('Error confirming order:', error);
      alert('Hubo un error al confirmar el pedido.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!window.confirm('¿Estás seguro de cancelar este pedido? El inventario no se modificará.')) return;
    
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
      alert('Hubo un error al cancelar el pedido.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('¿Estás seguro de eliminar permanentemente este pedido del historial?')) return;
    
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
      alert('Hubo un error al eliminar el pedido.');
    } finally {
      setProcessingId(null);
    }
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

  if (loading) {
    return <div className="p-12 text-center text-black/50 font-light">Cargando pedidos...</div>;
  }

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/10 bg-gray-50/50">
        <h2 className="text-xl font-serif text-black">Gestión de Pedidos</h2>
      </div>

      <div className="overflow-x-auto">
        {orders.length === 0 ? (
          <div className="p-12 text-center text-black/50 font-light">
            Aún no hay pedidos registrados.
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
              {orders.map((order) => (
                <tr key={order.id} className={`transition-colors ${order.status === 'cancelled' ? 'bg-gray-50/50' : 'hover:bg-gray-50/80'}`}>
                  <td className="px-6 py-4 align-top">
                    <div className="font-medium text-black">{order.customer_name}</div>
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
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="font-medium">{item.quantity}x</span>
                          <div>
                            <span>{item.name}</span>
                            {item.selectedVariant && (
                              <span className="text-xs text-black/50 block">Var: {item.selectedVariant.name}</span>
                            )}
                          </div>
                        </li>
                      ))}
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
    </div>
  );
}
