import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface OurStoryProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OurStory({ isOpen, onClose }: OurStoryProps) {
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#faf9f7] w-full max-w-2xl rounded-2xl shadow-2xl pointer-events-auto relative overflow-hidden"
            >
              {/* Close button */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-black/40 hover:text-black transition-colors z-20"
                aria-label="Cerrar"
              >
                <X size={24} strokeWidth={1.5} />
              </button>

              <div className="p-8 md:p-12 text-center relative">
                {/* Subtle background decoration */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-gold/10 rounded-full blur-2xl pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <div className="h-[1px] w-8 bg-gold/40"></div>
                    <span className="text-gold font-medium tracking-[0.2em] uppercase text-xs">Nuestra Historia</span>
                    <div className="h-[1px] w-8 bg-gold/40"></div>
                  </div>
                  
                  <h2 className="font-serif text-2xl md:text-3xl text-black tracking-wide mb-6">
                    Nuestra Actualidad
                  </h2>
                  
                  <p className="font-sans font-light text-base md:text-lg text-black/70 leading-relaxed">
                    Lo que nació como un pequeño emprendimiento de reventa y pedidos personalizados, hoy se ha consolidado como un local físico referente en joyería de Oro Laminado, Rodio y Plata. Seguimos manteniendo la misma esencia del primer día: evolucionar junto a nuestros clientes para ofrecer siempre lo mejor.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
