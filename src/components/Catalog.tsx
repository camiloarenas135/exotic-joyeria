import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { toTitleCase } from '../lib/sanitize';
import { CATALOG_FILTERS } from '../lib/categories';



const MAX_ALLOWED_PRICE = 2000000;

interface Variant {
  name: string;
  price: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  image?: string;
  images?: string[];
  category: string;
  stock: number;
  description?: string;
  variants?: Variant[];
}

const ProductCard: React.FC<{ product: Product, index: number, onSelect: (p: Product) => void, onAddToCart: (p: Product) => void }> = ({ product, index, onSelect, onAddToCart }) => {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const images = product.images && product.images.length > 0 ? product.images : [product.image || ''];

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIdx((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: (index % 8) * 0.1 }}
      className="group relative flex flex-col cursor-pointer h-full"
      onClick={() => onSelect(product)}
    >
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-gray-50 mb-3 group-hover:border-gold/50 border border-transparent transition-colors duration-500">
        {/* Decorative Gold Corners on Hover */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-gold opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 m-3 translate-x-[-10px] translate-y-[-10px] group-hover:translate-x-0 group-hover:translate-y-0 pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-gold opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 m-3 translate-x-[10px] translate-y-[-10px] group-hover:translate-x-0 group-hover:translate-y-0 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-gold opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 m-3 translate-x-[-10px] translate-y-[10px] group-hover:translate-x-0 group-hover:translate-y-0 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-gold opacity-0 group-hover:opacity-100 transition-all duration-500 z-20 m-3 translate-x-[10px] translate-y-[10px] group-hover:translate-x-0 group-hover:translate-y-0 pointer-events-none"></div>

        <img
          src={images[currentImageIdx]}
          alt={product.name}
          loading={index < 4 ? 'eager' : 'lazy'}
          decoding="async"
          className="object-cover object-center w-full h-full transition-transform duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement!.classList.add('flex', 'items-center', 'justify-center');
            e.currentTarget.parentElement!.innerHTML = '<div class="text-black/30 flex flex-col items-center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span class="text-xs mt-2 uppercase tracking-widest">Imagen no disponible</span></div>';
          }}
        />

        {/* Carousel Controls */}
        {images.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30">
            <button 
              onClick={prevImage}
              className="bg-white/80 hover:bg-white text-black p-1 rounded-full shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={nextImage}
              className="bg-white/80 hover:bg-white text-black p-1 rounded-full shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        
        {/* Carousel Indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {images.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1 rounded-full transition-all ${idx === currentImageIdx ? 'w-3 bg-gold' : 'w-1.5 bg-white/70'}`}
              />
            ))}
          </div>
        )}
        

      </div>

      {/* Product Info */}
      <div className="text-center px-2 flex flex-col flex-grow">
        <h3 className="font-serif text-sm sm:text-base text-black mb-1 line-clamp-1">{product.name}</h3>
        <p className="font-sans text-sm text-gold font-medium mb-3">{product.price}</p>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          className="mt-auto w-full bg-black text-white py-2 flex items-center justify-center gap-2 transition-all duration-300 hover:bg-gold"
        >
          <ShoppingBag size={14} />
          <span className="text-xs uppercase tracking-widest font-semibold">Añadir</span>
        </button>
      </div>
    </motion.div>
  );
}

export default function Catalog() {
  const { activeFilter, setActiveFilter } = useAppContext();
  const [maxPrice, setMaxPrice] = useState(MAX_ALLOWED_PRICE);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(8);
  const [hasMore, setHasMore] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalImageIdx, setModalImageIdx] = useState(0);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(0);
  const { addToCart, searchQuery } = useAppContext();

  useEffect(() => {
    setModalImageIdx(0);
    setSelectedVariantIdx(0);
  }, [selectedProduct]);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        setProducts(data.map((p: any) => ({
          id: p.id,
          name: toTitleCase(p.name),
          price: p.price,
          image: p.images?.[0] || '',
          images: p.images || [],
          category: toTitleCase(p.category),
          stock: p.stock ?? 1,
          description: p.description || '',
          variants: p.variants || [],
        })));
      } catch (error: any) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  const filteredProducts = React.useMemo(() => {
    let result = products.filter((product) => {
      if (product.stock <= 0) return false;

      const matchesCategory = activeFilter === 'Ver Todo' || product.category.toLowerCase() === activeFilter.toLowerCase();
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            product.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Parse price for COP format
      const cleanPrice = product.price.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.-]+/g, "");
      const priceNum = parseFloat(cleanPrice) || 0;
      const matchesPrice = priceNum <= maxPrice;

      return matchesCategory && matchesSearch && matchesPrice;
    });

    // If viewing all products without a specific search, interleave by category
    // so we see a variety of products instead of just the most recently added ones in order
    if (activeFilter === 'Ver Todo' && !searchQuery) {
      const grouped: Record<string, Product[]> = {};
      result.forEach(p => {
        const catKey = toTitleCase(p.category);
        if (!grouped[catKey]) grouped[catKey] = [];
        grouped[catKey].push(p);
      });

      const interleaved: Product[] = [];
      const categories = Object.keys(grouped);
      let hasMore = true;
      let index = 0;

      while (hasMore) {
        hasMore = false;
        for (const cat of categories) {
          if (grouped[cat] && index < grouped[cat].length) {
            interleaved.push(grouped[cat][index]);
            hasMore = true;
          }
        }
        index++;
      }
      result = interleaved;
    }

    return result;
  }, [products, activeFilter, searchQuery, maxPrice]);

  const paginatedProducts = filteredProducts.slice(0, visibleCount);

  return (
    <section id="catálogo" className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-white">
      {/* Section Title with Gold Accents */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="h-[1px] w-12 bg-gold/50"></div>
          <h2 className="font-serif text-3xl md:text-4xl text-black tracking-wide">Colección Exclusiva</h2>
          <div className="h-[1px] w-12 bg-gold/50"></div>
        </div>
        <p className="text-black/60 font-light text-sm tracking-widest uppercase">Descubre nuestras piezas más codiciadas</p>
      </div>

      {/* Filters Toggle Mobile */}
      <div className="md:hidden flex justify-center mb-6">
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 border border-black/20 px-6 py-2 text-sm uppercase tracking-wider text-black/80 hover:bg-gray-50 transition-colors"
        >
          <Filter size={16} />
          <span>Filtros</span>
        </button>
      </div>

      {/* Filters Container */}
      <div className={`flex flex-col md:flex-row items-center justify-between gap-4 mb-10 ${showFilters ? 'flex' : 'hidden md:flex'}`}>
        {/* Category Filters */}
        <div className="flex flex-wrap justify-center md:justify-start gap-3">
          {CATALOG_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-5 py-2 text-xs uppercase tracking-wider transition-all duration-300 border ${
                activeFilter === filter
                  ? 'border-gold text-gold font-medium bg-gold/5'
                  : 'border-black/10 text-black/60 hover:border-black/30 hover:text-black'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Price Range Filter */}
        <div className="flex flex-col gap-2 w-full md:w-64">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] uppercase tracking-widest text-black/50 font-semibold text-left">Presupuesto</span>
            <span className="text-[10px] sm:text-xs font-serif text-gold font-bold">
              Hasta ${maxPrice.toLocaleString('es-CO')}
            </span>
          </div>
          <div className="relative flex items-center h-6">
            <input
              type="range"
              min="0"
              max={MAX_ALLOWED_PRICE}
              step="50000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full h-1 bg-black/10 rounded-full appearance-none cursor-pointer accent-gold hover:accent-black transition-all"
              style={{
                background: `linear-gradient(to right, #D4AF37 0%, #D4AF37 ${(maxPrice / MAX_ALLOWED_PRICE) * 100}%, #e5e7eb ${(maxPrice / MAX_ALLOWED_PRICE) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>
          <div className="flex justify-between px-1">
            <span className="text-[9px] text-black/30 uppercase">$0</span>
            <span className="text-[9px] text-black/30 uppercase">$2M+</span>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      {loading && products.length === 0 ? (
        <div className="text-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold mx-auto mb-4"></div>
          <p className="text-gray-500 font-sans text-sm tracking-widest uppercase">Cargando colección...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 font-sans text-lg">No se encontraron productos que coincidan con tu búsqueda.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 pb-8 pt-4">
            {paginatedProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                onSelect={setSelectedProduct}
                onAddToCart={addToCart}
              />
            ))}
          </div>

      {/* Load More Button */}
      {visibleCount < filteredProducts.length && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => setVisibleCount(prev => prev + 8)}
            className="bg-white border border-black text-black px-8 py-3 text-sm uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
          >
            Cargar más productos
          </button>
        </div>
      )}
      </>
      )}

      {/* Product Details Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
            >
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 z-10 bg-white/80 backdrop-blur-md p-2 rounded-full text-black hover:bg-black hover:text-white transition-colors border border-black/10"
              >
                <X size={20} />
              </button>

              {/* Image Section */}
              <div className="w-full md:w-2/5 bg-gray-50 relative aspect-square md:aspect-auto group">
                {(() => {
                  const modalImages = selectedProduct.images && selectedProduct.images.length > 0 
                    ? selectedProduct.images 
                    : [selectedProduct.image || ''];
                  
                  return (
                    <>
                      <img 
                        src={modalImages[modalImageIdx]} 
                        alt={selectedProduct.name}
                        className="w-full h-full object-cover object-center"
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Carousel Controls */}
                      {modalImages.length > 1 && (
                        <div className="absolute inset-0 flex items-center justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalImageIdx((prev) => (prev - 1 + modalImages.length) % modalImages.length);
                            }}
                            className="bg-white/80 hover:bg-white text-black p-2 rounded-full shadow-md"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalImageIdx((prev) => (prev + 1) % modalImages.length);
                            }}
                            className="bg-white/80 hover:bg-white text-black p-2 rounded-full shadow-md"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      )}
                      
                      {/* Carousel Indicators */}
                      {modalImages.length > 1 && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-30">
                          {modalImages.map((_, idx) => (
                            <button 
                              key={idx} 
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalImageIdx(idx);
                              }}
                              className={`h-1.5 rounded-full transition-all ${idx === modalImageIdx ? 'w-6 bg-gold' : 'w-2 bg-black/20 hover:bg-black/40'}`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Details Section */}
              <div className="w-full md:w-3/5 p-6 md:p-8 flex flex-col overflow-y-auto">
                <div className="mb-2">
                  <span className="text-xs uppercase tracking-widest text-black/50 font-semibold">
                    {selectedProduct.category}
                  </span>
                </div>
                
                <h2 className="text-2xl font-serif text-black mb-2">
                  {selectedProduct.name}
                </h2>
                
                <p className="text-xl text-gold font-medium mb-6">
                  {selectedProduct.variants && selectedProduct.variants.length > 0 
                    ? selectedProduct.variants[selectedVariantIdx].price 
                    : selectedProduct.price}
                </p>

                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs uppercase tracking-widest text-black font-semibold mb-3">Opciones</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.variants.map((variant, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedVariantIdx(idx)}
                          className={`px-4 py-2 text-sm border transition-colors ${
                            selectedVariantIdx === idx 
                              ? 'border-gold bg-gold/10 text-gold font-medium' 
                              : 'border-black/20 text-black/70 hover:border-black/50'
                          }`}
                        >
                          {variant.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="h-[1px] w-full bg-black/10 mb-6"></div>

                <div className="flex-grow">
                  <h3 className="text-xs uppercase tracking-widest text-black font-semibold mb-3">Descripción</h3>
                  <p className="text-black/70 font-light text-sm leading-relaxed whitespace-pre-line">
                    {selectedProduct.description || "Una pieza exclusiva de nuestra colección, diseñada con los más altos estándares de calidad y elegancia."}
                  </p>
                </div>

                <div className="mt-6 pt-6 border-t border-black/10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-black/60">Disponibilidad:</span>
                    <span className={`text-xs font-medium ${selectedProduct.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedProduct.stock > 0 ? `${selectedProduct.stock} en stock` : 'Agotado'}
                    </span>
                  </div>

                  <button 
                    onClick={() => {
                      const variant = selectedProduct.variants && selectedProduct.variants.length > 0 
                        ? selectedProduct.variants[selectedVariantIdx] 
                        : undefined;
                      addToCart(selectedProduct, variant);
                      setSelectedProduct(null);
                    }}
                    disabled={selectedProduct.stock <= 0}
                    className={`w-full py-3 flex items-center justify-center gap-2 uppercase tracking-widest text-xs font-semibold transition-colors ${
                      selectedProduct.stock > 0 
                        ? 'bg-black text-white hover:bg-gold' 
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <ShoppingBag size={16} />
                    <span>{selectedProduct.stock > 0 ? 'Añadir al Carrito' : 'Agotado'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
