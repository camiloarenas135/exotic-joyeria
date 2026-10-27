import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

export interface FaqItem {
  q: string;
  a: ReactNode;
}

/**
 * Preguntas frecuentes con <details>/<summary> nativos: Enter y Espacio abren y cierran, el foco y el
 * estado expandido los gestiona el navegador y funciona sin JavaScript. Cada resumen mide ≥ 44 px.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="max-w-3xl mx-auto border-t border-black/15">
      {items.map((it) => (
        <details key={it.q} className="faq group border-b border-black/15">
          <summary className="flex items-center justify-between gap-4 min-h-14 py-3 cursor-pointer text-left font-serif text-base md:text-lg text-ink hover:text-gold-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-dark">
            <span>{it.q}</span>
            <Plus size={18} aria-hidden className="shrink-0 text-gold-ink transition-transform duration-200 motion-reduce:transition-none group-open:rotate-45" />
          </summary>
          <div className="pb-5 pr-8 text-sm md:text-base text-black/70 leading-relaxed">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
