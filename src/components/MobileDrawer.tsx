import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Search, MessageCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCategories } from '../context/CategoriesContext';
import { sanitizeString } from '../lib/sanitize';
import { whatsappLink } from '../lib/config';

export default function MobileDrawer() {
  const { isMenuOpen, setIsMenuOpen } = useAppContext();
  const { categories } = useCategories();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen, setIsMenuOpen]);

  if (!isMenuOpen) return null;

  const close = () => setIsMenuOpen(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = sanitizeString(term, 100);
    if (!q) return;
    close();
    navigate(`/buscar?q=${encodeURIComponent(q)}`);
  };

  const link = 'block py-4 min-h-11 border-b border-black/10 text-[13px] uppercase tracking-[0.18em] text-ink hover:text-gold-dark';

  return (
    <div className="fixed inset-0 z-[65] bg-ivory flex flex-col lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="flex items-center justify-between px-4 h-16 border-b border-black/10">
        <span className="font-serif text-xl tracking-widest">EXÓTIC</span>
        <button ref={closeRef} onClick={close} className="p-3 -mr-3" aria-label="Cerrar menú">
          <X size={26} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <form onSubmit={submit} className="relative mb-6" role="search">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            type="search"
            value={term}
            maxLength={100}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar joyas…"
            aria-label="Buscar joyas"
            className="w-full border border-black/20 bg-ivory pl-10 pr-3 min-h-11 text-sm focus:outline-none focus:border-gold-dark"
          />
        </form>

        <nav aria-label="Categorías">
          <Link to="/catalogo" onClick={close} className={link}>Ver todo</Link>
          {categories.map((c) => (
            <Link key={c.id} to={`/categoria/${c.slug}`} onClick={close} className={link}>
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="mt-8 space-y-1">
          <Link to="/mayoristas" onClick={close} className={link}>Mayoristas</Link>
          <Link to="/emprendedor" onClick={close} className={link}>Kit Emprendedor</Link>
        </div>

        <a
          href={whatsappLink('Hola, quiero más información.')}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center justify-center gap-2 min-h-11 bg-[#1f8f4a] text-white text-xs uppercase tracking-widest"
        >
          <MessageCircle size={18} /> Escríbenos por WhatsApp
        </a>
      </div>
    </div>
  );
}
