import { Link } from 'react-router-dom';
import { useCategories } from '../context/CategoriesContext';

interface Props {
  /** Slug de la colección actual: se resalta con un anillo dorado. */
  activeSlug?: string;
  /** Fila más pequeña para usar sobre el listado. */
  compact?: boolean;
  label?: string;
}

const SKELETON = [0, 1, 2, 3, 4, 5];

/**
 * Fila de círculos con la foto de cada colección y su nombre debajo.
 * Móvil: carrusel horizontal con scroll-snap (el overflow vive solo en la lista).
 * Escritorio: centrado y con wrap, sin scroll.
 * Colecciones sin foto: círculo con monograma, para que sigan siendo navegables.
 */
export default function CollectionCircles({ activeSlug, compact = false, label = 'Colecciones' }: Props) {
  const { categories, loading, covers, coversLoading } = useCategories();
  const size = compact ? 'size-[72px] lg:size-24' : 'size-[88px] lg:size-[120px]';
  const itemW = compact ? 'w-[88px] lg:w-28' : 'w-24 lg:w-32';

  if (!loading && categories.length === 0) return null;

  return (
    <nav aria-label={label}>
      <ul className="flex gap-3 lg:gap-6 overflow-x-auto lg:overflow-visible lg:flex-wrap lg:justify-center snap-x snap-mandatory lg:snap-none hide-scrollbar p-2 -m-2">
        {loading && categories.length === 0
          ? SKELETON.map((i) => (
              <li key={i} className={`${itemW} shrink-0 flex flex-col items-center gap-2`} aria-hidden>
                <div className={`${size} rounded-full bg-surface animate-pulse motion-reduce:animate-none`} />
                <div className="h-3 w-14 rounded bg-surface" />
              </li>
            ))
          : categories.map((c) => {
              const img = covers[c.id] ?? c.image;
              const active = c.slug === activeSlug;
              return (
                <li key={c.id} className={`${itemW} shrink-0 snap-start`}>
                  <Link
                    to={`/coleccion/${c.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className="group flex flex-col items-center gap-2 min-h-11 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-dark"
                  >
                    <span
                      className={`${size} shrink-0 rounded-full overflow-hidden bg-surface border flex items-center justify-center transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100 ${
                        active ? 'border-gold ring-2 ring-gold ring-offset-2 ring-offset-ivory' : 'border-gold/60'
                      }`}
                    >
                      {img ? (
                        <img src={img} alt="" width={120} height={120} loading="lazy" decoding="async" className="size-full object-cover" />
                      ) : coversLoading ? (
                        <span className="size-full animate-pulse motion-reduce:animate-none bg-surface" />
                      ) : (
                        <span aria-hidden data-testid="cover-placeholder" className="font-serif text-3xl lg:text-4xl text-gold-dark">
                          {c.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="text-xs sm:text-sm text-center text-ink leading-tight break-words line-clamp-2 max-w-full">{c.name}</span>
                  </Link>
                </li>
              );
            })}
      </ul>
    </nav>
  );
}
