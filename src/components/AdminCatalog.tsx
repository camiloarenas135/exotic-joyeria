import React, { useState, useEffect, useRef, useCallback } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, X, Save, Upload, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { sanitizeString, sanitizeNumber, sanitizeSearchQuery, toTitleCase } from '../lib/sanitize';
import { PRODUCT_CATEGORIES } from '../lib/categories';

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
  createdAt: string | null;
}

const PAGE_SIZE = 24;

interface AdminCatalogProps {
  editProductId?: string | null;
  onClearEditProduct?: () => void;
}

export default function AdminCatalog({ editProductId, onClearEditProduct }: AdminCatalogProps = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Search debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [formData, setFormData] = useState<{
    name: string;
    price: string;
    image: string;
    images: string[];
    category: string;
    stock: string | number;
    description: string;
    variants: Variant[];
  }>({
    name: '',
    price: '',
    image: '',
    images: [],
    category: PRODUCT_CATEGORIES[0],
    stock: 1,
    description: '',
    variants: []
  });



  useEffect(() => {
    loadProducts();
  }, [currentPage]);

  // Reset to page 0 when search changes
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(0);
      loadProducts(false, 0);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (editProductId && products.length > 0) {
      const prod = products.find(p => p.id === editProductId);
      if (prod) {
        handleOpenModal(prod);
      }
      if (onClearEditProduct) {
        onClearEditProduct();
      }
    }
  }, [editProductId, products]);

  const loadProducts = useCallback(async (silent = false, pageOverride?: number) => {
    if (!silent) setLoading(true);
    const page = pageOverride !== undefined ? pageOverride : currentPage;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Server-side search filtering
      if (searchQuery.trim()) {
        const q = sanitizeSearchQuery(searchQuery);
        if (q) {
          query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`);
        }
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setTotalCount(count || 0);
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
        createdAt: p.created_at
      })));
    } catch (error: any) {
      console.error('Error loading products:', error);
      setAlertMessage('Error al cargar los productos.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentPage, searchQuery]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: toTitleCase(product.name),
        price: product.price,
        image: product.image || '',
        images: product.images || (product.image ? [product.image] : []),
        category: toTitleCase(product.category),
        stock: product.stock,
        description: product.description || '',
        variants: product.variants || []
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        price: '',
        image: '',
        images: [],
        category: PRODUCT_CATEGORIES[0],
        stock: 1,
        description: '',
        variants: []
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setUploadingImage(false);
    setUploadProgress(0);
  };

  const processImageFile = async (file: File) => {
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    if (!file.type.startsWith('image/') || !fileExt || !allowedExtensions.includes(fileExt)) {
      setAlertMessage('Por favor, selecciona un archivo de imagen válido (.jpg, .jpeg, .png, .webp, .gif).');
      return;
    }

    setUploadingImage(true);
    setUploadProgress(10);

    try {
      const options = {
        maxSizeMB: 1.5, // Límite de tamaño óptimo para conservar detalles finos
        maxWidthOrHeight: 1600, // Resolución más alta (1600px) para nitidez en joyería
        initialQuality: 0.95, // Mantener calidad al 95% para evitar borrosidad
        useWebWorker: true,
        onProgress: (progress: number) => {
          setUploadProgress(10 + (progress * 0.8));
        }
      };
      
      const compressedFile = await imageCompression(file, options);
      
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, compressedFile);

      if (uploadError) {
        // Detect storage quota / size errors
        const msg = uploadError.message?.toLowerCase() || '';
        const status = (uploadError as any).statusCode || 0;
        if (msg.includes('quota') || msg.includes('storage limit') || msg.includes('payload too large') || status === 413 || msg.includes('exceeded') || msg.includes('space')) {
          throw new Error('El almacenamiento de Supabase está lleno. Elimina imágenes de productos que ya no uses o contacta al administrador para ampliar el plan de almacenamiento.');
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setFormData(prev => ({ 
        ...prev, 
        images: [...prev.images, publicUrl],
        image: prev.images.length === 0 ? publicUrl : prev.image
      }));
      setUploadProgress(100);
      
      setTimeout(() => {
        setUploadingImage(false);
        setUploadProgress(0);
      }, 500);

    } catch (error: any) {
      console.error('Error uploading image:', error);
      setUploadingImage(false);
      setUploadProgress(0);
      // Show user-friendly message
      const errMsg = error.message || 'Error desconocido';
      if (errMsg.includes('almacenamiento') || errMsg.includes('storage')) {
        setAlertMessage(errMsg);
      } else {
        setAlertMessage('Error al subir la imagen. Verifica tu conexión e intenta de nuevo. Si el problema persiste, el almacenamiento puede estar lleno.');
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploadingImage) return;
    const file = e.dataTransfer.files?.[0];
    if (file) await processImageFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingImage) {
      setAlertMessage('Por favor, espera a que la imagen termine de subir.');
      return;
    }

    const sanitizedVariants = formData.variants.map(v => ({
      name: sanitizeString(v.name),
      price: sanitizeString(v.price)
    }));

    const productData = {
      name: toTitleCase(formData.name) || 'Sin Nombre',
      price: sanitizeString(formData.price) || 'Por definir',
      images: formData.images.map(img => sanitizeString(img)),
      category: toTitleCase(formData.category),
      stock: sanitizeNumber(formData.stock),
      description: sanitizeString(formData.description),
      variants: sanitizedVariants,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);
        if (error) throw error;

        // Optimistic local state update to avoid reloading screen and losing scroll position
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? { 
          ...p,
          name: productData.name,
          price: productData.price,
          images: productData.images,
          image: productData.images?.[0] || '',
          category: productData.category,
          stock: productData.stock,
          description: productData.description,
          variants: productData.variants
        } : p));
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);
        if (error) throw error;

        // Reload current page to show new product
        await loadProducts(true);
      }
      handleCloseModal();
    } catch (error: any) {
      console.error('Error saving product:', error);
      setAlertMessage('Error al guardar el producto.');
    }
  };

  const handleDeleteClick = (id: string) => {
    setProductToDelete(id);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    try {
      // Find the product to get its image URLs
      const product = products.find(p => p.id === productToDelete);
      
      // Delete images from Storage if they are Supabase Storage URLs
      if (product && product.images && product.images.length > 0) {
        const filesToDelete = product.images
          .filter(url => url.includes('product-images'))
          .map(url => {
            const parts = url.split('product-images/');
            return parts.length > 1 ? parts[1] : null;
          })
          .filter(Boolean) as string[];

        if (filesToDelete.length > 0) {
          await supabase.storage
            .from('product-images')
            .remove(filesToDelete);
        }
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete);
      
      if (error) throw error;
      
      // Update local state directly to prevent list unmounting and scroll jump
      setProducts(prev => prev.filter(p => p.id !== productToDelete));
      setTotalCount(prev => prev - 1);
      setProductToDelete(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      setAlertMessage('Error al eliminar el producto.');
      setProductToDelete(null);
    }
  };

  // Pagination controls
  const goToPage = (page: number) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
      // Scroll to top of catalog
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/10 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-serif text-black">Catálogo de Productos</h2>
          <p className="text-xs text-black/40 mt-1">{totalCount} productos en total</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar producto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-black/20 py-2 pl-9 pr-3 text-sm focus:border-gold focus:outline-none transition-colors"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
          </div>

          <button 
            onClick={() => handleOpenModal()}
            className="w-full sm:w-auto bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>
      
      {/* Product List Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center text-black/50 font-light py-12">Cargando catálogo...</div>
        ) : products.length === 0 ? (
          <div className="text-center text-black/50 font-light py-12">
            {searchQuery ? 'No se encontraron productos que coincidan con tu búsqueda.' : 'No hay productos en el catálogo. ¡Agrega el primero!'}
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="flex items-center gap-4 px-4 sm:px-6 py-3 hover:bg-gray-50/80 transition-colors group"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-black/5">
                  {product.images?.[0] ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name} 
                      className={`w-full h-full object-cover object-center ${product.stock <= 0 ? 'opacity-40 grayscale' : ''}`}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-black/20">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                        <circle cx="9" cy="9" r="2"/>
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Name + ID */}
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm text-black truncate">{product.name || 'Sin Nombre'}</h3>
                  <p className="text-[11px] text-black/30 font-mono mt-0.5">ID: {product.id.substring(0, 8)}...</p>
                </div>

                {/* Category Badge */}
                <div className="hidden sm:flex shrink-0">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-black/70 uppercase tracking-wider border border-black/5 whitespace-nowrap">
                    {product.category}
                  </span>
                </div>

                {/* Price */}
                <div className="hidden md:block text-right min-w-25 shrink-0">
                  <span className={`text-sm font-medium ${product.price === 'Por definir' ? 'text-black/30 italic' : 'text-black'}`}>
                    {product.price || 'Sin precio'}
                  </span>
                </div>

                {/* Stock */}
                <div className="hidden md:block text-right min-w-20 shrink-0">
                  <span className={`text-sm font-semibold font-mono ${
                    product.stock <= 0 
                      ? 'text-red-500' 
                      : product.stock <= 3 
                      ? 'text-amber-600' 
                      : 'text-emerald-600'
                  }`}>
                    {product.stock} unid.
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={() => handleOpenModal(product)}
                    className="p-2.5 text-black/30 hover:text-gold hover:bg-gold/5 transition-colors rounded-lg"
                    title="Editar"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteClick(product.id)}
                    className="p-2.5 text-black/30 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-black/10 bg-gray-50/30">
          <p className="text-xs text-black/40">
            Mostrando {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              className={`p-2 border border-black/10 transition-colors ${
                currentPage === 0 
                  ? 'text-black/20 cursor-not-allowed' 
                  : 'text-black/60 hover:bg-black hover:text-white hover:border-black'
              }`}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter(i => {
                  // Show first, last, current, and neighbors
                  if (i === 0 || i === totalPages - 1) return true;
                  if (Math.abs(i - currentPage) <= 1) return true;
                  return false;
                })
                .reduce<(number | 'dots')[]>((acc, i, idx, arr) => {
                  if (idx > 0 && i - (arr[idx - 1] as number) > 1) {
                    acc.push('dots');
                  }
                  acc.push(i);
                  return acc;
                }, [])
                .map((item, idx) => 
                  item === 'dots' ? (
                    <span key={`dots-${idx}`} className="px-1 text-black/30 text-xs">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => goToPage(item as number)}
                      className={`min-w-8 h-8 text-xs font-medium border transition-colors ${
                        currentPage === item
                          ? 'bg-black text-white border-black'
                          : 'border-black/10 text-black/60 hover:bg-gray-100'
                      }`}
                    >
                      {(item as number) + 1}
                    </button>
                  )
                )}
            </div>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              className={`p-2 border border-black/10 transition-colors ${
                currentPage >= totalPages - 1 
                  ? 'text-black/20 cursor-not-allowed' 
                  : 'text-black/60 hover:bg-black hover:text-white hover:border-black'
              }`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md border border-black/10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-black/10 bg-gray-50/50 sticky top-0 z-10">
              <h3 className="font-serif text-xl text-black">
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              <button onClick={handleCloseModal} className="text-black/50 hover:text-black">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Nombre del Producto <span className="text-black/30 normal-case font-normal">(opcional por ahora)</span></label>
                <input 
                  type="text" 
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors"
                  placeholder="Ej: Anillo Diamante Eterno (puedes dejarlo vacío)"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Descripción</label>
                <textarea 
                  value={formData.description}
                  maxLength={5000}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors min-h-20 resize-y"
                  placeholder="Descripción detallada del producto..."
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Precio Base <span className="text-black/30 normal-case font-normal">(opcional)</span></label>
                  <input 
                    type="text" 
                    maxLength={50}
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors"
                    placeholder="Ej: $4.200.000"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Categoría</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors bg-white"
                  >
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Unidades</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: e.target.value})}
                    className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors"
                    placeholder="Ej: 5"
                  />
                </div>
              </div>

              {/* Variantes (Tamaños/Precios) */}
              <div className="border border-black/10 p-4 bg-gray-50/50">
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-xs uppercase tracking-wider text-black/60">Variantes (Tamaños y Precios)</label>
                  <button 
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, variants: [...prev.variants, { name: '', price: '' }] }))}
                    className="text-xs bg-black text-white px-3 py-1 hover:bg-gold transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Añadir Variante
                  </button>
                </div>
                
                {formData.variants.length === 0 ? (
                  <p className="text-xs text-black/40 italic">No hay variantes. Se usará el precio base.</p>
                ) : (
                  <div className="space-y-3">
                    {formData.variants.map((variant, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <div className="flex-1">
                          <input 
                            type="text" 
                            required
                            value={variant.name}
                            onChange={(e) => {
                              const newVariants = formData.variants.map((v, i) =>
                                i === idx ? { ...v, name: e.target.value } : v
                              );
                              setFormData({...formData, variants: newVariants});
                            }}
                            className="w-full border border-black/20 p-2 text-sm focus:border-gold focus:outline-none"
                            placeholder="Tamaño (ej: 60 cm)"
                          />
                        </div>
                        <div className="flex-1">
                          <input 
                            type="text" 
                            required
                            value={variant.price}
                            onChange={(e) => {
                              const newVariants = formData.variants.map((v, i) =>
                                i === idx ? { ...v, price: e.target.value } : v
                              );
                              setFormData({...formData, variants: newVariants});
                            }}
                            className="w-full border border-black/20 p-2 text-sm focus:border-gold focus:outline-none"
                            placeholder="Precio (ej: $340.000)"
                          />
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newVariants = [...formData.variants];
                            newVariants.splice(idx, 1);
                            setFormData({...formData, variants: newVariants});
                          }}
                          className="bg-red-100 text-red-600 p-2 hover:bg-red-200 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-black/60 mb-2">Imágenes del Producto</label>
                
                {/* Image Previews */}
                {formData.images.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-3">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="relative w-24 h-24 border border-black/10 bg-gray-50">
                        <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover object-center" />
                        <button
                          type="button"
                          onClick={() => {
                            const newImages = [...formData.images];
                            newImages.splice(idx, 1);
                            setFormData({...formData, images: newImages, image: newImages[0] || ''});
                          }}
                          className="absolute -top-2 -right-2 bg-white border border-black/10 text-red-500 p-1 rounded-full hover:bg-red-50"
                        >
                          <X size={14} />
                        </button>
                        {idx === 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                            Principal
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {/* URL Input */}
                  <div className="flex gap-2">
                    <input 
                      type="url" 
                      id="imageUrlInput"
                      className="flex-1 border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors"
                      placeholder="https://... (URL de la imagen)"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('imageUrlInput') as HTMLInputElement;
                        if (input && input.value) {
                          const rawUrl = input.value.trim();
                          
                          let isValid = false;
                          try {
                            const parsedUrl = new URL(rawUrl);
                            isValid = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
                          } catch {
                            isValid = false;
                          }
                          
                          if (!isValid) {
                            setAlertMessage('Por favor ingresa una URL válida que empiece con http:// o https://.');
                            return;
                          }
                          
                          const cleanUrl = sanitizeString(rawUrl, 1000);
                          setFormData(prev => ({
                            ...prev,
                            images: [...prev.images, cleanUrl],
                            image: prev.images.length === 0 ? cleanUrl : prev.image
                          }));
                          input.value = '';
                        }
                      }}
                      className="bg-black text-white px-4 hover:bg-gold transition-colors text-sm uppercase tracking-wider"
                    >
                      Añadir
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-black/10"></div>
                    <span className="text-xs text-black/40 uppercase tracking-widest">O</span>
                    <div className="h-px flex-1 bg-black/10"></div>
                  </div>

                  {/* Drag & Drop Upload Zone */}
                  <div>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleImageUpload}
                      ref={fileInputRef}
                      className="hidden"
                    />
                    <div
                      ref={dropZoneRef}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => !uploadingImage && fileInputRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-sm p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 select-none ${
                        uploadingImage
                          ? 'border-black/20 bg-gray-50 cursor-not-allowed'
                          : isDragging
                          ? 'border-gold bg-amber-50 scale-[1.01] cursor-copy'
                          : 'border-black/25 hover:border-gold hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className={`transition-transform duration-200 ${ isDragging ? 'scale-125' : '' }`}>
                        <Upload size={28} className={isDragging ? 'text-gold' : 'text-black/40'} />
                      </div>
                      <div className="text-center">
                        {uploadingImage ? (
                          <>
                            <p className="text-sm font-medium text-black/60">Subiendo imagen...</p>
                            <p className="text-xs text-black/40">{Math.round(uploadProgress)}%</p>
                          </>
                        ) : isDragging ? (
                          <p className="text-sm font-medium text-gold">Suelta la imagen aquí</p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-black/70">Arrastra una imagen aquí</p>
                            <p className="text-xs text-black/40 mt-0.5">o haz clic para seleccionar</p>
                          </>
                        )}
                      </div>
                    </div>
                    {uploadingImage && (
                      <div className="w-full h-1 bg-gray-200 mt-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gold transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 border border-black/20 text-black py-3 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-black text-white py-3 hover:bg-gold transition-colors flex items-center justify-center gap-2 uppercase tracking-wider text-xs font-medium"
                >
                  <Save size={16} />
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/50 z-70 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-black/10 shadow-2xl p-6">
            <h3 className="font-serif text-xl text-black mb-4">Confirmar Eliminación</h3>
            <p className="text-black/70 mb-6">¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setProductToDelete(null)}
                className="flex-1 border border-black/20 text-black py-2 hover:bg-gray-50 transition-colors uppercase tracking-wider text-xs font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 bg-red-600 text-white py-2 hover:bg-red-700 transition-colors uppercase tracking-wider text-xs font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black/50 z-80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-black/10 shadow-2xl p-6">
            <h3 className="font-serif text-xl text-black mb-4">Aviso</h3>
            <p className="text-black/70 mb-6">{alertMessage}</p>
            <button 
              onClick={() => setAlertMessage(null)}
              className="w-full bg-black text-white py-2 hover:bg-gold transition-colors uppercase tracking-wider text-xs font-medium"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
