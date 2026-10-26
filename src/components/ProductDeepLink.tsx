import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import type { Product } from '../context/AppContext';
import { fetchProductById, UUID_RE } from '../lib/catalog';
import ProductModal from './ProductModal';

const PARAM = 'producto';
const OPENED_STATE = 'productoAbierto';

// Productos ya cargados por las grillas: el modal abre al instante sin otra consulta
const known = new Map<string, Product>();
export function rememberProducts(products: Product[]) {
  products.forEach((p) => known.set(p.id, p));
}

// Elemento que abrió el modal, para devolverle el foco al cerrar
let lastTrigger: HTMLElement | null = null;

/** Abre el modal de un producto agregando solo ?producto=<id> a los parámetros actuales. */
export function useOpenProduct() {
  const [params, setParams] = useSearchParams();
  return useCallback(
    (id: string) => {
      if (!UUID_RE.test(id)) return;
      lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const next = new URLSearchParams(params);
      next.set(PARAM, id);
      setParams(next, { state: { [OPENED_STATE]: true } });
    },
    [params, setParams]
  );
}

/** Único dueño del modal de producto: se monta en StoreLayout y lee ?producto=. */
export default function ProductDeepLink() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const raw = params.get(PARAM);
  const [loaded, setLoaded] = useState<Product | null>(null);
  const wasOpen = useRef(false);

  const strip = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(PARAM);
        return next;
      },
      { replace: true }
    );
  }, [setParams]);

  useEffect(() => {
    if (raw === null) {
      setLoaded(null);
      return;
    }
    if (!UUID_RE.test(raw)) {
      strip();
      return;
    }
    const hit = known.get(raw);
    if (hit) {
      setLoaded(hit);
      return;
    }
    let cancelled = false;
    fetchProductById(raw)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          known.set(p.id, p);
          setLoaded(p);
        } else strip();
      })
      .catch(() => !cancelled && strip());
    return () => {
      cancelled = true;
    };
  }, [raw, strip]);

  const product = raw !== null && loaded?.id === raw ? loaded : null;

  // Al cerrar, el foco vuelve al elemento que abrió el modal
  useEffect(() => {
    if (product) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      if (lastTrigger?.isConnected) lastTrigger.focus();
      lastTrigger = null;
    }
  }, [product]);

  // Si lo abrimos nosotros, cerrar = Atrás (deja el historial limpio); si llegó por enlace, se quita el parámetro
  const close = useCallback(() => {
    if ((location.state as Record<string, unknown> | null)?.[OPENED_STATE]) navigate(-1);
    else strip();
  }, [location.state, navigate, strip]);

  return <AnimatePresence>{product && <ProductModal product={product} onClose={close} />}</AnimatePresence>;
}
