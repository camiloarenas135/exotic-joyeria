import type React from 'react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';
import { useCategories } from '../context/CategoriesContext';
import { useChannel } from '../context/ChannelContext';
import ScrollRow from './ScrollRow';

interface Props {
  /** Slug de la colección actual: se resalta con un anillo dorado. */
  activeSlug?: string;
  /** Fila más pequeña para usar sobre el listado. */
  compact?: boolean;
  label?: string;
}

const SKELETON = [0, 1, 2, 3, 4, 5];

interface ItemProps {
  to: string;
  name: string;
  image?: string | null;
  imageLoading?: boolean;
  active?: boolean;
  size: string;
  itemW: string;
  /** Qué mostrar si no hay foto o falla: el monograma de la colección o un icono. */
  fallback: ReactNode;
  testId?: string;
  ariaLabel?: string;
  /** Insignia sobre el círculo (p. ej. "-30%"). */
  badge?: string;
  highlight?: boolean;
}

/** Un círculo con foto y nombre. Si la foto falla (404, bloqueada) cae al fallback sin romper la fila. */
const CircleItem: React.FC<ItemProps> = ({ to, name, image, imageLoading, active, size, itemW, fallback, testId, ariaLabel, badge, highlight }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const showImg = !!image && failed !== image;
  const border = active
    ? 'border-gold ring-2 ring-gold ring-offset-2 ring-offset-ivory'
    : highlight
      ? 'border-gold ring-2 ring-gold/70 ring-offset-2 ring-offset-ivory'
      : 'border-gold/60';
  return (
    <li className={`${itemW} shrink-0 snap-start`}>
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        aria-label={ariaLabel}
        data-testid={testId}
        draggable={false}
        className="group flex flex-col items-center gap-2 min-h-11 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-dark"
      >
        <span className="relative">
          <span
            className={`${size} shrink-0 rounded-full overflow-hidden bg-surface border flex items-center justify-center transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100 ${border}`}
          >
            {showImg ? (
              <img
                src={image!}
                alt=""
                width={120}
                height={120}
                loading="lazy"
                decoding="async"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => setFailed(image!)}
                className="size-full object-cover"
              />
            ) : imageLoading && !image ? (
              <span className="size-full animate-pulse motion-reduce:animate-none bg-surface" />
            ) : (
              fallback
            )}
          </span>
          {badge && (
            <span
              aria-hidden
              data-testid="promo-badge"
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-gold text-[11px] font-semibold tracking-wider px-2 py-0.5 rounded-full"
            >
              {badge}
            </span>
          )}
        </span>
        <span className="text-xs sm:text-sm text-center text-ink leading-tight break-words line-clamp-2 max-w-full">{name}</span>
      </Link>
    </li>
  );
};

/**
 * Fila de círculos con la foto de cada colección y su nombre debajo, SIEMPRE en una sola línea deslizable
 * (swipe en móvil; en escritorio flechas, degradados, scroll horizontal y arrastre).
 * Si hay promociones vigentes, "Promociones" es el primer círculo y lleva a /promociones.
 * Colecciones sin foto (o con la foto rota): círculo con monograma, para que sigan siendo navegables.
 */
export default function CollectionCircles({ activeSlug, compact = false, label = 'Colecciones' }: Props) {
  const { visibleCategories: categories, loading, covers, coversLoading, promoCover, promoLoading } = useCategories();
  const { channel } = useChannel();
  // Mayorista: las colecciones salen de las portadas del canal (solo las publicadas); mientras llegan se muestra el esqueleto
  const waitingWholesale = channel === 'wholesale' && coversLoading && categories.length === 0;
  const size = compact ? 'size-[72px] lg:size-24' : 'size-[88px] lg:size-[120px]';
  const itemW = compact ? 'w-[88px] lg:w-28' : 'w-24 lg:w-32';

  if (!loading && !promoLoading && !waitingWholesale && categories.length === 0 && !promoCover) return null;

  const skeleton = (loading || promoLoading || waitingWholesale) && categories.length === 0;

  return (
    <nav aria-label={label}>
      <ScrollRow label={label} arrowTop={compact ? 56 : 68} listClassName="gap-3 lg:gap-6 p-2 pb-4 mx-auto w-max max-w-full">
        {skeleton
          ? SKELETON.map((i) => (
              <li key={i} className={`${itemW} shrink-0 flex flex-col items-center gap-2`} aria-hidden>
                <div className={`${size} rounded-full bg-surface animate-pulse motion-reduce:animate-none`} />
                <div className="h-3 w-14 rounded bg-surface" />
              </li>
            ))
          : (
            <>
              {promoCover && (
                <CircleItem
                  key="promo"
                  to="/promociones"
                  name="Promociones"
                  ariaLabel={promoCover.maxDiscountPct > 0 ? `Promociones, hasta ${promoCover.maxDiscountPct}% de descuento` : 'Promociones'}
                  testId="promo-bubble"
                  image={promoCover.image}
                  size={size}
                  itemW={itemW}
                  highlight
                  badge={promoCover.maxDiscountPct > 0 ? `hasta -${promoCover.maxDiscountPct}%` : undefined}
                  fallback={<Tag aria-hidden data-testid="promo-fallback" className="text-gold-dark size-1/3" strokeWidth={1.25} />}
                />
              )}
              {categories.map((c) => (
                <CircleItem
                  key={c.id}
                  to={`/coleccion/${c.slug}`}
                  name={c.name}
                  image={covers[c.id] ?? c.image}
                  imageLoading={coversLoading}
                  active={c.slug === activeSlug}
                  size={size}
                  itemW={itemW}
                  fallback={
                    <span aria-hidden data-testid="cover-placeholder" className="font-serif text-3xl lg:text-4xl text-gold-dark">
                      {c.name.trim().charAt(0).toUpperCase()}
                    </span>
                  }
                />
              ))}
            </>
          )}
      </ScrollRow>
    </nav>
  );
}
