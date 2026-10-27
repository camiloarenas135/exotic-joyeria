import { useEffect } from 'react';
import { useAppContext, type Product } from '../context/AppContext';
import ProductCard from './ProductCard';
import ScrollRow from './ScrollRow';
import { rememberProducts, useOpenProduct } from './ProductDeepLink';

interface Props {
  products: Product[];
  loading: boolean;
  emptyMessage?: string;
  /** 'grid' (por defecto): cuadrícula apilada. 'row': una sola fila deslizable (secciones de Home). */
  layout?: 'grid' | 'row';
  /** Nombre de la fila deslizable (etiqueta de las flechas); único en la página. */
  rowLabel?: string;
  /** Color de fondo de la sección donde vive la fila (para el degradado de borde). */
  fade?: 'ivory' | 'surface';
}

/** Ancho de cada tarjeta en modo fila: en móvil se asoma la siguiente para que se note que desliza. */
const ROW_ITEM = 'shrink-0 snap-start w-[46%] sm:w-[31%] lg:w-[23.5%]';

export default function ProductGrid({ products, loading, emptyMessage, layout = 'grid', rowLabel = 'Productos', fade = 'ivory' }: Props) {
  const { addToCart } = useAppContext();
  const openProduct = useOpenProduct();
  const row = layout === 'row';

  useEffect(() => rememberProducts(products), [products]);

  if (loading && products.length === 0) {
    if (row) {
      return (
        <div className="flex gap-4 overflow-hidden pb-8" aria-busy="true">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className={`${ROW_ITEM} flex flex-col animate-pulse motion-reduce:animate-none`}>
              <div className="aspect-[4/5] bg-surface mb-3" />
              <div className="h-4 bg-surface w-3/4 mx-auto mb-2" />
              <div className="h-3 bg-surface w-1/2 mx-auto mb-3" />
              <div className="h-11 bg-surface w-full" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 pb-8" aria-busy="true">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="flex flex-col animate-pulse">
            <div className="aspect-[4/5] bg-surface mb-3" />
            <div className="h-4 bg-surface w-3/4 mx-auto mb-2" />
            <div className="h-3 bg-surface w-1/2 mx-auto mb-3" />
            <div className="h-11 bg-surface w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-black/60 font-sans text-lg">{emptyMessage ?? 'No encontramos productos con esos criterios.'}</p>
      </div>
    );
  }

  if (row) {
    return (
      <div className={`pb-8 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {/* Fuera del pliegue (Home): ninguna se carga con prioridad alta para no competir con el carrusel */}
        <ScrollRow label={rowLabel} fade={fade} arrowTop={160} listClassName="gap-4 sm:gap-6 py-1">
          {products.map((product) => (
            <li key={product.id} className={ROW_ITEM}>
              <ProductCard product={product} index={99} onSelect={(p) => openProduct(p.id)} onAddToCart={addToCart} />
            </li>
          ))}
        </ScrollRow>
      </div>
    );
  }

  return (
    <>
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 pb-8 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} onSelect={(p) => openProduct(p.id)} onAddToCart={addToCart} />
        ))}
      </div>
    </>
  );
}
