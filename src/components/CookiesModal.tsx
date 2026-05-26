import { motion, AnimatePresence } from 'motion/react';
import { X, Cookie } from 'lucide-react';

interface CookiesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CookiesModal({ isOpen, onClose }: CookiesModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0a0a0a] text-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl pointer-events-auto relative border border-gold/20 scrollbar-thin scrollbar-thumb-gold/20 scrollbar-track-transparent"
            >
              {/* Close button */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/40 hover:text-gold transition-colors z-20 bg-black/50 rounded-full"
                aria-label="Cerrar"
              >
                <X size={24} strokeWidth={1.5} />
              </button>

              <div className="p-8 md:p-12 relative">
                {/* Subtle background decoration */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-64 bg-gold/5 blur-3xl pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="h-[1px] w-12 bg-gold/40"></div>
                    <h2 className="font-serif text-2xl md:text-3xl text-gold tracking-widest uppercase text-center">
                      Política de Cookies
                    </h2>
                    <div className="h-[1px] w-12 bg-gold/40"></div>
                  </div>
                  
                  <div className="space-y-6 mt-10">
                    <div className="flex justify-center mb-6 text-gold/80">
                      <Cookie size={48} strokeWidth={1} />
                    </div>
                    <p className="font-sans font-light text-white/70 leading-relaxed text-sm md:text-base mb-3 text-center">
                      Utilizamos cookies y tecnologías similares para mejorar tu experiencia de navegación en nuestra tienda online. Estas pequeñas herramientas nos permiten recordar tus preferencias, mantener los productos en tu carrito de compras y analizar el tráfico del sitio para mejorar continuamente nuestro servicio.
                    </p>
                    <p className="font-sans font-light text-white/70 leading-relaxed text-sm md:text-base text-center">
                      Al continuar navegando en nuestra página, aceptas el uso de estas tecnologías. Puedes configurar tu navegador para rechazar las cookies, pero ten en cuenta que algunas funciones de la tienda (como el carrito de compras) podrían no funcionar correctamente.
                    </p>
                  </div>

                  {/* Footer Note */}
                  <div className="mt-12 pt-6 border-t border-gold/20 text-center">
                    <p className="font-sans font-light text-white/50 text-xs md:text-sm">
                      Última actualización: {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>

                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
