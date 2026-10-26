import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Search, ShoppingBag, Menu, User, ChevronDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useCategories } from '../context/CategoriesContext';

const MORE_WIDTH = 96;
const ALL_WIDTH = 90; // "Ver todo" fijo
const ITEM_GAP = 28;

const navClass = (active: boolean) =>
  `whitespace-nowrap text-[11px] uppercase tracking-[0.18em] py-3 border-b-2 transition-colors duration-200 ${
    active ? 'border-gold-dark text-ink' : 'border-transparent text-black/70 hover:text-ink'
  }`;

export default function Header() {
  const { setIsCartOpen, setIsSearchOpen, setIsMenuOpen, cart } = useAppContext();
  const { categories } = useCategories();
  const [scrolled, setScrolled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(categories.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const cartItemCount = cart.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Calcula cuántas categorías caben; las sobrantes van a "Más" (sin scroll horizontal)
  useLayoutEffect(() => {
    const compute = () => {
      const row = rowRef.current;
      const measure = measureRef.current;
      if (!row || !measure) return;
      const widths = Array.from(measure.children).map((el) => (el as HTMLElement).offsetWidth);
      const available = row.clientWidth - ALL_WIDTH;
      const totalWidth = widths.reduce((s, w) => s + w + ITEM_GAP, 0);
      if (totalWidth - ITEM_GAP <= available) {
        setVisibleCount(widths.length);
        return;
      }
      let used = MORE_WIDTH;
      let count = 0;
      for (const w of widths) {
        if (used + w + ITEM_GAP > available) break;
        used += w + ITEM_GAP;
        count++;
      }
      setVisibleCount(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (rowRef.current) ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, [categories]);

  const visible = categories.slice(0, visibleCount);
  const overflow = categories.slice(visibleCount);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between">
          <p className="truncate">Envío asegurado a todo el país</p>
          <nav aria-label="Accesos rápidos" className="hidden sm:flex items-center gap-6">
            <Link to="/mayoristas" className="hover:text-gold transition-colors">Mayoristas</Link>
            <Link to="/emprendedor" className="hover:text-gold transition-colors">Emprendedor</Link>
          </nav>
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

            <Link to="/" className="flex items-center justify-center" aria-label="Exotic Joyería, ir al inicio">
              <img
                src="/logo.png"
                alt="Exotic Joyería"
                width={160}
                height={56}
                className={`w-auto object-contain bg-ink px-3 transition-[height] duration-300 ${scrolled ? 'h-10' : 'h-14'}`}
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
              <Link
                to="/mayoristas"
                className="hidden lg:inline-flex items-center gap-2 px-3 min-h-11 text-[11px] uppercase tracking-[0.18em] text-ink hover:text-gold-dark transition-colors"
              >
                <User size={18} strokeWidth={1.5} /> Mayoristas
              </Link>
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

        {/* Segunda fila: categorías (solo escritorio) */}
        <div className="hidden lg:block border-t border-black/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <nav ref={rowRef} aria-label="Categorías" className="flex items-center justify-center gap-7 h-11">
              <NavLink to="/catalogo" className={({ isActive }) => navClass(isActive)}>Ver todo</NavLink>
              {visible.map((c) => (
                <NavLink key={c.id} to={`/categoria/${c.slug}`} className={({ isActive }) => navClass(isActive)}>
                  {c.name}
                </NavLink>
              ))}
              {overflow.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setMoreOpen((v) => !v)}
                    onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget as Node) && setMoreOpen(false)}
                    aria-expanded={moreOpen}
                    aria-haspopup="true"
                    className={`${navClass(false)} inline-flex items-center gap-1`}
                  >
                    Más <ChevronDown size={14} />
                  </button>
                  {moreOpen && (
                    <ul className="absolute right-0 top-full mt-px bg-ivory border border-black/10 shadow-lg min-w-48 py-2 z-10">
                      {overflow.map((c) => (
                        <li key={c.id}>
                          <Link
                            to={`/categoria/${c.slug}`}
                            onClick={() => setMoreOpen(false)}
                            className="block px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-black/80 hover:bg-surface hover:text-ink"
                          >
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </nav>
            {/* Medidor invisible para saber cuántas caben */}
            <div ref={measureRef} aria-hidden="true" className="absolute left-0 top-0 invisible h-0 overflow-hidden flex gap-7 whitespace-nowrap pointer-events-none">
              {categories.map((c) => (
                <span key={c.id} className="text-[11px] uppercase tracking-[0.18em] border-b-2">{c.name}</span>
              ))}
            </div>
          </div>
        </div>
      </header>

    </>
  );
}
