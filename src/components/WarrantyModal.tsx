import { motion, AnimatePresence } from 'motion/react';
import { X, Shield } from 'lucide-react';

interface WarrantyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WarrantyModal({ isOpen, onClose }: WarrantyModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />
          
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0a0a0a] text-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl pointer-events-auto relative border border-gold/20 scrollbar-thin scrollbar-thumb-gold/20 scrollbar-track-transparent"
            >
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/40 hover:text-gold transition-colors z-20 bg-black/50 rounded-full"
                aria-label="Cerrar"
              >
                <X size={24} strokeWidth={1.5} />
              </button>

              <div className="p-8 md:p-12 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-64 bg-gold/5 blur-3xl pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="h-[1px] w-12 bg-gold/40"></div>
                    <h2 className="font-serif text-2xl md:text-3xl text-gold tracking-widest uppercase text-center">
                      Garantía de Calidad
                    </h2>
                    <div className="h-[1px] w-12 bg-gold/40"></div>
                  </div>
                  
                  <div className="space-y-6 mt-10">
                    <div className="flex justify-center mb-6 text-gold/80">
                      <Shield size={48} strokeWidth={1} />
                    </div>
                    <p className="font-sans font-light text-white/70 leading-relaxed text-base md:text-lg text-center">
                      El Oro Laminado que manejamos en Exotic Joyería tiene <strong className="text-gold">5 Años de garantía</strong> por cambio o pérdida de color. No se garantiza por rupturas o rayones.
                    </p>
                    <p className="font-sans font-light text-white/70 leading-relaxed text-base md:text-lg text-center">
                      Resaltamos que manejamos chapado en 18 kilates con más de 5 micras de Oro, <strong className="text-gold">LA MEJOR CALIDAD</strong>.
                    </p>
                    <p className="font-sans font-light text-white/70 leading-relaxed text-base md:text-lg text-center">
                      Si deseas hacer un cambio de accesorio por temas de garantía en Oro laminado, <strong>no nos hacemos cargo de costos de envíos y demás</strong>.
                    </p>
                  </div>

                  <div className="mt-12 pt-6 border-t border-gold/20 text-center">
                    <a href="https://www.instagram.com/exoticjoyeria16?igsh=MTMxbGM2anpwbnJzZg==&utm_source=ig_contact_invite" target="_blank" rel="noopener noreferrer" className="font-sans font-light text-white/50 hover:text-gold transition-colors text-xs md:text-sm inline-flex items-center gap-2">
                      @EXOTICJOYERIA16
                    </a>
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
