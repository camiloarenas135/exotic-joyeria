import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Retraso (ms) para escalonar varios bloques seguidos. */
  delay?: number;
}

/**
 * Fade-up sutil (10 px, 500 ms) la primera vez que el bloque entra en pantalla.
 * Sin animación si el usuario pidió reducir movimiento, si el navegador no tiene IntersectionObserver
 * o si el bloque ya está a la vista al cargar: en esos casos el contenido simplemente está ahí.
 * La regla CSS vive en index.css dentro de @media (prefers-reduced-motion: no-preference).
 */
export default function Reveal({ children, className = '', delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState('hidden');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-reveal={state === 'idle' ? undefined : state}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
