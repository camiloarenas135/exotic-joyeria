import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  /** id del botón principal de la página: la barra aparece cuando ese botón sale por arriba de la pantalla. */
  watchId: string;
  label: string;
  price: string;
  children: ReactNode;
}

/**
 * Barra fija inferior solo en móvil/tablet (< lg) con precio y acción principal. Respeta el área segura
 * (iPhone) y deja libre la derecha para el botón flotante de WhatsApp. Se oculta mientras el botón
 * principal de la página sigue a la vista, para no duplicar acciones.
 */
export default function StickyBuyBar({ watchId, label, price, children }: Props) {
  const [pastTarget, setPastTarget] = useState(false);
  const [atFooter, setAtFooter] = useState(false);

  useEffect(() => {
    const el = document.getElementById(watchId);
    if (!el || typeof IntersectionObserver === 'undefined') {
      setPastTarget(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPastTarget(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    // Al llegar al pie de página la barra se retira para no tapar el copyright ni los enlaces
    const footer = document.querySelector('footer');
    const fo = footer ? new IntersectionObserver(([e]) => setAtFooter(e.isIntersecting), { threshold: 0 }) : null;
    if (footer) fo?.observe(footer);
    return () => {
      io.disconnect();
      fo?.disconnect();
    };
  }, [watchId]);

  const show = pastTarget && !atFooter;

  return (
    <div
      data-testid="sticky-buy-bar"
      hidden={!show}
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-ivory border-t border-black/15 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="px-4 sm:px-6 py-2.5 pr-24 flex items-center gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-black/65 truncate">{label}</p>
          <p className="font-serif text-xl text-gold-ink leading-tight">{price}</p>
        </div>
        <div className="ml-auto shrink-0">{children}</div>
      </div>
    </div>
  );
}
