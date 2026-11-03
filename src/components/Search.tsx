import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useDialog } from '../lib/useDialog';
import { Search as SearchIcon, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCategories } from '../context/CategoriesContext';
import { sanitizeString } from '../lib/sanitize';

export default function Search() {
  const { isSearchOpen, setIsSearchOpen } = useAppContext();
  const { categories } = useCategories();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const panelRef = useDialog<HTMLDivElement>(isSearchOpen, () => setIsSearchOpen(false));

  if (!isSearchOpen) return null;

  const close = () => setIsSearchOpen(false);

  const go = (raw: string) => {
    const q = sanitizeString(raw, 100);
    if (!q) return;
    close();
    navigate(`/buscar?q=${encodeURIComponent(q)}`);
  };

  const needle = term.trim().toLowerCase();
  const suggestions = needle
    ? categories.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 5)
    : categories.slice(0, 7);

  return createPortal(
    <div ref={panelRef} className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Buscar">
      <div className="absolute inset-0 bg-black/70" onClick={close} />
      <div className="absolute top-0 left-0 w-full bg-ivory shadow-2xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 relative">
          <button onClick={close} className="absolute top-4 right-4 p-2 text-black/50 hover:text-ink" aria-label="Cerrar búsqueda">
            <X size={28} strokeWidth={1.5} />
          </button>
          <h2 className="font-serif text-2xl text-ink mb-6 text-center">¿Qué estás buscando?</h2>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              go(term);
            }}
            className="relative"
          >
            <SearchIcon size={24} className="absolute left-0 top-1/2 -translate-y-1/2 text-black/40" strokeWidth={1.5} />
            <input
              data-autofocus
              type="search"
              value={term}
              maxLength={100}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Anillos, cadenas, pulseras…"
              aria-label="Buscar joyas"
              className="w-full bg-transparent border-b-2 border-black/15 text-xl text-ink placeholder:text-black/30 py-3 pl-10 pr-4 focus:outline-none focus:border-gold-dark font-light"
            />
          </form>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-widest text-black/50 mb-3">{needle ? 'Colecciones' : 'Colecciones sugeridas'}</p>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/coleccion/${c.slug}`}
                    onClick={close}
                    className="inline-flex items-center border border-black/15 px-4 min-h-11 text-sm text-ink hover:border-gold-dark hover:text-gold-dark transition-colors"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
              {needle && (
                <li>
                  <button
                    onClick={() => go(term)}
                    className="inline-flex items-center bg-ink text-ivory px-4 min-h-11 text-sm hover:bg-gold-dark transition-colors"
                  >
                    Buscar “{sanitizeString(term, 40)}”
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
