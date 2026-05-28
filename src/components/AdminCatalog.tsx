import React, { useState, useEffect, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, X, Save, Upload, Search } from 'lucide-react';

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

const toTitleCase = (str: string) => {
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

const CATEGORIES = ['Anillos', 'Cadenas', 'Pulseras', 'Pulseras tejidas', 'Relojes', 'Topos broche', 'Topos rosca', 'Dijes', 'Insumos'];

export default function AdminCatalog() {
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
    category: CATEGORIES[0],
    stock: 1,
    description: '',
    variants: []
  });

  useEffect(() => {
    loadProducts();
  }, []);

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
        name: p.name,
        price: p.price,
        image: p.images?.[0] || '',
        images: p.images || [],
        category: p.category,
        stock: p.stock ?? 1,
        description: p.description || '',
        variants: p.variants || [],
        createdAt: p.created_at
      })));
    } catch (error: any) {
      console.error('Error loading products:', error);
      setAlertMessage('Error al cargar los productos.');
    } finally {
      setLoading(false);
    }
  }

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        price: product.price,
        image: product.image || '',
        images: product.images || (product.image ? [product.image] : []),
        category: product.category,
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
        category: CATEGORIES[0],
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
    if (!file.type.startsWith('image/')) {
      setAlertMessage('Por favor, selecciona un archivo de imagen válido.');
      return;
    }

    setUploadingImage(true);
    setUploadProgress(10);

    try {
      const options = {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        onProgress: (progress: number) => {
          setUploadProgress(10 + (progress * 0.8));
        }
      };
      
      const compressedFile = await imageCompression(file, options);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

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
      setAlertMessage('Error al subir la imagen: ' + error.message);
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

    const productData = {
      name: formData.name || 'Sin nombre',
      price: formData.price || 'Por definir',
      images: formData.images,
      category: formData.category,
      stock: Number(formData.stock),
      description: formData.description,
      variants: formData.variants,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);
        if (error) throw error;
      }
      handleCloseModal();
      loadProducts();
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
      
      setProductToDelete(null);
      loadProducts();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      setAlertMessage('Error al eliminar el producto.');
      setProductToDelete(null);
    }
  };

  const filteredProducts = products.filter((product) => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    product.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white border border-black/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/10 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-serif text-black">Catálogo de Productos</h2>
        
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
      
      <div className="p-6">
        {loading ? (
          <div className="text-center text-black/50 font-light py-12">Cargando catálogo...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center text-black/50 font-light py-12">
            {searchQuery ? 'No se encontraron productos que coincidan con tu búsqueda.' : 'No hay productos en el catálogo. ¡Agrega el primero!'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="border border-black/10 group relative">
                <div className="aspect-square overflow-hidden bg-gray-50 relative">
                  <img 
                    src={product.images?.[0]} 
                    alt={product.name} 
                    className="w-full h-full object-cover object-center"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.classList.add('flex', 'items-center', 'justify-center');
                      e.currentTarget.parentElement!.innerHTML = '<div class="text-black/30 flex flex-col items-center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span class="text-xs mt-2">Error de imagen</span></div>';
                    }}
                  />
                  <div className="absolute top-2 right-2 flex gap-2 z-10">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(product);
                      }}
                      className="bg-white/90 backdrop-blur-sm text-black p-3 lg:p-2 shadow-lg border border-black/10 hover:text-gold transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={20} className="lg:w-4 lg:h-4 text-black" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(product.id);
                      }}
                      className="bg-white/90 backdrop-blur-sm text-red-500 p-3 lg:p-2 shadow-lg border border-black/10 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={20} className="lg:w-4 lg:h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs text-black/50 uppercase tracking-wider">{product.category}</div>
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${product.stock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {product.stock > 0 ? `${product.stock} disp.` : 'Agotado'}
                    </div>
                  </div>
                  <h3 className="font-serif text-black truncate">{product.name}</h3>
                  <p className="font-medium text-gold mt-1">{product.price}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
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
                  onChange={(e) => setFormData({...formData, name: toTitleCase(e.target.value)})}
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
                  className="w-full border border-black/20 p-3 focus:border-gold focus:outline-none transition-colors min-h-[80px] resize-y"
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
                    {CATEGORIES.map(cat => (
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
                              const newVariants = [...formData.variants];
                              newVariants[idx].name = e.target.value;
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
                              const newVariants = [...formData.variants];
                              newVariants[idx].price = e.target.value;
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
                          setFormData(prev => ({
                            ...prev,
                            images: [...prev.images, input.value],
                            image: prev.images.length === 0 ? input.value : prev.image
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
                    <div className="h-[1px] flex-1 bg-black/10"></div>
                    <span className="text-xs text-black/40 uppercase tracking-widest">O</span>
                    <div className="h-[1px] flex-1 bg-black/10"></div>
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
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
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
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
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
