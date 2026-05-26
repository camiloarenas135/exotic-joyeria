import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Variant {
  name: string;
  price: string;
}

export interface Product {
  id: string;
  name: string;
  price: string;
  image: string;
  category: string;
  stock: number;
  variants?: Variant[];
}

interface CartItem extends Product {
  cartItemId: string;
  quantity: number;
  selectedVariant?: Variant;
}

interface AppContextType {
  cart: CartItem[];
  addToCart: (product: Product, variant?: Variant) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
  isVIPFormOpen: boolean;
  setIsVIPFormOpen: (isOpen: boolean) => void;
  userName: string | null;
  setUserName: (name: string | null) => void;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isVIPFormOpen, setIsVIPFormOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(localStorage.getItem('user_name'));
  const [activeFilter, setActiveFilter] = useState('Ver Todo');

  const addToCart = (product: Product, variant?: Variant) => {
    if (product.stock <= 0) return; // Prevent adding out of stock items
    
    const cartItemId = variant ? `${product.id}-${variant.name}` : product.id;
    
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.cartItemId === cartItemId);
      if (existingItem) {
        if (existingItem.quantity >= product.stock) return prevCart; // Max stock reached
        return prevCart.map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, cartItemId, quantity: 1, selectedVariant: variant }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.cartItemId === cartItemId) {
          // Ensure we don't exceed stock
          const newQuantity = Math.min(quantity, item.stock);
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  return (
    <AppContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        isCartOpen,
        setIsCartOpen,
        searchQuery,
        setSearchQuery,
        isSearchOpen,
        setIsSearchOpen,
        isVIPFormOpen,
        setIsVIPFormOpen,
        userName,
        setUserName,
        activeFilter,
        setActiveFilter,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
