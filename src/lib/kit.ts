import { useEffect, useState } from 'react';
import { fetchCatalog } from './catalog';
import type { Product } from '../context/AppContext';

/** Precio de lista del kit cuando el producto no está en el catálogo (el mismo valor que ya publicaba el sitio). */
export const KIT_FALLBACK_COP = 500_000;

/** Lo que incluye el Kit Emprendedor. Única fuente para la Home y /emprendedor. */
export const KIT_INCLUDES = [
  { title: 'Asesoría en oro laminado', text: 'Te orientamos sobre el material y las piezas.' },
  { title: 'Asesoría para crear tu página', text: 'Acompañamiento para tener tu propia tienda en línea.' },
  { title: 'Creación de logo', text: 'Una identidad para tu marca.' },
  { title: 'Curso de tejidos', text: 'Las técnicas para armar tus propias joyas.' },
  { title: 'Tabla para tejer', text: 'La herramienta para practicar y producir.' },
  { title: 'Insumos en oro laminado', text: 'Balines, herrajes, neoprenos e hilos.' },
] as const;

/** Busca el producto "Kit Emprendedor" en el catálogo al detal. Si no existe o falla, `kit` queda en null. */
export function useKit(enabled = true): { kit: Product | null; loaded: boolean } {
  const [state, setState] = useState<{ kit: Product | null; loaded: boolean }>({ kit: null, loaded: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchCatalog({ search: 'Kit Emprendedor', pageSize: 1 })
      .then((r) => !cancelled && setState({ kit: r.products[0] ?? null, loaded: true }))
      .catch(() => !cancelled && setState({ kit: null, loaded: true }));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
