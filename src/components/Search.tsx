import { Search as SearchIcon, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { sanitizeString } from '../lib/sanitize';

export default function Search() {
  const { isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useAppContext();
  
  const handleSearch = (term?: string) => {
    if (term !== undefined) {
      setSearchQuery(sanitizeString(term));
    } else {
      setSearchQuery(sanitizeString(searchQuery));
    }
    setIsSearchOpen(false);
    
    // Smooth scroll to catalog section
    const catalogSection = document.getElementById('catálogo');
    if (catalogSection) {
      catalogSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!isSearchOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 z-[80] backdrop-blur-md transition-opacity"
        onClick={() => setIsSearchOpen(false)}
      />

      {/* Search Overlay */}
      <div className="fixed top-0 left-0 w-full h-64 bg-white z-[90] shadow-2xl flex flex-col transform transition-transform duration-500 ease-in-out">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 h-full flex flex-col justify-center relative">
          
          <button 
            onClick={() => setIsSearchOpen(false)}
            className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors"
          >
            <X size={32} strokeWidth={1.5} />
          </button>

          <div className="text-center mb-8">
            <h2 className="font-serif text-3xl text-black tracking-wide">¿Qué estás buscando?</h2>
          </div>

          <div className="relative max-w-2xl mx-auto w-full">
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              placeholder="Buscar joyas, colecciones, materiales..." 
              className="w-full bg-transparent border-b-2 border-gray-200 text-2xl md:text-3xl text-black placeholder:text-gray-300 py-4 pl-12 pr-4 focus:outline-none focus:border-gold transition-colors font-light"
              autoFocus
            />
            <SearchIcon 
              size={28} 
              className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400" 
              strokeWidth={1.5}
            />
          </div>
          
          <div className="text-center mt-6">
            <p className="text-sm text-gray-400 font-light tracking-wide">
              Sugerencias: {['Anillos', 'Cadenas', 'Pulseras', 'Relojes', 'Topos', 'Rodio', 'Plata Ley 925'].map((cat, index, arr) => (
                <span key={cat}>
                  <span 
                    className="text-gold cursor-pointer hover:underline" 
                    onClick={() => handleSearch(cat)}
                  >
                    {cat}
                  </span>
                  {index < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
