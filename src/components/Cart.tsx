import { useState } from 'react';
import { X, Minus, Plus, ShoppingBag, MessageCircle } from 'lucide-react';
import { useAppContext, unitPriceFor } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { checkRateLimit, formatCooldown } from '../lib/rateLimiter';
import { sanitizeString, sanitizePhone, readSafeLocalStorage } from '../lib/sanitize';
import { formatCOP, orderErrorMessage } from '../lib/pricing';
import { whatsappLink } from '../lib/config';

interface OrderLineResult {
  name: string;
  variant: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
}

export default function Cart() {
  const { cart, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, clearCart, userName, setIsVIPFormOpen } = useAppContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  if (!isCartOpen) return null;

  // Solo informativo: el total real lo calcula el servidor al crear el pedido
  const estimatedTotal = cart.reduce((sum, item) => sum + unitPriceFor(item, item.selectedVariant) * item.quantity, 0);

  const handleCheckout = async () => {
    if (!userName) {
      setIsVIPFormOpen(true);
      return;
    }

    // Rate limit: máximo 3 pedidos por WhatsApp en 10 minutos
    const { allowed, remainingMs } = checkRateLimit('checkout', 3, 10 * 60 * 1000);
    if (!allowed) {
      setCheckoutError(`Demasiados pedidos seguidos. Espera ${formatCooldown(remainingMs)}.`);
      return;
    }
    setCheckoutError(null);

    // Se abre la ventana ahora (gesto del usuario, necesario en iOS) y se redirige al terminar
    const popup = window.open('about:blank', '_blank');
    setIsProcessing(true);

    try {
      const userPhone = readSafeLocalStorage('user_whatsapp', 20) || '';
      const { data, error } = await supabase.rpc('create_order', {
        p_channel: 'retail',
        p_customer: { name: sanitizeString(userName, 100), phone: sanitizePhone(userPhone) },
        p_lines: cart.map((item) => ({
          product_id: item.id,
          variant: item.selectedVariant?.name ?? null,
          qty: item.quantity,
        })),
      });
      if (error) throw error;

      const order = data as { total: number; lines: OrderLineResult[] };
      let message = `¡Hola! Soy ${sanitizeString(userName, 100)}. Me gustaría hacer el siguiente pedido:\n\n`;
      order.lines.forEach((line) => {
        const variantText = line.variant ? ` (${sanitizeString(line.variant, 50)})` : '';
        message += `${line.qty}x ${sanitizeString(line.name, 100)}${variantText} - ${formatCOP(line.unit_price)}\n`;
      });
      message += `\n*Total: ${formatCOP(order.total)}*\n\n`;
      message += 'Quedo atento/a para coordinar el pago y envío. ¡Gracias!';

      const url = whatsappLink(message);
      if (popup) {
        popup.opener = null;
        popup.location.href = url;
      } else {
        window.location.href = url;
      }
      clearCart();
      setIsCartOpen(false);
    } catch (err) {
      popup?.close();
      const raw = err instanceof Error ? err.message : (err as { message?: string })?.message;
      setCheckoutError(orderErrorMessage(raw));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-60 backdrop-blur-sm transition-opacity"
        onClick={() => setIsCartOpen(false)}
      />

      {/* Cart Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carrito de compras"
        className="fixed top-0 right-0 h-full w-full sm:w-100 bg-ivory z-70 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-black/10">
          <h2 className="font-serif text-2xl text-ink flex items-center gap-2">
            <ShoppingBag size={24} />
            Tu Carrito
          </h2>
          <button
            onClick={() => setIsCartOpen(false)}
            className="text-black/50 hover:text-ink transition-colors p-2 -m-2"
            aria-label="Cerrar carrito"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-surface flex items-center justify-center text-black/40">
                <ShoppingBag size={32} />
              </div>
              <p className="font-sans text-black/60">Tu carrito está vacío</p>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-gold-dark font-medium hover:text-ink transition-colors"
              >
                Continuar comprando
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {cart.map((item) => {
                const unit = unitPriceFor(item, item.selectedVariant);
                return (
                  <div key={item.cartItemId} className="flex gap-4">
                    <div className="w-24 h-24 bg-surface shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover object-center"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-serif text-sm text-ink">{item.name}</h3>
                            {item.selectedVariant && (
                              <p className="text-xs text-black/60 mt-0.5">{item.selectedVariant.name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeFromCart(item.cartItemId)}
                            className="text-black/40 hover:text-red-600 transition-colors p-1 -m-1"
                            aria-label={`Quitar ${item.name} del carrito`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <p className="text-gold-dark font-medium text-sm mt-1">{formatCOP(unit)}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-black/15">
                          <button
                            onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                            className="p-2 text-black/60 hover:text-ink hover:bg-surface transition-colors"
                            aria-label="Disminuir cantidad"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-medium" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                            disabled={item.quantity >= item.stock}
                            className={`p-2 transition-colors ${item.quantity >= item.stock ? 'text-black/20 cursor-not-allowed' : 'text-black/60 hover:text-ink hover:bg-surface'}`}
                            aria-label="Aumentar cantidad"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-6 border-t border-black/10 bg-surface">
            <div className="flex justify-between items-center mb-6">
              <span className="font-sans text-black/60">Subtotal</span>
              <span className="font-serif text-xl text-ink">{formatCOP(estimatedTotal)}</span>
            </div>
            <p className="text-xs text-black/50 mb-4 text-center">
              El total final lo confirma la tienda al registrar tu pedido. Envío a coordinar por WhatsApp.
            </p>
            {checkoutError && (
              <div role="alert" className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 text-center">
                {checkoutError}
              </div>
            )}
            <button
              onClick={handleCheckout}
              disabled={isProcessing}
              className={`w-full bg-[#1f8f4a] text-white py-4 uppercase tracking-widest text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                isProcessing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#187a3e]'
              }`}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
              ) : (
                <MessageCircle size={18} />
              )}
              <span>
                {isProcessing ? 'Procesando...' : userName ? 'Pedir por WhatsApp' : 'Completar Registro para Pedir'}
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
