import { motion, AnimatePresence } from 'motion/react';
import { X, FileText } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsModal({ isOpen, onClose }: TermsModalProps) {
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
                      Términos y Condiciones
                    </h2>
                    <div className="h-[1px] w-12 bg-gold/40"></div>
                  </div>
                  
                  <div className="space-y-6 mt-10">
                    <div className="flex justify-center mb-6 text-gold/80">
                      <FileText size={48} strokeWidth={1} />
                    </div>
                    <p className="font-serif italic text-white/80 text-lg md:text-xl text-center max-w-xl mx-auto leading-relaxed">
                      "Para Exotic Joyería nuestro cliente es la prioridad, por eso dejamos términos claros y nos comprometemos a brindarles lo mejor."
                    </p>
                    <p className="font-sans font-light text-white/60 leading-relaxed text-sm md:text-base text-center mt-6">
                      Al realizar una compra en nuestra tienda, aceptas nuestras políticas de envíos, garantías y devoluciones. Te invitamos a leer cada una de ellas en los enlaces correspondientes al pie de página para conocer todos los detalles.
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
