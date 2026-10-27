import type React from 'react';
import { SORT_OPTIONS, type SortKey } from '../lib/catalog';
import { formatCOP } from '../lib/pricing';

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs uppercase tracking-widest text-black/60">
      <span className="whitespace-nowrap hidden sm:inline">Ordenar por</span>
      <select
        aria-label="Ordenar por"
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="bg-ivory border border-black/20 text-ink text-sm normal-case tracking-normal px-3 py-2 min-h-11 max-w-[12rem] sm:max-w-none focus:outline-none focus:border-gold-dark"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export interface Filters {
  min: number | null;
  max: number | null;
  inStock: boolean;
  promoOnly: boolean;
}

export const EMPTY_FILTERS: Filters = { min: null, max: null, inStock: false, promoOnly: false };

export function hasActiveFilters(f: Filters): boolean {
  return f.min !== null || f.max !== null || f.inStock || f.promoOnly;
}

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Hasta $100.000', min: null, max: 100_000 },
  { label: '$100.000 – $250.000', min: 100_000, max: 250_000 },
  { label: '$250.000 – $500.000', min: 250_000, max: 500_000 },
  { label: 'Más de $500.000', min: 500_000, max: null },
];

// Los precios mayoristas son menores: rangos propios para que los filtros sirvan en ese canal
const WHOLESALE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Hasta $30.000', min: null, max: 30_000 },
  { label: '$30.000 – $60.000', min: 30_000, max: 60_000 },
  { label: '$60.000 – $120.000', min: 60_000, max: 120_000 },
  { label: 'Más de $120.000', min: 120_000, max: null },
];

/** hidePromo: en /promociones todo ya es promoción, y para el mayorista no hay promociones: el control sobra. */
export function FilterPanel({
  filters,
  onChange,
  hidePromo = false,
  channel = 'retail',
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  hidePromo?: boolean;
  channel?: 'retail' | 'wholesale';
}) {
  const presets = channel === 'wholesale' ? WHOLESALE_PRESETS : PRICE_PRESETS;
  const check = (checked: boolean, label: string, set: (v: boolean) => void) => (
    <label className="flex items-center gap-3 min-h-11 cursor-pointer text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="w-4 h-4 accent-[#8B6F14]" />
      {label}
    </label>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs uppercase tracking-widest text-ink font-semibold mb-2">Precio</h3>
        <div className="flex flex-col">
          {presets.map((p) => {
            const active = filters.min === p.min && filters.max === p.max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange({ ...filters, min: active ? null : p.min, max: active ? null : p.max })}
                aria-pressed={active}
                className={`text-left min-h-11 px-3 text-sm border-l-2 transition-colors ${
                  active ? 'border-gold-dark text-gold-dark font-medium bg-gold/5' : 'border-transparent text-black/70 hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-widest text-ink font-semibold mb-1">Disponibilidad</h3>
        {check(filters.inStock, 'Solo en stock', (v) => onChange({ ...filters, inStock: v }))}
        {!hidePromo && check(filters.promoOnly, 'En promoción', (v) => onChange({ ...filters, promoOnly: v }))}
      </div>
    </div>
  );
}

export function FilterChips({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  if (!hasActiveFilters(filters)) return null;
  const chip = (label: string, clear: () => void) => (
    <button
      key={label}
      onClick={clear}
      className="inline-flex items-center gap-2 border border-black/20 px-3 min-h-9 text-xs text-ink hover:border-ink"
      aria-label={`Quitar filtro ${label}`}
    >
      {label} <span aria-hidden>×</span>
    </button>
  );
  const chips: React.ReactNode[] = [];
  if (filters.min !== null || filters.max !== null) {
    const label =
      filters.min !== null && filters.max !== null
        ? `${formatCOP(filters.min)} – ${formatCOP(filters.max)}`
        : filters.max !== null
          ? `Hasta ${formatCOP(filters.max)}`
          : `Desde ${formatCOP(filters.min)}`;
    chips.push(chip(label, () => onChange({ ...filters, min: null, max: null })));
  }
  if (filters.inStock) chips.push(chip('Solo en stock', () => onChange({ ...filters, inStock: false })));
  if (filters.promoOnly) chips.push(chip('En promoción', () => onChange({ ...filters, promoOnly: false })));
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {chips}
      <button onClick={() => onChange(EMPTY_FILTERS)} className="text-xs underline text-gold-dark min-h-9 px-2">
        Limpiar
      </button>
    </div>
  );
}
