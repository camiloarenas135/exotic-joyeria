import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, Menu, ChevronDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCategories } from '../context/CategoriesContext';
import BrandLogo from './BrandLogo';

const navClass = (active: boolean) =>
  `whitespace-nowrap text-[11px] uppercase tracking-[0.18em] py-3 border-b-2 transition-colors duration-200 ${
    active ? 'border-gold-dark text-ink' : 'border-transparent text-black/70 hover:text-ink'
  }`;

/** "Catálogo" abre un panel (patrón disclosure): el botón no navega, el primer ítem sí lleva a /catalogo. */
function CatalogMenu() {
  const { categories } = useCategories();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const active = pathname === '/catalogo' || pathname.startsWith('/coleccion/');

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }, []);

  // Al cambiar de ruta se cierra
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(true);
    const onPointer = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  const item = 'block px-5 py-3 min-h-11 text-[11px] uppercase tracking-[0.18em] text-black/80 hover:bg-surface hover:text-ink';

  return (
    <div
      ref={boxRef}
      className="relative"
      onBlur={(e) => {
        if (open && !boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="menu-catalogo"
        className={`${navClass(active)} inline-flex items-center gap-1 min-h-11`}
      >
        Catálogo <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        id="menu-catalogo"
        hidden={!open}
        className="absolute left-1/2 -translate-x-1/2 top-full mt-px bg-ivory border border-black/10 shadow-lg min-w-64 max-h-[min(70vh,26rem)] overflow-y-auto py-2 z-10"
      >
        <ul>
          <li>
            <Link to="/catalogo" onClick={() => close()} className={`${item} font-semibold text-ink`}>Ver todo el catálogo</Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link to={`/coleccion/${c.slug}`} onClick={() => close()} className={item}>{c.name}</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Header() {
  const { setIsCartOpen, setIsSearchOpen, setIsMenuOpen, cart } = useAppContext();
  const [scrolled, setScrolled] = useState(false);

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-ink focus:text-ivory focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>

      {/* Franja fina */}
      <div className="bg-ink text-ivory text-[11px] tracking-[0.2em] uppercase">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-center">
          <p className="truncate">Envío asegurado a todo el país</p>
        </div>
      </div>

      <header className="sticky top-0 z-50 bg-ivory border-b border-black/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`flex items-center justify-between gap-4 transition-[height] duration-300 ${scrolled ? 'h-14' : 'h-[72px]'}`}>
            <div className="flex items-center gap-1 lg:w-1/3">
              <button
                onClick={() => setIsMenuOpen(true)}
                className="lg:hidden p-3 -ml-3 text-ink hover:text-gold-dark transition-colors"
                aria-label="Abrir menú"
              >
                <Menu size={24} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setIsSearchOpen(true)}
                className="hidden lg:flex items-center gap-3 border border-black/15 text-black/50 hover:border-ink hover:text-ink transition-colors px-4 min-h-11 w-full max-w-xs text-sm"
                aria-label="Buscar productos"
              >
                <Search size={18} strokeWidth={1.5} />
                <span>Buscar joyas…</span>
              </button>
            </div>

            <Link to="/" className="flex items-center justify-center min-h-11 shrink-0" aria-label="Exotic Joyería, ir al inicio">
              <BrandLogo
                markClassName={scrolled ? 'h-8 md:h-9' : 'h-10 md:h-12'}
                textClassName={scrolled ? 'text-base md:text-xl' : 'text-[17px] md:text-2xl'}
              />
            </Link>

            <div className="flex items-center justify-end gap-1 lg:w-1/3">
              <button
                onClick={() => setIsSearchOpen(true)}
                className="lg:hidden p-3 text-ink hover:text-gold-dark transition-colors"
                aria-label="Buscar productos"
              >
                <Search size={22} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-3 -mr-3 lg:mr-0 text-ink hover:text-gold-dark transition-colors"
                aria-label={`Abrir carrito${cartItemCount > 0 ? `, ${cartItemCount} artículos` : ''}`}
              >
                <ShoppingBag size={22} strokeWidth={1.5} />
                {cartItemCount > 0 && (
                  <span className="absolute top-1 right-0 bg-ink text-gold text-[10px] min-w-4 h-4 px-1 flex items-center justify-center font-semibold">
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Segunda fila: menú principal (solo escritorio; en móvil lo cubre el drawer) */}
        <div className="hidden lg:block border-t border-black/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav aria-label="Principal" className="flex items-center justify-center gap-7 h-11">
              <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>Inicio</NavLink>
              <CatalogMenu />
              <NavLink to="/mayoristas" className={({ isActive }) => navClass(isActive)}>Mayorista</NavLink>
              <NavLink to="/emprendedor" className={({ isActive }) => navClass(isActive)}>Emprendedor</NavLink>
              <NavLink to="/promociones" className={({ isActive }) => navClass(isActive)}>Promociones</NavLink>
            </nav>
          </div>
        </div>
      </header>

    </>
  );
}
