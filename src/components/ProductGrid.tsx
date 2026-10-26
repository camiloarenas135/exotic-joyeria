import { useEffect } from 'react';
import { useAppContext, type Product } from '../context/AppContext';
import ProductCard from './ProductCard';
import { rememberProducts, useOpenProduct } from './ProductDeepLink';

interface Props {
  products: Product[];
  loading: boolean;
  emptyMessage?: string;
}

export default function ProductGrid({ products, loading, emptyMessage }: Props) {
  const { addToCart } = useAppContext();
  const openProduct = useOpenProduct();

  useEffect(() => rememberProducts(products), [products]);

  if (loading && products.length === 0) {
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
