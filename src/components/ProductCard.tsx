import React, { useState } from 'react';
import { ShoppingBag, ImageOff } from 'lucide-react';
import { type Product } from '../context/AppContext';
import { formatCOP, discountLabel, applyDiscount } from '../lib/pricing';
import { whatsappLink } from '../lib/config';

interface Props {
  product: Product;
  index: number;
  onSelect: (p: Product) => void;
  onAddToCart: (p: Product) => void;
}

const ProductCard: React.FC<Props> = ({ product, index, onSelect, onAddToCart }) => {
  const [hover, setHover] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const images = product.images && product.images.length > 0 ? product.images : [product.image];
  const shown = hover && images[1] ? images[1] : images[0];
  const soldOut = product.stock <= 0;
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const cheapest = hasVariants ? cheapestVariant(product) : null;
  const shownBase = cheapest ? cheapest.base : product.priceCop;
  const shownFinal = cheapest ? cheapest.final : product.effectivePriceCop;
  const hasPromo = shownFinal < shownBase;
  const priority = index < 4;

  return (
    <article
      className="group flex flex-col h-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="relative block w-full aspect-[4/5] overflow-hidden bg-surface mb-3 text-left"
        aria-label={`Ver ${product.name}`}
      >
        {shown && !imgFailed ? (
          <img
            src={shown}
            alt={product.name}
            width={400}
            height={500}
            loading={priority ? 'eager' : 'lazy'}
            {...{ fetchPriority: priority ? 'high' : 'auto' }}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03] ${soldOut ? 'opacity-60' : ''}`}
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-black/30">
            <ImageOff size={28} strokeWidth={1.5} />
            <span className="text-[10px] mt-2 uppercase tracking-widest">Sin imagen</span>
          </span>
        )}
        {hasPromo && !soldOut && (
          <span className="absolute top-2 left-2 bg-ink text-gold text-[11px] font-semibold tracking-wider px-2 py-1">
            {discountLabel(shownBase, shownFinal)}
          </span>
        )}
        {soldOut && (
          <span className="absolute top-2 left-2 bg-ivory text-ink border border-ink text-[11px] font-semibold uppercase tracking-widest px-2 py-1">
            Agotado
          </span>
        )}
      </button>

      <div className="text-center px-1 flex flex-col grow">
        <h3 className="font-serif text-sm sm:text-base text-ink mb-1 line-clamp-2 min-h-[2.5rem] sm:min-h-[3rem]">{product.name}</h3>
        <p className="font-sans text-sm mb-3">
          {hasVariants && <span className="text-black/50 text-xs mr-1">Desde</span>}
          <span className="text-gold-dark font-semibold">{formatCOP(shownFinal)}</span>
          {hasPromo && !hasVariants && (
            <span className="ml-2 text-black/40 line-through text-xs">{formatCOP(product.priceCop)}</span>
          )}
        </p>
        {soldOut ? (
          <a
            href={whatsappLink(`Hola, me interesa "${product.name}" cuando vuelva a estar disponible.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto w-full border border-ink text-ink py-3 min-h-11 flex items-center justify-center text-xs uppercase tracking-widest font-semibold hover:bg-ink hover:text-ivory transition-colors"
          >
            Avísame por WhatsApp
          </a>
        ) : (
          <button
            type="button"
            onClick={() => (hasVariants ? onSelect(product) : onAddToCart(product))}
            className="mt-auto w-full bg-ink text-ivory py-3 min-h-11 flex items-center justify-center gap-2 transition-colors duration-200 hover:bg-gold-dark"
          >
            <ShoppingBag size={14} />
            <span className="text-xs uppercase tracking-widest font-semibold">{hasVariants ? 'Elegir opción' : 'Añadir'}</span>
          </button>
        )}
      </div>
    </article>
  );
};

export default ProductCard;

/** Variante con el precio final más bajo; usa el precio efectivo del servidor cuando viene. */
function cheapestVariant(product: Product): { base: number; final: number } {
  const list = (product.variants ?? [])
    .filter((v) => (v.price_cop ?? 0) > 0)
    .map((v) => {
      const base = v.price_cop as number;
      const final = typeof v.effective_price_cop === 'number' ? v.effective_price_cop : applyDiscount(base, product.promoKind, product.promoValue);
      return { base, final };
    });
  if (list.length === 0) return { base: product.priceCop, final: product.effectivePriceCop };
  return list.reduce((m, x) => (x.final < m.final ? x : m));
}
