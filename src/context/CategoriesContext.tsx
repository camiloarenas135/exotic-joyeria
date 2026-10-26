import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Category } from '../lib/types';

const CACHE_KEY = 'categories_cache_v1';
const REVALIDATE_MS = 5 * 60 * 1000;

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  /** El admin la llama al guardar para que el menú se actualice al instante. */
  refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

function readCache(): Category[] {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Category[]) : [];
  } catch {
    return [];
  }
}

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(readCache);
  const [loading, setLoading] = useState(categories.length === 0);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, slug, name, sort_order, is_active, image')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (!error && data) {
      setCategories(data as Category[]);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        /* modo privado: se ignora */
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, REVALIDATE_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const value = useMemo(() => ({ categories, loading, refresh }), [categories, loading, refresh]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within a CategoriesProvider');
  return ctx;
}
