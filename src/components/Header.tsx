import { Search, User, ShoppingCart, Menu } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { CATALOG_FILTERS } from '../lib/categories';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { setIsCartOpen, setIsSearchOpen, cart, activeFilter, setActiveFilter } = useAppContext();

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const handleFilterClick = (item: string) => {
    setActiveFilter(item);
    setIsMenuOpen(false);
    
    // Smooth scroll to catalog section
    const catalogSection = document.getElementById('catálogo');
    if (catalogSection) {
      catalogSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <div className="w-full bg-white border-t-[3px] border-gold">
        {/* Top Bar (Scrolls away) */}
      <div className="w-full bg-black text-white text-xs text-center py-2 tracking-widest uppercase font-light">
        Envío asegurado a todo el país
      </div>

      {/* Dedicated Logo Section (Scrolls away) */}
      <div className="w-full h-[150px] bg-black relative overflow-hidden flex justify-center items-center border-b border-gold/40">
        {/* Decorative Gold Accents inside the logo container */}
        <div className="absolute top-0 left-0 w-16 h-16 border-t-[2px] border-l-[2px] border-gold/50 m-4 pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-16 h-16 border-t-[2px] border-r-[2px] border-gold/50 m-4 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-[2px] border-l-[2px] border-gold/50 m-4 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-[2px] border-r-[2px] border-gold/50 m-4 pointer-events-none"></div>
        
        <a href="#" className="relative z-10 w-full h-[100vh] flex justify-center items-center p-4 md:p-8">
          {/* 
            Contenedor de la imagen del logo. 
            El object-contain asegura que la imagen se acomode al tamaño del contenedor manteniendo su proporción original.
          */}
          <img 
            src="/logo.png" 
            alt="Exotic Joyería" 
            className="w-full h-full object-contain"
            onError={(e) => {
              // Fallback: Si la imagen no se encuentra, mostramos el texto
              e.currentTarget.style.display = 'none';
              const fallback = document.getElementById('fallback-logo-text');
              if (fallback) fallback.style.display = 'block';
            }}
          />
          
          {/* Texto de respaldo en caso de que la imagen no se haya subido aún */}
          <h1 
            id="fallback-logo-text"
            className="hidden font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-widest text-white font-normal text-center"
            style={{ textShadow: '0 0 15px rgba(255, 255, 255, 0.6)' }}
          >
            EXÓTIC JOYERÍA
            <span className="block text-sm font-sans text-gold mt-6 tracking-normal opacity-80">
              Para ver tu logo, sube la imagen a la carpeta <br/> <strong className="text-white">public</strong> con el nombre <strong className="text-white">logo.png</strong>
            </span>
          </h1>
        </a>
      </div>
    </div>

    {/* Sticky Navigation Header */}
    <header className={`sticky top-0 z-50 bg-white transition-all duration-300 ${isScrolled ? 'shadow-md py-1' : 'border-y border-gray-100 py-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 relative">
            
            {/* Left Section: Navigation */}
            <div className="flex items-center flex-1">
              {/* Mobile Menu Button */}
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex text-black hover:text-gold transition-colors"
                aria-label="Menú de categorías"
              >
                <Menu size={24} />
              </button>


            </div>

            {/* Center Section: Compact Logo (Visible only on scroll) */}
            <div className={`absolute left-1/2 -translate-x-1/2 transition-opacity duration-500 ${isScrolled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
              <a href="#" className="font-serif text-xl md:text-2xl tracking-widest text-black font-semibold">
                EXÓTIC
              </a>
            </div>

            {/* Right Section: Icons */}
            <div className="flex items-center justify-end space-x-6 flex-1">
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="text-black hover:text-gold transition-colors"
              >
                <Search size={20} strokeWidth={1.5} />
              </button>
              <button 
                onClick={() => setIsCartOpen(true)}
                className="text-black hover:text-gold transition-colors relative"
              >
                <ShoppingCart size={20} strokeWidth={1.5} />
                {cartItemCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-gold text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Categories Dropdown Menu */}
        {isMenuOpen && (
          <div className="bg-white border-t border-gray-100 absolute w-full left-0 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top duration-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {CATALOG_FILTERS.map((item) => (
                  <button
                    key={item}
                    onClick={() => handleFilterClick(item)}
                    className={`px-4 py-3 text-xs lg:text-sm uppercase tracking-widest text-center transition-all duration-300 border ${activeFilter === item ? 'text-gold border-gold bg-gold/5 font-medium' : 'text-black/70 border-transparent hover:text-black hover:bg-gray-50'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
