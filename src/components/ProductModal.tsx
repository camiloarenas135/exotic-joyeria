import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext, unitPriceFor, type Product } from '../context/AppContext';
import { sanitizeString } from '../lib/sanitize';
import { formatCOP } from '../lib/pricing';
import { whatsappLink } from '../lib/config';

interface Props {
  product: Product;
  onClose: () => void;
}

export default function ProductModal({ product, onClose }: Props) {
  const { addToCart } = useAppContext();
  const [imageIdx, setImageIdx] = useState(0);
  const [variantIdx, setVariantIdx] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const images = product.images && product.images.length > 0 ? product.images : [product.image];
  const variants = product.variants ?? [];
  const variant = variants.length > 0 ? variants[variantIdx] : undefined;
  const unit = unitPriceFor(product, variant);
  const base = variant?.price_cop ?? product.priceCop;
  const soldOut = product.stock <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={product.name}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-3xl bg-ivory shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-ivory p-2 text-ink hover:bg-ink hover:text-ivory transition-colors border border-black/10"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>

        <div className="w-full md:w-2/5 bg-surface relative aspect-[4/5] md:aspect-auto shrink-0">
          {images[imageIdx] && (
            <img
              src={images[imageIdx]}
              alt={product.name}
              width={480}
              height={600}
              className="w-full h-full object-cover object-center"
              referrerPolicy="no-referrer"
            />
          )}
          {images.length > 1 && (
            <>
              <button
                onClick={() => setImageIdx((i) => (i - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-ivory/90 hover:bg-ivory text-ink p-2"
                aria-label="Imagen anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setImageIdx((i) => (i + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-ivory/90 hover:bg-ivory text-ink p-2"
                aria-label="Imagen siguiente"
              >
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setImageIdx(idx)}
                    aria-label={`Ver imagen ${idx + 1}`}
                    className={`h-1.5 transition-all ${idx === imageIdx ? 'w-6 bg-gold-dark' : 'w-2 bg-black/30'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-full md:w-3/5 p-6 md:p-8 flex flex-col overflow-y-auto">
          <span className="text-xs uppercase tracking-widest text-black/50 font-semibold mb-2">{product.category}</span>
          <h2 className="text-2xl font-serif text-ink mb-2">{product.name}</h2>
          <p className="mb-6">
            <span className="text-xl text-gold-dark font-semibold">{formatCOP(unit)}</span>
            {unit < base && <span className="ml-3 text-black/40 line-through text-sm">{formatCOP(base)}</span>}
          </p>

          {variants.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs uppercase tracking-widest text-ink font-semibold mb-3">Opciones</h3>
              <div className="flex flex-wrap gap-2">
                {variants.map((v, idx) => (
                  <button
                    key={`${v.name}-${idx}`}
                    onClick={() => setVariantIdx(idx)}
                    aria-pressed={variantIdx === idx}
                    className={`px-4 py-2 min-h-11 text-sm border transition-colors ${
                      variantIdx === idx ? 'border-gold-dark bg-gold/10 text-gold-dark font-medium' : 'border-black/20 text-black/70 hover:border-black/50'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="h-px w-full bg-black/10 mb-6"></div>

          <div className="grow">
            <h3 className="text-xs uppercase tracking-widest text-ink font-semibold mb-3">Descripción</h3>
            <p className="text-black/70 font-light text-sm leading-relaxed whitespace-pre-line">
              {sanitizeString(product.description ?? '') ||
                'Una pieza exclusiva de nuestra colección, diseñada con los más altos estándares de calidad y elegancia.'}
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-black/10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-black/60">Disponibilidad:</span>
              <span className={`text-xs font-medium ${soldOut ? 'text-red-700' : 'text-green-700'}`}>
                {soldOut ? 'Agotado' : `${product.stock} en stock`}
              </span>
            </div>
            {soldOut ? (
              <a
                href={whatsappLink(`Hola, me interesa "${product.name}" cuando vuelva a estar disponible.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 min-h-11 flex items-center justify-center border border-ink text-ink uppercase tracking-widest text-xs font-semibold hover:bg-ink hover:text-ivory transition-colors"
              >
                Avísame por WhatsApp
              </a>
            ) : (
              <button
                onClick={() => {
                  addToCart(product, variant);
                  onClose();
                }}
                className="w-full py-3 min-h-11 flex items-center justify-center gap-2 uppercase tracking-widest text-xs font-semibold bg-ink text-ivory hover:bg-gold-dark transition-colors"
              >
                <ShoppingBag size={16} />
                <span>Añadir al Carrito</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
