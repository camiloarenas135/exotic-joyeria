import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeSearchQuery } from '../lib/sanitize';
import { formatCOP } from '../lib/pricing';

export interface ProductHit {
  id: string;
  name: string;
  price_cop: number | null;
}

interface Props {
  value: ProductHit | null;
  onChange: (p: ProductHit | null) => void;
  /** Muestra el precio junto al nombre (útil en promociones) */
  showPrice?: boolean;
  inputClassName: string;
}

/** Buscador de productos por nombre con debounce (admin). */
export default function ProductPicker({ value, onChange, showPrice = true, inputClassName }: Props) {
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);

  useEffect(() => {
    const q = sanitizeSearchQuery(search);
    if (value || q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name, price_cop').ilike('name', `%${q}%`).limit(8);
      setHits((data || []) as ProductHit[]);
    }, 300);
    return () => clearTimeout(t);
  }, [search, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 border border-black/20 bg-white p-3 min-h-11">
        <span className="text-sm min-w-0 break-words">{value.name}{showPrice ? ` · ${formatCOP(value.price_cop)}` : ''}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Quitar producto" className="p-2 -m-2 shrink-0"><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/65" />
      <input
        className={`${inputClassName} pl-9`}
        placeholder="Busca por nombre (mín. 2 letras)"
        aria-label="Buscar producto por nombre"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {hits.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 bg-white border border-black/10 shadow-lg max-h-56 overflow-y-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => { onChange(h); setSearch(''); }} className="w-full text-left px-3 py-3 min-h-11 text-sm hover:bg-gray-50 flex justify-between gap-3">
                <span className="truncate">{h.name}</span>
                {showPrice && <span className="text-black/65 shrink-0">{formatCOP(h.price_cop)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
