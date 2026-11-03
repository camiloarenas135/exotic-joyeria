import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Varios diálogos pueden apilarse: la página solo se libera al cerrar el último.
let openCount = 0;
let savedOverflow = '';
const stack: symbol[] = [];

function lockPage() {
  if (openCount++ > 0) return;
  const root = document.getElementById('root');
  root?.setAttribute('inert', '');
  root?.setAttribute('aria-hidden', 'true');
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function unlockPage() {
  if (--openCount > 0) return;
  openCount = 0;
  const root = document.getElementById('root');
  root?.removeAttribute('inert');
  root?.removeAttribute('aria-hidden');
  document.body.style.overflow = savedOverflow;
}

/**
 * Comportamiento común de diálogo modal: página inerte detrás, trampa de Tab,
 * Escape para cerrar, foco inicial y retorno del foco al elemento que lo abrió.
 *
 * El diálogo debe renderizarse con `createPortal(..., document.body)`: si vive
 * dentro de `#root`, quedaría inerte junto con el resto de la página.
 * Asigna el `ref` devuelto al panel. El foco inicial va al elemento con
 * `data-autofocus` o, si no hay, al primero enfocable.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const panelRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockPage();
    const me = Symbol('dialog');
    stack.push(me);

    const items = () =>
      panelRef.current
        ? (Array.from(panelRef.current.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((el) => el.offsetParent !== null)
        : [];

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0];
      if (target) target.focus();
      else {
        panel.tabIndex = -1;
        panel.focus();
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      unlockPage();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return panelRef;
}
