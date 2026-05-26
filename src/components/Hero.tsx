import { motion } from 'motion/react';

export default function Hero() {
  return (
    <section className="relative w-full h-[80vh] flex items-center justify-center overflow-hidden bg-gray-50">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-90"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1599643478524-fb66f70d00f0?q=80&w=2000&auto=format&fit=crop")',
        }}
      >
        {/* Subtle overlay for better text readability */}
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto flex flex-col items-center">
        {/* Decorative Gold Top Line */}
        <motion.div 
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="w-24 h-[2px] bg-gold mb-8"
        ></motion.div>

        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="font-serif text-5xl md:text-7xl lg:text-8xl text-black mb-6 tracking-tight"
        >
          Elegancia Atemporal
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="font-sans text-lg md:text-xl text-black/80 mb-10 font-light tracking-wide max-w-2xl"
        >
          Descubre nuestra nueva colección de oro laminado de 18k
        </motion.p>
        
        <motion.button 
          onClick={() => {
            document.getElementById('catálogo')?.scrollIntoView({ behavior: 'smooth' });
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden group bg-black text-white px-10 py-4 uppercase tracking-widest text-sm font-medium transition-all duration-300 border border-transparent hover:border-gold"
        >
          <span className="relative z-10 group-hover:text-gold transition-colors duration-300">Explorar Colección</span>
          {/* Subtle gold shine effect on hover */}
          <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-gold/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
        </motion.button>
      </div>
    </section>
  );
}
