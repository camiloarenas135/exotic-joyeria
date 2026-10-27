import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCategories } from '../context/CategoriesContext';
import { useChannel } from '../context/ChannelContext';
import { fetchCatalog, PAGE_SIZE, type SortKey } from '../lib/catalog';
import type { Product } from '../context/AppContext';
import CollectionCircles from '../components/CollectionCircles';
import ProductGrid from '../components/ProductGrid';
import Pagination from '../components/Pagination';
import NotFound from './NotFound';
import { SortSelect, FilterPanel, FilterChips, EMPTY_FILTERS, hasActiveFilters, type Filters } from '../components/CatalogControls';

const SORTS: SortKey[] = ['price_asc', 'price_desc', 'newest', 'name'];

function numParam(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface Props {
  /** 'search' usa ?q=, 'all' lista todo el catálogo, 'category' usa :slug, 'promos' solo ofertas vigentes */
  mode: 'category' | 'search' | 'all' | 'promos';
}

export default function CatalogPage({ mode }: Props) {
  const { slug } = useParams();
  const { categories, loading: catsLoading } = useCategories();
  const { channel, resolving, refreshWholesaler } = useChannel();
  const wholesale = channel === 'wholesale';
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const category = mode === 'category' ? categories.find((c) => c.slug === slug) : undefined;
  const q = mode === 'search' ? (params.get('q') ?? '').slice(0, 100) : '';

  const sortParam = params.get('orden') as SortKey | null;
  const sort: SortKey = sortParam && SORTS.includes(sortParam) ? sortParam : 'price_asc';
  const page = Math.max(numParam(params.get('page')) ?? 1, 1);
  // Primitivos: abrir/cerrar el modal (?producto=) cambia params pero no debe volver a pedir el catálogo
  const min = numParam(params.get('min'));
  const max = numParam(params.get('max'));
  const inStock = params.get('stock') === '1';
  // En /promociones siempre son solo ofertas; ?promo=0 se ignora
  // El mayorista no ve promociones: ni la sección ni el filtro
  const promoOnly = !wholesale && (mode === 'promos' || params.get('promo') === '1');
  const filters: Filters = useMemo(() => ({ min, max, inStock, promoOnly }), [min, max, inStock, promoOnly]);
  // Lo que ve el usuario: en /promociones "solo promociones" va implícito, no es un filtro que quitar
  const uiFilters: Filters = useMemo(() => ({ ...filters, promoOnly: filters.promoOnly && mode !== 'promos' }), [filters, mode]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.delete('producto'); // cambiar filtro, orden o página cierra el modal
    Object.entries(changes).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };
  const setFilters = (f: Filters) =>
    update({
      min: f.min !== null ? String(f.min) : null,
      max: f.max !== null ? String(f.max) : null,
      stock: f.inStock ? '1' : null,
      promo: mode !== 'promos' && f.promoOnly ? '1' : null,
      page: null,
    });

  const waitingForCategory = (mode === 'category' && catsLoading && !category) || resolving || (mode === 'promos' && wholesale);
  const unknownCategory = mode === 'category' && !catsLoading && !category;

  useEffect(() => {
    if (waitingForCategory || unknownCategory) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchCatalog({
      categoryId: category?.id ?? null,
      search: q,
      sort,
      inStock: filters.inStock,
      promoOnly: filters.promoOnly,
      min: filters.min,
      max: filters.max,
      page,
    }, channel)
      .then((res) => {
        if (cancelled) return;
        setProducts(res.products);
        setTotal(res.total);
        // Catálogo mayorista vacío sin filtros: puede ser que la cuenta ya no esté aprobada
        if (wholesale && res.total === 0 && !q && !filters.inStock && filters.min === null && filters.max === null) void refreshWholesaler();
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        if (wholesale) void refreshWholesaler();
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [category?.id, q, sort, page, filters, waitingForCategory, unknownCategory, channel, wholesale, refreshWholesaler]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page, slug]);

  useEffect(() => {
    const name = mode === 'category' ? category?.name : mode === 'search' ? `Búsqueda: ${q}` : mode === 'promos' ? 'Promociones' : 'Catálogo';
    if (name) document.title = `${name} | Exotic Joyería`;
  }, [mode, category?.name, q]);

  // Meta descripción solo en /promociones; se retira al salir para no contaminar otras páginas
  useEffect(() => {
    if (mode !== 'promos') return;
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'Promociones vigentes de Exotic Joyería: joyas en oro laminado 18k con descuento, precio detal.';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [mode]);

  if (unknownCategory) return <NotFound />;
  if (mode === 'promos' && wholesale) return <Navigate to="/catalogo" replace />;

  const title = mode === 'category' ? (category?.name ?? '') : mode === 'search' ? `Resultados para “${q}”` : mode === 'promos' ? 'Promociones' : 'Todo el catálogo';
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <nav aria-label="Migas de pan" className="text-xs text-black/60 mb-4 flex items-center gap-2">
        <Link to="/" className="hover:text-ink">Inicio</Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{mode === 'category' ? category?.name : mode === 'search' ? 'Búsqueda' : mode === 'promos' ? 'Promociones' : 'Catálogo'}</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl text-ink">{title}</h1>
        {!loading && !error && (
          <p className="text-sm text-black/60 mt-2">{total} {total === 1 ? 'pieza' : 'piezas'}</p>
        )}
        <div className="h-px w-16 bg-gold mt-4" />
      </header>

      {(mode === 'all' || mode === 'category') && (
        <div className="mb-8">
          <CollectionCircles activeSlug={mode === 'category' ? slug : undefined} compact={mode === 'category'} />
        </div>
      )}

      <div className="flex items-center justify-between gap-4 mb-4">
        <button
          onClick={() => setFiltersOpen(true)}
          className="lg:hidden inline-flex items-center gap-2 border border-black/20 px-4 min-h-11 text-xs uppercase tracking-widest"
        >
          <SlidersHorizontal size={16} /> Filtros{hasActiveFilters(uiFilters) ? ' •' : ''}
        </button>
        <div className="ml-auto">
          <SortSelect value={sort} onChange={(v) => update({ orden: v === 'price_asc' ? null : v, page: null })} />
        </div>
      </div>

      <FilterChips filters={uiFilters} onChange={setFilters} />

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <FilterPanel filters={uiFilters} onChange={setFilters} hidePromo={mode === 'promos' || wholesale} channel={channel} />
        </aside>

        <div>
          {error ? (
            <div role="alert" className="text-center py-20 text-black/70">
              No pudimos cargar los productos. Revisa tu conexión e intenta de nuevo.
            </div>
          ) : (
            <ProductGrid
              products={products}
              loading={loading}
              emptyMessage={
                mode === 'search'
                  ? `No encontramos resultados para “${q}”. Prueba con otra palabra.`
                  : hasActiveFilters(uiFilters)
                    ? 'Ningún producto cumple esos filtros.'
                    : mode === 'promos'
                      ? 'Aún no hay promociones activas'
                      : wholesale
                        ? 'Aún no hay productos mayoristas publicados en esta sección.'
                        : 'Pronto tendremos nuevas piezas en esta colección.'
              }
            />
          )}
          {!error && (
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={(p) => update({ page: p === 1 ? null : String(p) })} />
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-60 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-ivory p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Filtros</h2>
              <button onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros" className="p-2 -m-2"><X size={22} /></button>
            </div>
            <FilterPanel filters={uiFilters} onChange={setFilters} hidePromo={mode === 'promos' || wholesale} channel={channel} />
            <button
              onClick={() => setFiltersOpen(false)}
              className="mt-6 w-full bg-ink text-ivory min-h-11 text-xs uppercase tracking-widest"
            >
              Ver {total} {total === 1 ? 'pieza' : 'piezas'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
