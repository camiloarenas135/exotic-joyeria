import type { LucideIcon } from 'lucide-react';

export interface TrustItem {
  icon: LucideIcon;
  title: string;
  text: string;
}

/** Franja de beneficios: 2×2 en móvil, 4 en fila en escritorio. Solo debe llevar afirmaciones que ya publica el sitio. */
export default function TrustBar({ items, label = 'Beneficios' }: { items: TrustItem[]; label?: string }) {
  return (
    <section aria-label={label} className="bg-surface border-y border-black/5">
      <ul className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-center gap-3 min-w-0">
            <Icon size={26} strokeWidth={1.25} className="text-gold-ink shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest font-semibold text-ink">{title}</p>
              <p className="text-xs text-black/65">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
