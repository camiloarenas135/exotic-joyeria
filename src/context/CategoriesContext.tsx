import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Category } from '../lib/types';
import { fetchCollectionCovers } from '../lib/catalog';

const CACHE_KEY = 'categories_cache_v1';
const COVERS_KEY = 'collection_covers_cache_v1';
const REVALIDATE_MS = 5 * 60 * 1000;

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  /** category_id → foto de portada (falta si la colección no tiene foto). */
  covers: Record<string, string>;
  coversLoading: boolean;
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

function readCovers(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(COVERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(readCache);
  const [loading, setLoading] = useState(categories.length === 0);
  const [covers, setCovers] = useState<Record<string, string>>(readCovers);
  const [coversLoading, setCoversLoading] = useState(Object.keys(covers).length === 0);

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
    // Las portadas son decorativas: si falla, se queda lo que había (o el monograma)
    try {
      const next = await fetchCollectionCovers();
      setCovers(next);
      try {
        sessionStorage.setItem(COVERS_KEY, JSON.stringify(next));
      } catch {
        /* modo privado: se ignora */
      }
    } catch {
      /* sin portadas */
    }
    setCoversLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, REVALIDATE_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const value = useMemo(() => ({ categories, loading, covers, coversLoading, refresh }), [categories, loading, covers, coversLoading, refresh]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within a CategoriesProvider');
  return ctx;
}
