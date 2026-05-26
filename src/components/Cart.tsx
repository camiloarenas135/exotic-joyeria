import { useState } from 'react';
import { X, Minus, Plus, ShoppingBag, MessageCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export default function Cart() {
  const { cart, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, userName, setIsVIPFormOpen } = useAppContext();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isCartOpen) return null;

  const total = cart.reduce((sum, item) => {
    // Remove dots (thousands separator in COP), replace comma with dot (decimal), then keep only numbers and decimals
    const itemPrice = item.selectedVariant ? item.selectedVariant.price : item.price;
    const cleanPrice = itemPrice.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.-]+/g, "");
    const price = parseFloat(cleanPrice) || 0;
    return sum + price * item.quantity;
  }, 0);

  const handleCheckout = async () => {
    if (!userName) {
      setIsVIPFormOpen(true);
      return;
    }

    setIsProcessing(true);
    const phoneNumber = "573170817990";
    const userPhone = localStorage.getItem('user_whatsapp') || 'Desconocido';
    
    let message = `¡Hola! Soy ${userName}. Me gustaría hacer el siguiente pedido:\n\n`;
    
    cart.forEach((item) => {
      const itemPrice = item.selectedVariant ? item.selectedVariant.price : item.price;
      const variantText = item.selectedVariant ? ` (${item.selectedVariant.name})` : '';
      message += `${item.quantity}x ${item.name}${variantText} - ${itemPrice}\n`;
    });
    
    const formattedTotal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(total);
    message += `\n*Total: ${formattedTotal}*\n\n`;
    message += "Quedo atento/a para coordinar el pago y envío. ¡Gracias!";
    
    try {
      const { error } = await supabase
        .from('orders')
        .insert([{
          customer_name: userName,
          customer_phone: userPhone,
          items: cart,
          total_amount: total,
          status: 'pending'
        }]);

      if (error) {
        console.error('Error guardando el pedido en base de datos:', error);
      }
    } catch (error) {
      console.error('Error procesando el pedido:', error);
    } finally {
      setIsProcessing(false);
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
      
      window.open(whatsappUrl, '_blank');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm transition-opacity"
        onClick={() => setIsCartOpen(false)}
      />

      {/* Cart Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-[70] shadow-2xl flex flex-col transform transition-transform duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-serif text-2xl text-black flex items-center gap-2">
            <ShoppingBag size={24} />
            Tu Carrito
          </h2>
          <button 
            onClick={() => setIsCartOpen(false)}
            className="text-gray-400 hover:text-black transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-6">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                <ShoppingBag size={32} />
              </div>
              <p className="font-sans text-gray-500">Tu carrito está vacío</p>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="text-gold font-medium hover:text-black transition-colors"
              >
                Continuar comprando
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {cart.map((item) => (
                <div key={item.cartItemId} className="flex gap-4">
                  <div className="w-24 h-24 bg-gray-50 flex-shrink-0">
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      className="w-full h-full object-cover object-center"
                    />
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-serif text-sm text-black">{item.name}</h3>
                          {item.selectedVariant && (
                            <p className="text-xs text-black/60 mt-0.5">{item.selectedVariant.name}</p>
                          )}
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.cartItemId)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p className="text-gold font-medium text-sm mt-1">
                        {item.selectedVariant ? item.selectedVariant.price : item.price}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-gray-200 rounded-sm">
                        <button 
                          onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                          className="p-1 text-gray-500 hover:text-black hover:bg-gray-50 transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>
                        <button 
                          onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className={`p-1 transition-colors ${item.quantity >= item.stock ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-black hover:bg-gray-50'}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-gray-100 bg-gray-50">
            <div className="flex justify-between items-center mb-6">
              <span className="font-sans text-gray-500">Subtotal</span>
              <span className="font-serif text-xl text-black">
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(total)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4 text-center">
              Impuestos y envío calculados en el checkout
            </p>
            <button 
              onClick={handleCheckout}
              disabled={isProcessing}
              className={`w-full bg-[#25D366] text-white py-4 uppercase tracking-widest text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                isProcessing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#20bd5a]'
              }`}
            >
              {isProcessing ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
              ) : (
                <MessageCircle size={18} />
              )}
              <span>
                {isProcessing 
                  ? 'Procesando...' 
                  : userName ? 'Pedir por WhatsApp' : 'Completar Registro para Pedir'}
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
