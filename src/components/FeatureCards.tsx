import type { LucideIcon } from 'lucide-react';

export interface Feature {
  icon: LucideIcon;
  title: string;
  text?: string;
}

/** Tarjetas con icono de línea fina: bordes de 1 px, esquinas rectas. */
export default function FeatureCards({ items, className = 'sm:grid-cols-2 lg:grid-cols-3' }: { items: Feature[]; className?: string }) {
  return (
    <ul className={`grid grid-cols-1 gap-4 ${className}`}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="border border-black/10 bg-ivory p-6 flex flex-col gap-3 hover:border-gold-ink/60 transition-colors motion-reduce:transition-none">
          <Icon size={28} strokeWidth={1.25} className="text-gold-ink" aria-hidden />
          <h3 className="font-serif text-lg text-ink leading-snug">{title}</h3>
          {text && <p className="text-sm text-black/70 leading-relaxed">{text}</p>}
        </li>
      ))}
    </ul>
  );
}
