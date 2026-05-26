import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck } from 'lucide-react';

interface CertificationsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Certifications({ isOpen, onClose }: CertificationsProps) {
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
              className="bg-[#111] text-white w-full max-w-2xl rounded-2xl shadow-2xl pointer-events-auto relative overflow-hidden border border-gold/20"
            >
              {/* Close button */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/40 hover:text-white transition-colors z-20"
                aria-label="Cerrar"
              >
                <X size={24} strokeWidth={1.5} />
              </button>

              <div className="p-8 md:p-12 text-center relative">
                {/* Subtle background decoration */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-gold/10 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <div className="h-[1px] w-8 bg-gold/40"></div>
                    <span className="text-gold font-medium tracking-[0.2em] uppercase text-xs flex items-center gap-2">
                      <ShieldCheck size={16} />
                      Calidad Garantizada
                    </span>
                    <div className="h-[1px] w-8 bg-gold/40"></div>
                  </div>
                  
                  <h2 className="font-serif text-2xl md:text-3xl text-white tracking-widest mb-10 uppercase">
                    Oro Laminado 18K
                  </h2>
                  
                  {/* Visual representation of layers */}
                  <div className="max-w-md mx-auto mb-10 relative">
                    <div className="aspect-square max-h-[280px] mx-auto rounded-full border-[3px] border-gold p-8 flex flex-col justify-center items-center relative overflow-hidden bg-gradient-to-b from-black/50 to-black/80 shadow-[0_0_30px_rgba(212,175,55,0.15)]">
                      
                      {/* Layers Stack */}
                      <div className="w-full max-w-[180px] space-y-1 relative z-10 transform -rotate-12 scale-110">
                        <div className="h-8 w-full bg-gradient-to-r from-[#FDE047] to-[#FEF08A] rounded-sm shadow-sm transform translate-x-6 flex items-center justify-end pr-2">
                          <span className="text-[8px] text-black/60 font-bold tracking-wider">3ª CAMADA ORO</span>
                        </div>
                        <div className="h-8 w-full bg-gradient-to-r from-[#FACC15] to-[#FDE047] rounded-sm shadow-sm transform translate-x-3 flex items-center justify-end pr-2">
                          <span className="text-[8px] text-black/60 font-bold tracking-wider">2ª CAMADA ORO</span>
                        </div>
                        <div className="h-8 w-full bg-gradient-to-r from-[#EAB308] to-[#FACC15] rounded-sm shadow-sm flex items-center justify-end pr-2">
                          <span className="text-[8px] text-black/60 font-bold tracking-wider">1ª CAMADA ORO</span>
                        </div>
                        <div className="h-6 w-full bg-gradient-to-r from-[#A8A29E] to-[#D6D3D1] rounded-sm shadow-sm transform -translate-x-3 flex items-center justify-end pr-2">
                          <span className="text-[8px] text-black/60 font-bold tracking-wider">PALADIO</span>
                        </div>
                        <div className="h-6 w-full bg-gradient-to-r from-[#92400E] to-[#B45309] rounded-sm shadow-sm transform -translate-x-6 flex items-center justify-end pr-2">
                          <span className="text-[8px] text-white/80 font-bold tracking-wider">COBRE ÁCIDO</span>
                        </div>
                        <div className="h-6 w-full bg-gradient-to-r from-[#D97706] to-[#F59E0B] rounded-sm shadow-sm transform -translate-x-9 flex items-center justify-end pr-2">
                          <span className="text-[8px] text-white/80 font-bold tracking-wider">COBRE BÁSICO</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <p className="font-sans font-light text-base md:text-lg text-white/80 leading-relaxed max-w-xl mx-auto">
                    Las prendas en <strong className="text-gold font-normal">oro laminado 18k</strong> son semi joyas, puedes tener prendas con la textura y el color del oro 18k a un precio más asequible.
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
