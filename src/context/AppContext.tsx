import React, { createContext, useContext, useState, ReactNode } from 'react';
import { readSafeLocalStorage } from '../lib/sanitize';
import { applyDiscount, type PromoKind } from '../lib/pricing';

export interface Variant {
  name: string;
  /** Texto heredado ("$130.000"); solo informativo */
  price: string;
  price_cop?: number | null;
  /** Precio final calculado por el servidor para esta variante (best_promo) */
  effective_price_cop?: number | null;
  promo_kind?: PromoKind | null;
  promo_value?: number | null;
}

export interface Product {
  id: string;
  name: string;
  price: string;
  /** Precio base en pesos enteros */
  priceCop: number;
  /** Precio final con promoción vigente (el servidor lo recalcula al crear el pedido) */
  effectivePriceCop: number;
  promoKind?: PromoKind | null;
  promoValue?: number | null;
  image: string;
  images?: string[];
  category: string;
  stock: number;
  description?: string;
  variants?: Variant[];
}

export interface CartItem extends Product {
  cartItemId: string;
  quantity: number;
  selectedVariant?: Variant;
}

/**
 * Precio unitario que se muestra para un producto (y variante) con la promoción aplicada.
 * El servidor ya lo calculó (effective_price_cop); el cálculo local es solo respaldo
 * para datos que no traen el campo.
 */
export function unitPriceFor(product: Product, variant?: Variant): number {
  if (!variant) return product.effectivePriceCop;
  if (typeof variant.effective_price_cop === 'number') return variant.effective_price_cop;
  const base = variant.price_cop ?? product.priceCop;
  return applyDiscount(base, product.promoKind, product.promoValue);
}

/** Precio base (sin promoción) de un producto o variante. */
export function basePriceFor(product: Product, variant?: Variant): number {
  return variant?.price_cop ?? product.priceCop;
}

interface AppContextType {
  cart: CartItem[];
  addToCart: (product: Product, variant?: Variant) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (isOpen: boolean) => void;
  isVIPFormOpen: boolean;
  setIsVIPFormOpen: (isOpen: boolean) => void;
  userName: string | null;
  setUserName: (name: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVIPFormOpen, setIsVIPFormOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(() => {
    // Re-sanitize on read AND enforce 30-day expiry — defends against DevTools tampering
    return readSafeLocalStorage('user_name', 100);
  });

  const addToCart = (product: Product, variant?: Variant) => {
    if (product.stock <= 0) return; // Prevent adding out of stock items

    // Misma variante del mismo producto = misma línea
    const cartItemId = variant ? `${product.id}::${variant.name}` : product.id;

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
          const newQuantity = Math.min(quantity, item.stock);
          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  const clearCart = () => setCart([]);

  return (
    <AppContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        searchQuery,
        setSearchQuery,
        isSearchOpen,
        setIsSearchOpen,
        isMenuOpen,
        setIsMenuOpen,
        isVIPFormOpen,
        setIsVIPFormOpen,
        userName,
        setUserName,
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
