import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Category, Channel, PromoCover } from '../lib/types';
import { fetchCollectionCovers, fetchPromoCover } from '../lib/catalog';
import { useChannel } from './ChannelContext';

const CACHE_KEY = 'categories_cache_v1';
/** Las portadas dependen del canal (las del mayorista solo incluyen colecciones publicadas): una clave por canal. */
const coversKey = (channel: Channel) => `collection_covers_cache_v2:${channel}`;
const PROMO_KEY = 'promo_cover_cache_v1';
const REVALIDATE_MS = 5 * 60 * 1000;
/** Al volver a la pestaña solo se revalida si pasó más de esto (los temporizadores se frenan en segundo plano). */
const VISIBLE_STALE_MS = 60 * 1000;
/** Tope de espera de la burbuja antes de pintar la fila sin ella (evita saltos de layout sin bloquear). */
const PROMO_WAIT_MS = 2500;

interface PromoCache {
  data: PromoCover | null;
  fetchedAt: number;
}

interface CoversCache {
  covers: Record<string, string>;
  /** Mayorista: colecciones con productos publicados. Detal: null (todas). */
  availableIds: string[] | null;
}

interface CategoriesContextType {
  categories: Category[];
  /** Colecciones que se muestran en menús y círculos: en el canal mayorista, solo las que tienen productos publicados. */
  visibleCategories: Category[];
  loading: boolean;
  /** category_id → foto de portada (falta si la colección no tiene foto). */
  covers: Record<string, string>;
  coversLoading: boolean;
  /** Burbuja "Promociones": null si no hay promociones vigentes (o ya venció) y SIEMPRE null para el mayorista. */
  promoCover: PromoCover | null;
  /** Aún no se sabe si hay promociones (primera visita sin caché): la fila espera para no dar saltos. */
  promoLoading: boolean;
  /** El admin la llama al guardar para que el menú se actualice al instante. */
  refresh: () => Promise<void>;
  /** El admin la llama al crear, activar/desactivar o borrar una promoción. */
  refreshPromoCover: () => Promise<void>;
}

const NO_COVERS: Record<string, string> = {};

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

function readCache(): Category[] {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Category[]) : [];
  } catch {
    return [];
  }
}

function readCovers(channel: Channel): CoversCache {
  try {
    const raw = sessionStorage.getItem(coversKey(channel));
    const v = raw ? (JSON.parse(raw) as CoversCache) : null;
    if (v && v.covers && typeof v.covers === 'object') {
      return { covers: v.covers, availableIds: Array.isArray(v.availableIds) ? v.availableIds : null };
    }
  } catch {
    /* sin caché */
  }
  return { covers: {}, availableIds: null };
}

function readPromo(): PromoCache | null {
  try {
    const raw = sessionStorage.getItem(PROMO_KEY);
    const v = raw ? (JSON.parse(raw) as PromoCache) : null;
    return v && typeof v.fetchedAt === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Vigente = hay datos y (no tiene vencimiento o aún no llega). Se evalúa al LEER, no solo al guardar. */
function isLive(c: PromoCache | null, now: number): PromoCover | null {
  const d = c?.data;
  if (!d) return null;
  if (d.validUntil) {
    const t = Date.parse(d.validUntil);
    if (Number.isFinite(t) && t <= now) return null;
  }
  return d;
}

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { channel, resolving } = useChannel();
  const retail = channel === 'retail';
  const [categories, setCategories] = useState<Category[]>(readCache);
  const [loading, setLoading] = useState(categories.length === 0);
  const [coversState, setCoversState] = useState<CoversCache & { channel: Channel }>(() => ({ ...readCovers(channel), channel }));
  const [coversLoading, setCoversLoading] = useState(Object.keys(coversState.covers).length === 0);
  const [promo, setPromo] = useState<PromoCache | null>(readPromo);
  const [promoLoading, setPromoLoading] = useState(promo === null);
  const [tick, setTick] = useState(0);
  const promoRef = useRef(promo);
  promoRef.current = promo;
  const channelRef = useRef(channel);
  channelRef.current = channel;

  // Las portadas son de UN canal: si el canal cambió se ignoran hasta que lleguen las del nuevo
  const sameChannel = coversState.channel === channel;
  const covers = sameChannel ? coversState.covers : NO_COVERS;
  const availableIds = sameChannel ? coversState.availableIds : null;

  const refreshCategories = useCallback(async () => {
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

  const refreshCovers = useCallback(async () => {
    const ch = channelRef.current;
    // Las portadas son decorativas: si falla, se queda lo que había (o el monograma)
    try {
      const next = await fetchCollectionCovers(ch);
      if (channelRef.current !== ch) return; // el canal cambió mientras tanto: esa respuesta ya no aplica
      setCoversState({ ...next, channel: ch });
      try {
        sessionStorage.setItem(coversKey(ch), JSON.stringify(next));
      } catch {
        /* modo privado: se ignora */
      }
    } catch {
      /* sin portadas */
    }
    setCoversLoading(false);
  }, []);

  const refreshPromoCover = useCallback(async () => {
    if (channelRef.current !== 'retail') {
      setPromoLoading(false);
      return;
    }
    try {
      const data = await fetchPromoCover();
      const next: PromoCache = { data, fetchedAt: Date.now() };
      setPromo(next);
      try {
        sessionStorage.setItem(PROMO_KEY, JSON.stringify(next));
      } catch {
        /* modo privado: se ignora */
      }
    } catch {
      /* error de red o RPC aún no desplegada: se conserva lo último; la guardia de vigencia sigue aplicando */
    }
    setPromoLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.allSettled([refreshCategories(), refreshCovers(), refreshPromoCover()]);
  }, [refreshCategories, refreshCovers, refreshPromoCover]);

  // Al cambiar de canal se cargan las portadas de ese canal (con su propia caché)
  useEffect(() => {
    if (resolving) return;
    setCoversState((c) => (c.channel === channel ? c : { ...readCovers(channel), channel }));
    setCoversLoading(Object.keys(readCovers(channel).covers).length === 0);
    refresh();
    const id = window.setInterval(refresh, REVALIDATE_MS);
    // Si la RPC tarda, la fila se pinta sin la burbuja (aparecerá cuando llegue)
    const cap = window.setTimeout(() => setPromoLoading(false), PROMO_WAIT_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setTick((t) => t + 1);
      if (channelRef.current === 'retail' && Date.now() - (promoRef.current?.fetchedAt ?? 0) > VISIBLE_STALE_MS) void refreshPromoCover();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(cap);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, refreshPromoCover, channel, resolving]);

  // Al vencer la promoción vigente: se oculta la burbuja y se vuelve a consultar (puede haber otra)
  const validUntil = retail ? (promo?.data?.validUntil ?? null) : null;
  useEffect(() => {
    if (!validUntil) return;
    const t = Date.parse(validUntil);
    if (!Number.isFinite(t)) return;
    const wait = Math.min(Math.max(t - Date.now() + 1000, 0), REVALIDATE_MS);
    const id = window.setTimeout(() => {
      setTick((n) => n + 1);
      void refreshPromoCover();
    }, wait);
    return () => window.clearTimeout(id);
  }, [validUntil, promo?.fetchedAt, refreshPromoCover]);

  // El mayorista no ve promociones: la burbuja es solo del detal
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const promoCover = useMemo(() => (retail ? isLive(promo, Date.now()) : null), [promo, tick, retail]);

  const visibleCategories = useMemo(() => {
    if (channel === 'retail' || availableIds === null) return channel === 'retail' ? categories : [];
    const ok = new Set(availableIds);
    return categories.filter((c) => ok.has(c.id));
  }, [categories, channel, availableIds]);

  const value = useMemo(
    () => ({
      categories,
      visibleCategories,
      loading,
      covers,
      coversLoading,
      promoCover,
      promoLoading: retail ? promoLoading : false,
      refresh,
      refreshPromoCover,
    }),
    [categories, visibleCategories, loading, covers, coversLoading, promoCover, promoLoading, retail, refresh, refreshPromoCover]
  );
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within a CategoriesProvider');
  return ctx;
}
