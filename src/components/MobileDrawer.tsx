import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { X, Search, MessageCircle, ChevronDown, ShoppingBag, LogOut, ClipboardList } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCategories } from '../context/CategoriesContext';
import { useChannel } from '../context/ChannelContext';
import { useWholesaleCart } from '../context/WholesaleCartContext';
import { sanitizeString } from '../lib/sanitize';
import { whatsappLink } from '../lib/config';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileDrawer() {
  const { isMenuOpen, setIsMenuOpen } = useAppContext();
  const { visibleCategories: categories } = useCategories();
  const { channel, signOut } = useChannel();
  const { setDrawerOpen, units } = useWholesaleCart();
  const wholesale = channel === 'wholesale';
  const navigate = useNavigate();
  const location = useLocation();
  const [term, setTerm] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar al cambiar la ruta (incluye Atrás del navegador)
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.key, setIsMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    // El foco vuelve al botón que abrió el menú y el resto de la página queda inerte
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Focus trap: Tab cicla dentro del menú
      const items = (Array.from(panelRef.current.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      if (opener?.isConnected) opener.focus();
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
  const sub = 'block py-3 pl-4 min-h-11 border-b border-black/5 text-[12px] uppercase tracking-[0.18em] text-black/75 hover:text-gold-dark';

  return createPortal(
    <div ref={panelRef} className="fixed inset-0 z-[65] bg-ivory flex flex-col lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="flex items-center justify-between px-4 h-16 border-b border-black/10">
        <span className="font-serif text-xl tracking-widest">EXÓTIC</span>
        <button ref={closeRef} onClick={close} className="p-3 -mr-3" aria-label="Cerrar menú">
          <X size={26} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <form onSubmit={submit} className="relative mb-6" role="search">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/65" />
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

        <nav aria-label="Menú móvil">
          <Link to="/" onClick={close} className={link}>Inicio</Link>
          {/* Acordeón: el botón solo despliega, no navega */}
          <button
            type="button"
            onClick={() => setCatalogOpen((v) => !v)}
            aria-expanded={catalogOpen}
            aria-controls="drawer-catalogo"
            className={`${link} w-full flex items-center justify-between text-left`}
          >
            Catálogo <ChevronDown size={16} aria-hidden className={`transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
          </button>
          <div id="drawer-catalogo" hidden={!catalogOpen}>
            <Link to="/catalogo" onClick={close} className={`${sub} font-semibold text-ink`}>Ver todo el catálogo</Link>
            {categories.map((c) => (
              <Link key={c.id} to={`/coleccion/${c.slug}`} onClick={close} className={sub}>
                {c.name}
              </Link>
            ))}
          </div>
          {!wholesale && <Link to="/mayoristas" onClick={close} className={link}>Mayorista</Link>}
          {!wholesale && <Link to="/emprendedor" onClick={close} className={link}>Emprendedor</Link>}
          {wholesale && (
            <>
              <button type="button" onClick={() => { close(); setDrawerOpen(true); }} className={`${link} w-full flex items-center gap-2 text-left`}>
                <ShoppingBag size={16} aria-hidden /> Mi pedido{units > 0 ? ` (${units})` : ''}
              </button>
              <Link to="/mayoristas/pedidos" onClick={close} className={`${link} w-full flex items-center gap-2 text-left`}>
                <ClipboardList size={16} aria-hidden /> Mis pedidos
              </Link>
              <button type="button" onClick={() => { close(); void signOut(); }} className={`${link} w-full flex items-center gap-2 text-left`}>
                <LogOut size={16} aria-hidden /> Salir
              </button>
            </>
          )}
        </nav>

        <a
          href={whatsappLink('Hola, quiero más información.')}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center justify-center gap-2 min-h-11 bg-[#187a3e] text-white text-xs uppercase tracking-widest"
        >
          <MessageCircle size={18} /> {wholesale ? 'Soporte por WhatsApp' : 'Escríbenos por WhatsApp'}
        </a>
      </div>
    </div>,
    document.body
  );
}
