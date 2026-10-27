import type React from 'react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  /** Nombre de la fila: etiqueta las flechas ("Colecciones: anterior"). Debe ser único en la página. */
  label: string;
  children: ReactNode;
  /** Clases del contenedor <ul> (gap, padding...). */
  listClassName?: string;
  /** Color de fondo de la sección, para que el degradado de borde se funda con él. */
  fade?: 'ivory' | 'surface';
  /** Altura (en px) a la que se centran las flechas, medida desde arriba de la fila. */
  arrowTop?: number;
}

const DRAG_THRESHOLD = 5;
const EDGE = 2; // tolerancia por subpíxeles

/**
 * Fila de una sola línea que se desliza: swipe en táctil, scroll horizontal nativo (trackpad, Shift+rueda),
 * arrastre con ratón y flechas ‹ › (ocultas en táctil). La rueda vertical NO se secuestra.
 * El desbordamiento vive solo dentro de la lista: la página nunca gana scroll horizontal.
 * Los hijos deben ser <li> con ancho propio (shrink-0) y, opcionalmente, snap-start.
 */
export default function ScrollRow({ label, children, listClassName = '', fade = 'ivory', arrowTop }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const prevBtn = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0, pointerId: -1 });
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const prev = el.scrollLeft > EDGE;
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE;
    setEdges((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', schedule, { passive: true });
    // Un ResizeObserver sobre la lista solo ve su caja visible: se observan también los hijos
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const watch = () => {
      ro.disconnect();
      ro.observe(el);
      (Array.from(el.children) as Element[]).forEach((c) => ro.observe(c));
      schedule();
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  // Si el botón que tenía el foco desaparece (llegó al extremo), el foco pasa al opuesto.
  // Al desmontarse, el navegador deja el foco en <body> sin avisar: por eso se recuerda cuál lo tenía.
  const focused = useRef<'prev' | 'next' | null>(null);
  useEffect(() => {
    const lost = document.activeElement === document.body || document.activeElement === null;
    if (lost && focused.current === 'next' && !edges.next) prevBtn.current?.focus();
    if (lost && focused.current === 'prev' && !edges.prev) nextBtn.current?.focus();
  }, [edges]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  };

  // Arrastre con ratón (en táctil se deja el scroll nativo)
  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
    drag.current = { active: true, moved: false, startX: e.clientX, startLeft: ref.current.scrollLeft, pointerId: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      // Solo se captura el puntero al superar el umbral: un clic limpio sigue llegando al enlace
      d.moved = true;
      setDragging(true);
      try {
        el.setPointerCapture(d.pointerId);
      } catch {
        /* puntero ya liberado */
      }
    }
    el.scrollLeft = d.startLeft - dx;
  };
  const endDrag = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.moved) {
      setDragging(false);
      try {
        ref.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ya liberado */
      }
      // d.moved se queda en true hasta el click que sigue al soltar, para suprimirlo
      window.setTimeout(() => {
        d.moved = false;
      }, 0);
    }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const fadeFrom = fade === 'surface' ? 'from-surface' : 'from-ivory';
  const arrow =
    'hidden [@media(hover:hover)]:flex absolute z-10 -translate-y-1/2 size-10 items-center justify-center rounded-full bg-ivory text-ink border border-black/15 shadow-sm hover:bg-ink hover:text-ivory transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-dark';
  const top = arrowTop !== undefined ? `${arrowTop}px` : '50%';

  return (
    <div className="relative min-w-0 max-w-full" data-scrollrow>
      <ul
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
        style={dragging ? { scrollSnapType: 'none' } : undefined}
        className={`flex overflow-x-auto overscroll-x-contain snap-x snap-proximity scroll-px-2 hide-scrollbar min-w-0 [@media(hover:hover)]:cursor-grab ${dragging ? 'cursor-grabbing select-none' : ''} ${listClassName}`}
      >
        {children}
      </ul>
      {edges.prev && (
        <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r ${fadeFrom} to-transparent`} />
      )}
      {edges.next && (
        <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l ${fadeFrom} to-transparent`} />
      )}
      {edges.prev && (
        <button ref={prevBtn} type="button" onClick={() => page(-1)} onFocus={() => (focused.current = 'prev')} onBlur={() => (focused.current = null)} aria-label={`${label}: anterior`} className={`${arrow} left-0`} style={{ top }}>
          <ChevronLeft size={20} aria-hidden />
        </button>
      )}
      {edges.next && (
        <button ref={nextBtn} type="button" onClick={() => page(1)} onFocus={() => (focused.current = 'next')} onBlur={() => (focused.current = null)} aria-label={`${label}: siguiente`} className={`${arrow} right-0`} style={{ top }}>
          <ChevronRight size={20} aria-hidden />
        </button>
      )}
    </div>
  );
}
