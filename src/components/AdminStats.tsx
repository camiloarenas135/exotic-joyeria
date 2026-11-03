import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, Layers, TrendingUp, AlertTriangle, DollarSign, RefreshCw, X } from 'lucide-react';
import { toTitleCase } from '../lib/sanitize';
import { formatCOP, parseCOP } from '../lib/pricing';

interface SalesOrder {
  id: string;
  status: string;
  channel: 'retail' | 'wholesale' | null;
  total_cop: number | null;
  total_amount: number | null;
  created_at: string;
}

interface TopProduct {
  name: string;
  qty: number;
  total: number;
}

const PERIODS = [
  { key: '7', label: '7 días', days: 7 },
  { key: '30', label: '30 días', days: 30 },
  { key: 'all', label: 'Todo', days: 0 },
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendientes',
  confirmed: 'Confirmados',
  cancelled: 'Cancelados',
};

interface Product {
  id: string;
  name: string;
  price: string;
  price_cop?: number | null;
  category: string;
  stock: number;
  images?: string[];
}

interface AdminStatsProps {
  onEditProduct?: (productId: string) => void;
}

export default function AdminStats({ onEditProduct }: AdminStatsProps = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [isOutOfStockModalOpen, setIsOutOfStockModalOpen] = useState(false);

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [topLines, setTopLines] = useState<{ order_id: string; name_snapshot: string; qty: number; line_total_cop: number }[]>([]);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('30');

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, price_cop, category, stock, images');

      if (error) throw error;
      setProducts(data || []);

      const { data: ord } = await supabase
        .from('orders')
        .select('id, status, channel, total_cop, total_amount, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      setOrders((ord as SalesOrder[]) || []);

      const { data: lines } = await supabase
        .from('order_lines')
        .select('order_id, name_snapshot, qty, line_total_cop')
        .limit(5000);
      setTopLines(lines || []);
    } catch (error) {
      console.error('Error al cargar productos para estadísticas:', error);
    } finally {
      setLoading(false);
    }
  }

  const outOfStockProducts = React.useMemo(() => {
    return products.filter(p => {
      const isOutOfStock = (p.stock ?? 0) === 0;
      if (!isOutOfStock) return false;
      if (selectedCategoryFilter) {
        return toTitleCase(p.category) === toTitleCase(selectedCategoryFilter);
      }
      return true;
    });
  }, [products, selectedCategoryFilter]);

  const handleOpenOutOfStockAll = () => {
    setSelectedCategoryFilter(null);
    setIsOutOfStockModalOpen(true);
  };

  const handleOpenOutOfStockCategory = (catName: string) => {
    setSelectedCategoryFilter(catName);
    setIsOutOfStockModalOpen(true);
  };

  const stats = React.useMemo(() => {
    let totalProducts = products.length;
    let totalStock = 0;
    let outOfStock = 0;
    let totalValue = 0;

    const categoryStats: Record<string, {
      count: number;
      stock: number;
      outOfStock: number;
      value: number;
    }> = {};

    products.forEach(p => {
      const priceNum = p.price_cop ?? parseCOP(p.price);

      const stockVal = p.stock ?? 0;
      const productVal = priceNum * stockVal;

      totalStock += stockVal;
      if (stockVal === 0) {
        outOfStock += 1;
      }
      totalValue += productVal;

      const catName = toTitleCase(p.category || 'Sin Colección');
      if (!categoryStats[catName]) {
        categoryStats[catName] = {
          count: 0,
          stock: 0,
          outOfStock: 0,
          value: 0
        };
      }

      categoryStats[catName].count += 1;
      categoryStats[catName].stock += stockVal;
      if (stockVal === 0) {
        categoryStats[catName].outOfStock += 1;
      }
      categoryStats[catName].value += productVal;
    });

    return {
      totalProducts,
      totalStock,
      outOfStock,
      totalValue,
      categoryStats
    };
  }, [products]);

  const sales = React.useMemo(() => {
    const days = PERIODS.find(p => p.key === period)?.days ?? 0;
    const since = days ? Date.now() - days * 86_400_000 : 0;
    const inPeriod = orders.filter(o => new Date(o.created_at).getTime() >= since);
    const byStatus: Record<string, number> = { pending: 0, confirmed: 0, cancelled: 0 };
    let retail = 0;
    let wholesale = 0;
    let retailCount = 0;
    let wholesaleCount = 0;
    const validIds = new Set<string>();
    inPeriod.forEach(o => {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      if (o.status === 'cancelled') return;
      validIds.add(o.id);
      const amount = o.total_cop ?? Math.round(Number(o.total_amount) || 0);
      if (o.channel === 'wholesale') {
        wholesale += amount;
        wholesaleCount += 1;
      } else {
        retail += amount;
        retailCount += 1;
      }
    });
    const top: Record<string, TopProduct> = {};
    topLines.forEach(l => {
      if (!validIds.has(l.order_id)) return;
      const t = top[l.name_snapshot] || { name: l.name_snapshot, qty: 0, total: 0 };
      t.qty += l.qty;
      t.total += l.line_total_cop;
      top[l.name_snapshot] = t;
    });
    const topProducts = Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return { byStatus, retail, wholesale, retailCount, wholesaleCount, topProducts, count: inPeriod.length };
  }, [orders, topLines, period]);

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-black/10 bg-gray-50/50 flex justify-between items-center">
        <div className="flex items-center gap-2 text-black">
          <BarChart3 size={20} className="text-gold" />
          <h2 className="text-xl font-serif text-black">Estadísticas del Inventario</h2>
        </div>
        <button
          onClick={loadProducts}
          disabled={loading}
          className="p-2 border border-black/10 hover:border-black/30 hover:bg-gray-100 transition-all rounded-none bg-transparent cursor-pointer"
          title="Actualizar datos"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center text-black/65 font-light py-12">Cargando métricas...</div>
        ) : products.length === 0 ? (
          <div className="text-center text-black/65 font-light py-12">No hay productos en el catálogo para generar estadísticas.</div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1: Total Productos */}
              <div className="border border-black/10 p-6 bg-gray-50/30 flex items-center gap-4 relative overflow-hidden group hover:border-gold/50 transition-all duration-300">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/60 group-hover:bg-gold transition-colors"></div>
                <div className="bg-black/5 p-3.5 text-black/75">
                  <Layers size={24} />
                </div>
                <div>
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Diseños Únicos</p>
                  <p className="text-3xl font-serif text-black font-semibold">{stats.totalProducts}</p>
                </div>
              </div>

              {/* Card 2: Stock Total */}
              <div className="border border-black/10 p-6 bg-gray-50/30 flex items-center gap-4 relative overflow-hidden group hover:border-gold/50 transition-all duration-300">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/60 group-hover:bg-gold transition-colors"></div>
                <div className="bg-black/5 p-3.5 text-black/75">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Unidades en Stock</p>
                  <p className="text-3xl font-serif text-black font-semibold">{stats.totalStock}</p>
                </div>
              </div>

              {/* Card 3: Productos Agotados */}
              <div 
                onClick={handleOpenOutOfStockAll}
                className="border border-black/10 p-6 bg-gray-50/30 flex items-center gap-4 relative overflow-hidden group hover:border-amber-400 hover:bg-amber-50/20 transition-all duration-300 cursor-pointer"
                title="Ver todos los productos agotados"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/60 group-hover:bg-amber-500 transition-colors"></div>
                <div className={`p-3.5 ${stats.outOfStock > 0 ? 'bg-amber-100/60 text-amber-700' : 'bg-green-100/60 text-green-700'}`}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Artículos Agotados</p>
                  <p className={`text-3xl font-serif font-semibold ${stats.outOfStock > 0 ? 'text-amber-700' : 'text-black'}`}>
                    {stats.outOfStock}
                  </p>
                </div>
              </div>

              {/* Card 4: Valor de Inventario */}
              <div className="border border-black/10 p-6 bg-gray-50/30 flex items-center gap-4 relative overflow-hidden group hover:border-gold/50 transition-all duration-300">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/60 group-hover:bg-gold transition-colors"></div>
                <div className="bg-gold/10 p-3.5 text-gold">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Valor de Inventario</p>
                  <p className="text-2xl font-serif text-gold-ink font-bold">
                    {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(stats.totalValue)}
                  </p>
                </div>
              </div>
            </div>

            {/* Ventas */}
            <div className="pt-4 border-t border-black/10">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="font-serif text-xs text-black tracking-wide uppercase font-bold">Ventas y Pedidos</h3>
                <div className="flex gap-2">
                  {PERIODS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPeriod(p.key)}
                      className={`px-3 py-1 text-xs border transition-colors ${period === p.key ? 'border-gold text-gold-ink bg-gold/5' : 'border-black/10 text-black/65 hover:text-black'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="border border-black/10 p-4 bg-gray-50/30">
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Detal</p>
                  <p className="text-xl font-serif text-black font-semibold">{formatCOP(sales.retail)}</p>
                  <p className="text-xs text-black/65">{sales.retailCount} pedidos</p>
                </div>
                <div className="border border-black/10 p-4 bg-gray-50/30">
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Mayorista</p>
                  <p className="text-xl font-serif text-black font-semibold">{formatCOP(sales.wholesale)}</p>
                  <p className="text-xs text-black/65">{sales.wholesaleCount} pedidos</p>
                </div>
                <div className="border border-black/10 p-4 bg-gray-50/30">
                  <p className="text-black/65 text-xs tracking-widest uppercase font-medium mb-1">Pedidos por estado</p>
                  <ul className="text-sm text-black/75 space-y-0.5">
                    {Object.entries(STATUS_LABELS).map(([k, label]) => (
                      <li key={k} className="flex justify-between"><span>{label}</span><span className="font-medium">{sales.byStatus[k] || 0}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-[10px] text-black/65 mb-3">Las ventas no incluyen pedidos cancelados.</p>
              {sales.topProducts.length > 0 && (
                <div className="border border-black/10">
                  <div className="px-4 py-2 bg-gray-50 text-xs uppercase tracking-wider text-black/60 font-medium">Más vendidos</div>
                  <ul className="divide-y divide-black/5 text-sm">
                    {sales.topProducts.map(t => (
                      <li key={t.name} className="flex justify-between px-4 py-2">
                        <span className="text-black truncate pr-4">{t.name}</span>
                        <span className="text-black/60 shrink-0">{t.qty} uds · {formatCOP(t.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Desglose por Categoría */}
            <div className="pt-4 border-t border-black/10">
              <h3 className="font-serif text-xs text-black mb-4 tracking-wide uppercase font-bold">Rendimiento y Stock por Colección</h3>
              
              <div className="md:overflow-x-auto border border-black/10">
                <table className="responsive-table w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-black/10 text-black/60 font-medium uppercase tracking-wider text-xs">
                      <th className="px-6 py-4">Colección</th>
                      <th className="px-6 py-4 text-center">Cantidad Productos</th>
                      <th className="px-6 py-4 text-center">Unidades Stock</th>
                      <th className="px-6 py-4 text-center">Artículos Agotados</th>
                      <th className="px-6 py-4 text-right">Valor Estimado</th>
                      <th className="px-6 py-4">Nivel de Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {(Object.entries(stats.categoryStats) as [string, { count: number; stock: number; outOfStock: number; value: number }][])
                      .filter(([_, data]) => data.count > 0)
                      .map(([catName, data]) => {
                        let statusText = "Saludable";
                        let statusColor = "bg-green-100 text-green-800";
                        
                        if (data.stock === 0) {
                          statusText = "Sin Stock";
                          statusColor = "bg-red-100 text-red-800";
                        } else if (data.stock <= 3) {
                          statusText = "Stock Crítico";
                          statusColor = "bg-amber-100 text-amber-800";
                        }

                        return (
                          <tr key={catName} className="hover:bg-gray-50/50 transition-colors">
                            <td data-label="Colección" className="px-6 py-4 font-medium text-black">{catName}</td>
                            <td data-label="Productos" className="px-6 py-4 text-center text-black/75">{data.count}</td>
                            <td data-label="Stock" className="px-6 py-4 text-center font-medium">
                              <span className={data.stock === 0 ? 'text-red-600 font-bold' : 'text-black'}>
                                {data.stock}
                              </span>
                            </td>
                            <td data-label="Agotados" className="px-6 py-4 text-center">
                              {data.outOfStock > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOutOfStockCategory(catName)}
                                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors border-0 cursor-pointer font-sans"
                                  title={`Ver agotados de la colección ${catName}`}
                                >
                                  {data.outOfStock} agotado{data.outOfStock > 1 ? 's' : ''}
                                </button>
                              ) : (
                                <span className="text-black/65">-</span>
                              )}
                            </td>
                            <td data-label="Valor" className="px-6 py-4 text-right font-medium text-black">
                              {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(data.value)}
                            </td>
                            <td data-label="Nivel" className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                                {statusText}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Productos Agotados */}
      {isOutOfStockModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl border border-black/10 shadow-2xl max-h-[85vh] flex flex-col">
            {/* Header del Modal */}
            <div className="flex justify-between items-center p-6 border-b border-black/10 bg-gray-50/50 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-amber-600 animate-bounce" size={20} />
                <h3 className="font-serif text-lg text-black">
                  {selectedCategoryFilter 
                    ? `Artículos Agotados — ${selectedCategoryFilter}` 
                    : 'Todos los Artículos Agotados'}
                </h3>
                <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold ml-2">
                  {outOfStockProducts.length}
                </span>
              </div>
              <button 
                onClick={() => setIsOutOfStockModalOpen(false)} 
                className="text-black/65 hover:text-black bg-transparent border-0 cursor-pointer focus:outline-none"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenido del Modal (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6">
              {outOfStockProducts.length === 0 ? (
                <p className="text-center text-black/65 py-8 font-light">No hay productos agotados en esta selección.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {outOfStockProducts.map((product) => {
                    const imgUrl = product.images?.[0] || '';
                    return (
                      <div 
                        key={product.id} 
                        onClick={() => {
                          if (onEditProduct) {
                            setIsOutOfStockModalOpen(false);
                            onEditProduct(product.id);
                          }
                        }}
                        className="border border-black/10 p-3 flex gap-3 bg-gray-50/30 hover:border-gold/60 hover:bg-gold/5 transition-all duration-300 cursor-pointer group"
                        title="Haz clic para modificar unidades en el catálogo"
                      >
                        {/* Image Preview */}
                        <div className="w-16 h-16 bg-gray-100 shrink-0 relative overflow-hidden border border-black/5">
                          {imgUrl ? (
                            <img 
                              src={imgUrl} 
                              alt={product.name} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-black/65">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                <circle cx="9" cy="9" r="2"/>
                                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                              </svg>
                            </div>
                          )}
                        </div>
                        {/* Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h4 className="font-serif text-sm text-black font-medium truncate group-hover:text-gold transition-colors">{toTitleCase(product.name)}</h4>
                            <p className="text-[10px] text-black/65 uppercase tracking-wider mt-0.5">{toTitleCase(product.category)}</p>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-xs text-gold-ink font-medium">{product.price || 'Sin Precio'}</p>
                            <span className="text-[9px] uppercase tracking-widest text-black/65 group-hover:text-gold font-semibold transition-colors">
                              Editar Stock &rarr;
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="p-4 bg-gray-50 border-t border-black/10 text-right">
              <button
                onClick={() => setIsOutOfStockModalOpen(false)}
                className="bg-black text-white px-5 py-2 text-xs font-medium hover:bg-gold transition-colors uppercase tracking-wider cursor-pointer border-0"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
