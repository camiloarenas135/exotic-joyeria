import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AccountType, Channel, Wholesaler } from '../lib/types';
import { forgetProducts } from '../lib/productCache';
import { forgetWholesaleMin } from '../lib/wholesale';

/** Claves de sessionStorage que dependen del canal/usuario y se limpian al cerrar sesión. */
const SESSION_KEYS_ON_SIGNOUT = ['collection_covers_cache_v2:wholesale'];

interface ChannelContextType {
  /** 'wholesale' solo si el usuario con sesión tiene wholesalers.status = 'approved'. */
  channel: Channel;
  /** Tipo de la cuenta de negocio APROBADA (decide lista de precios y mínimo); null si es detal. El servidor lo vuelve a derivar en cada pedido. */
  tier: AccountType | null;
  session: Session | null;
  wholesaler: Wholesaler | null;
  /** Aún no se sabe quién es el usuario (sesión o fila de mayorista cargando): no pintar precios todavía. */
  resolving: boolean;
  /** El enlace de "olvidé mi contraseña" abrió la app: hay que pedir la nueva contraseña. */
  recovery: boolean;
  clearRecovery: () => void;
  /** Aviso cuando la cuenta pierde el acceso mayorista durante la sesión (suspensión, revocación). */
  notice: string | null;
  dismissNotice: () => void;
  /** Vuelve a leer el estado del mayorista (botón "revisar estado", volver a la pestaña, NOT_WHOLESALER). */
  refreshWholesaler: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ChannelContext = createContext<ChannelContextType | undefined>(undefined);

// Solo columnas públicas para el dueño de la cuenta: `notes`, `reviewed_by` y `last_status_notified` son internas del admin
// (la migración 062 revoca su lectura). Nunca usar select('*') sobre wholesalers.
const COLUMNS = 'user_id, email, business_name, phone, city, tax_id, status, account_type, created_at';

export function ChannelProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [wholesaler, setWholesaler] = useState<Wholesaler | null>(null);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const uidRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const uid = session?.user.id;
  uidRef.current = uid;

  // Usuario cuyo estado ya se leyó con éxito al menos una vez (para no perderlo si una relectura falla)
  const loadedRef = useRef<string | null>(null);

  const load = useCallback(async (id: string | undefined) => {
    if (!id) {
      loadedRef.current = null;
      setWholesaler(null);
      setLoadedUid(null);
      return;
    }
    const { data, error } = await supabase.from('wholesalers').select(COLUMNS).eq('user_id', id).maybeSingle();
    // Una respuesta tardía de otro usuario no debe pisar al actual
    if (uidRef.current !== id) return;
    // Un fallo de red al releer NO cambia el estado conocido (un mayorista aprobado no pasa a detal)
    if (error && loadedRef.current === id) return;
    setWholesaler(error ? null : ((data as Wholesaler) ?? null));
    setLoadedUid(id);
    if (!error) loadedRef.current = id;
  }, []);

  useEffect(() => {
    // Al cambiar de usuario se descarta lo del anterior de inmediato (nunca se mezclan canales)
    loadedRef.current = null;
    setWholesaler(null);
    setLoadedUid(null);
    void load(uid);
  }, [uid, load]);

  const refreshWholesaler = useCallback(() => load(uidRef.current), [load]);

  // Al volver a la pestaña se revalida el estado (aprobación, suspensión)
  useEffect(() => {
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(uid);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, load]);

  const channel: Channel = wholesaler?.status === 'approved' ? 'wholesale' : 'retail';
  const tier: AccountType | null = wholesaler?.status === 'approved' ? (wholesaler.account_type === 'entrepreneur' ? 'entrepreneur' : 'wholesale') : null;
  const resolving = !authReady || (!!uid && loadedUid !== uid);

  // Cambiar de canal vacía todo lo que pudiera traer precios del otro
  // (también al cambiar de tipo: la lista de precios y el mínimo son otros)
  const lastChannel = useRef<Channel>(channel);
  const lastTier = useRef<AccountType | null>(tier);
  useEffect(() => {
    if (lastChannel.current !== channel || lastTier.current !== tier) {
      if (lastChannel.current === 'wholesale' && channel !== 'wholesale' && uidRef.current) {
        setNotice(`Tu cuenta ${lastTier.current === 'entrepreneur' ? 'de emprendedor' : 'mayorista'} ya no está activa. Si crees que es un error, escríbenos por WhatsApp.`);
      }
      lastChannel.current = channel;
      lastTier.current = tier;
      forgetProducts();
      forgetWholesaleMin();
      try { SESSION_KEYS_ON_SIGNOUT.forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
    }
  }, [channel, tier]);

  const signOut = useCallback(async () => {
    forgetProducts();
    forgetWholesaleMin();
    try {
      SESSION_KEYS_ON_SIGNOUT.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    // El carrito mayorista es de la cuenta: al cerrar sesión no queda nada en el navegador
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('wholesale_cart_v2:') || k === 'wholesale_cart_v1')) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ channel, tier, session, wholesaler, resolving, recovery, clearRecovery: () => setRecovery(false), notice, dismissNotice: () => setNotice(null), refreshWholesaler, signOut }),
    [channel, tier, session, wholesaler, resolving, recovery, notice, refreshWholesaler, signOut]
  );
  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useChannel() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannel must be used within a ChannelProvider');
  return ctx;
}
