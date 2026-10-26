import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number; // base 1
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, pageSize, onChange }: Props) {
  if (totalPages <= 1) return null;

  const items: (number | 'dots')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      if (items.length && typeof items[items.length - 1] === 'number' && i - (items[items.length - 1] as number) > 1) items.push('dots');
      items.push(i);
    }
  }

  const btn = (disabled: boolean) =>
    `min-w-11 h-11 flex items-center justify-center border transition-colors ${
      disabled ? 'border-black/10 text-black/20 cursor-not-allowed' : 'border-black/20 text-ink hover:border-gold-dark hover:text-gold-dark'
    }`;

  return (
    <nav aria-label="Paginación" className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-12 pt-8 border-t border-black/10">
      <p className="text-xs uppercase tracking-widest text-black/60 font-medium">
        Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total} piezas
      </p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className={btn(page <= 1)} aria-label="Página anterior">
          <ChevronLeft size={18} />
        </button>
        {items.map((item, idx) =>
          item === 'dots' ? (
            <span key={`d${idx}`} className="px-1.5 text-black/30 text-xs select-none">…</span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item)}
              aria-current={page === item ? 'page' : undefined}
              className={`min-w-11 h-11 text-sm font-serif border transition-colors ${
                page === item ? 'bg-ink text-ivory border-ink' : 'border-black/15 text-black/70 hover:border-gold-dark hover:text-gold-dark'
              }`}
            >
              {item}
            </button>
          )
        )}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={btn(page >= totalPages)} aria-label="Página siguiente">
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}
