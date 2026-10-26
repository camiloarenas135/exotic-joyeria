import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, MessageCircle, Minus, Plus, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeString, sanitizePhone } from '../lib/sanitize';
import { formatCOP, orderErrorMessage, WHOLESALE_MIN_FALLBACK } from '../lib/pricing';
import { whatsappLink } from '../lib/config';
import type { Wholesaler, WholesaleRow } from '../lib/types';
import Turnstile, { TURNSTILE_SITE_KEY } from '../components/Turnstile';

const CART_KEY = 'wholesale_cart_v1'; // separado del carrito al detal

interface WCartLine {
  id: string;
  variant: string | null;
  qty: number;
}

const input =
  'w-full border border-black/20 bg-ivory px-3 min-h-11 text-sm focus:outline-none focus:border-gold-dark';
const primaryBtn =
  'w-full bg-ink text-ivory min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors disabled:opacity-60';

function loadCart(): WCartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty > 0)
          .map((l) => ({ id: l.id, variant: typeof l.variant === 'string' ? l.variant : null, qty: Math.min(l.qty, 999) }))
      : [];
  } catch {
    return [];
  }
}

/* ------------------------------ Acceso ------------------------------ */

function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [taxId, setTaxId] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setCaptcha(t), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const mail = email.trim().toLowerCase();
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (err) setError(/confirm/i.test(err.message) ? 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.' : 'Correo o contraseña incorrectos. Si no la recuerdas, usa “Olvidé mi contraseña”.');
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/mayoristas` });
        if (err) setError('No pudimos enviar el correo. Intenta de nuevo.');
        else setInfo('Listo. Si ese correo está registrado, te enviamos un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.');
      } else {
        if (password.length < 8) {
          setError('La contraseña debe tener al menos 8 caracteres.');
          return;
        }
        if (TURNSTILE_SITE_KEY && !captcha) {
          setError('Completa la verificación de seguridad.');
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: mail,
          password,
          options: {
            captchaToken: captcha ?? undefined,
            data: {
              signup_type: 'wholesale',
              business_name: sanitizeString(business, 120),
              phone: sanitizePhone(phone).slice(0, 30),
              city: sanitizeString(city, 80),
              tax_id: sanitizeString(taxId, 30),
            },
          },
        });
        if (err) setError('No pudimos crear tu cuenta. Revisa los datos o intenta con otro correo.');
        else if (!data.session) setInfo('Cuenta creada. Revisa tu correo para confirmarla; luego ingresa y tu solicitud quedará en revisión.');
        // con sesión iniciada, la pantalla pasa sola a "Tu solicitud está en revisión"
      }
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
        setInfo(null);
      }}
      aria-pressed={mode === m}
      className={`flex-1 min-h-11 text-xs uppercase tracking-widest border-b-2 ${mode === m ? 'border-gold-dark text-ink font-semibold' : 'border-transparent text-black/50'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="flex mb-6" role="group" aria-label="Acceso mayorista">
        {tab('login', 'Ingresar')}
        {tab('register', 'Registrarme')}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <>
            <label className="block text-sm">Nombre del negocio
              <input className={input} value={business} onChange={(e) => setBusiness(e.target.value)} required minLength={2} maxLength={120} autoComplete="organization" />
            </label>
            <label className="block text-sm">WhatsApp
              <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={20} autoComplete="tel" />
            </label>
            <label className="block text-sm">Ciudad
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} required maxLength={80} autoComplete="address-level2" />
            </label>
            <label className="block text-sm">Cédula o NIT (opcional)
              <input className={input} value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={30} />
            </label>
          </>
        )}
        <label className="block text-sm">Correo
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
        </label>
        {mode !== 'forgot' && (
          <label className="block text-sm">Contraseña
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} maxLength={72} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
        )}
        {mode === 'register' && <Turnstile onToken={onToken} />}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {info && <p role="status" className="text-sm text-green-800">{info}</p>}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Solicitar acceso' : 'Enviar enlace'}
        </button>
        {mode === 'login' && (
          <button type="button" onClick={() => setMode('forgot')} className="w-full text-sm text-gold-dark underline min-h-11">
            Olvidé mi contraseña
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" onClick={() => setMode('login')} className="w-full text-sm text-gold-dark underline min-h-11">
            Volver a ingresar
          </button>
        )}
      </form>
    </div>
  );
}

function RecoveryPanel({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError('No pudimos cambiar la contraseña. Usa mínimo 8 caracteres.');
    else onDone();
  };
  return (
    <form onSubmit={submit} className="max-w-md mx-auto space-y-4">
      <h2 className="font-serif text-2xl text-ink">Nueva contraseña</h2>
      <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" aria-label="Nueva contraseña" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primaryBtn}>Guardar contraseña</button>
    </form>
  );
}

/* --------------------------- Catálogo mayorista --------------------------- */

function WholesaleShop({ wholesaler }: { wholesaler: Wholesaler }) {
  const [rows, setRows] = useState<WholesaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [minCop, setMinCop] = useState(WHOLESALE_MIN_FALLBACK);
  const [cart, setCart] = useState<WCartLine[]>(loadCart);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('wholesale_catalog').then(({ data }) => {
      setRows((data || []) as WholesaleRow[]);
      setLoading(false);
    });
    supabase.from('settings').select('value').eq('key', 'wholesale_min_cop').maybeSingle().then(({ data }) => {
      const n = Number(data?.value);
      if (Number.isFinite(n) && n > 0) setMinCop(n);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const priceOf = useCallback(
    (line: WCartLine): number | null => {
      const r = byId.get(line.id);
      if (!r) return null;
      if (line.variant) return r.wholesale_variants.find((v) => v.name === line.variant)?.price_cop ?? null;
      return r.wholesale_price_cop;
    },
    [byId]
  );

  const validLines = cart.filter((l) => priceOf(l) !== null);
  const total = validLines.reduce((s, l) => s + (priceOf(l) ?? 0) * l.qty, 0);
  const missing = Math.max(minCop - total, 0);

  const add = (r: WholesaleRow) => {
    const variant = r.wholesale_variants.length > 0 ? (picked[r.id] ?? r.wholesale_variants[0].name) : null;
    setCart((c) => {
      const existing = c.find((l) => l.id === r.id && l.variant === variant);
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: Math.min(l.qty + 1, Math.min(r.stock, 999)) } : l));
      return [...c, { id: r.id, variant, qty: 1 }];
    });
  };
  const setQty = (line: WCartLine, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l !== line) : c.map((l) => (l === line ? { ...l, qty: Math.min(qty, 999) } : l))));

  const checkout = async () => {
    setError(null);
    const popup = window.open('about:blank', '_blank');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc('create_order', {
        p_channel: 'wholesale',
        p_customer: { name: sanitizeString(wholesaler.business_name || 'Mayorista', 100), phone: sanitizePhone(wholesaler.phone || '') },
        p_lines: validLines.map((l) => ({ product_id: l.id, variant: l.variant, qty: l.qty })),
      });
      if (err) throw err;
      const order = data as { total: number; lines: { name: string; variant: string | null; qty: number; unit_price: number }[] };
      let msg = `¡Hola! Soy ${sanitizeString(wholesaler.business_name || '', 100)} (mayorista). Quiero hacer este pedido:\n\n`;
      order.lines.forEach((l) => {
        msg += `${l.qty}x ${sanitizeString(l.name, 100)}${l.variant ? ` (${sanitizeString(l.variant, 50)})` : ''} - ${formatCOP(l.unit_price)}\n`;
      });
      msg += `\n*Total: ${formatCOP(order.total)}*`;
      if (popup) {
        popup.opener = null;
        popup.location.href = whatsappLink(msg);
      } else window.location.href = whatsappLink(msg);
      setCart([]);
    } catch (e) {
      popup?.close();
      setError(orderErrorMessage(e instanceof Error ? e.message : (e as { message?: string })?.message));
    } finally {
      setBusy(false);
    }
  };

  const shown = rows.filter((r) => !term.trim() || r.name.toLowerCase().includes(term.trim().toLowerCase()));

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-10">
      <div>
        <p role="status" className="mb-6 p-3 bg-surface border border-black/10 text-sm text-black/75">Tu cuenta está aprobada. El pedido mínimo es de <b>{formatCOP(minCop)}</b> en un solo pedido; el total se valida en el servidor.</p>
        <input className={`${input} mb-6 max-w-sm`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" maxLength={100} />
        {loading ? (
          <p className="text-black/60">Cargando catálogo…</p>
        ) : shown.length === 0 ? (
          <p className="text-black/60 py-10">Aún no hay productos mayoristas disponibles.</p>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8">
            {shown.map((r) => {
              const hasVariants = r.wholesale_variants.length > 0;
              const selected = picked[r.id] ?? r.wholesale_variants[0]?.name;
              const price = hasVariants ? r.wholesale_variants.find((v) => v.name === selected)?.price_cop ?? null : r.wholesale_price_cop;
              return (
                <li key={r.id} className="flex flex-col">
                  <div className="aspect-[4/5] bg-surface mb-3 overflow-hidden">
                    {r.images?.[0] && <img src={r.images[0]} alt={r.name} width={300} height={375} loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                  </div>
                  <h3 className="font-serif text-sm text-ink mb-1 line-clamp-2">{r.name}</h3>
                  {hasVariants && (
                    <select value={selected} onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))} className={`${input} mb-2`} aria-label={`Opción de ${r.name}`}>
                      {r.wholesale_variants.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                    </select>
                  )}
                  <p className="text-gold-dark font-semibold text-sm mb-2">{price !== null ? formatCOP(price) : '—'}</p>
                  <button
                    onClick={() => add(r)}
                    disabled={r.stock <= 0 || price === null}
                    className="mt-auto bg-ink text-ivory min-h-11 text-xs uppercase tracking-widest hover:bg-gold-dark transition-colors disabled:opacity-40"
                  >
                    {r.stock <= 0 ? 'Agotado' : 'Añadir'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="mt-10 lg:mt-0 lg:sticky lg:top-24 self-start border border-black/15 p-5" aria-label="Pedido mayorista">
        <h2 className="font-serif text-xl mb-4 flex items-center gap-2"><ShoppingBag size={20} /> Tu pedido</h2>
        {validLines.length === 0 ? (
          <p className="text-sm text-black/60">Aún no has añadido productos.</p>
        ) : (
          <ul className="space-y-4 mb-4">
            {validLines.map((l) => {
              const r = byId.get(l.id)!;
              return (
                <li key={`${l.id}-${l.variant}`} className="text-sm">
                  <p className="text-ink">{r.name}{l.variant ? ` (${l.variant})` : ''}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center border border-black/15">
                      <button onClick={() => setQty(l, l.qty - 1)} className="p-2" aria-label="Disminuir"><Minus size={14} /></button>
                      <span className="w-8 text-center">{l.qty}</span>
                      <button onClick={() => setQty(l, l.qty + 1)} disabled={l.qty >= r.stock} className="p-2 disabled:opacity-30" aria-label="Aumentar"><Plus size={14} /></button>
                    </div>
                    <span>{formatCOP((priceOf(l) ?? 0) * l.qty)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-between font-serif text-lg border-t border-black/10 pt-4 mb-3">
          <span>Total</span><span>{formatCOP(total)}</span>
        </div>
        {missing > 0 ? (
          <p className="text-sm text-gold-dark mb-3" role="status">Te faltan {formatCOP(missing)} para el mínimo de {formatCOP(minCop)}.</p>
        ) : (
          <p className="text-sm text-green-800 mb-3" role="status">Alcanzaste el pedido mínimo.</p>
        )}
        {error && <p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
        <button onClick={checkout} disabled={busy || missing > 0 || validLines.length === 0} className={`${primaryBtn} flex items-center justify-center gap-2`}>
          <MessageCircle size={16} /> {busy ? 'Procesando…' : 'Enviar pedido por WhatsApp'}
        </button>
      </aside>
    </div>
  );
}

/* -------------------------------- Página -------------------------------- */

export default function Mayoristas() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [wholesaler, setWholesaler] = useState<Wholesaler | null>(null);
  const [loadingW, setLoadingW] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    document.title = 'Zona mayorista | Exotic Joyería';
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) {
      setWholesaler(null);
      return;
    }
    setLoadingW(true);
    supabase
      .from('wholesalers')
      .select('user_id, email, business_name, phone, city, tax_id, status, notes, created_at')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        setWholesaler((data as Wholesaler) ?? null);
        setLoadingW(false);
      });
  }, [uid, reloadKey]);

  const signOut = () => supabase.auth.signOut();

  let body: React.ReactNode;
  if (!ready || loadingW) body = <p className="text-center text-black/60">Cargando…</p>;
  else if (recovery && session) body = <RecoveryPanel onDone={() => { setRecovery(false); setNotice('Tu contraseña fue actualizada. Ya puedes usar tu cuenta.'); }} />;
  else if (!session) body = <AuthPanel />;
  else if (!wholesaler)
    body = (
      <div className="max-w-md mx-auto text-center space-y-4">
        <p className="text-black/70">Esta cuenta no está registrada como mayorista. Cierra sesión e ingresa con tu correo mayorista o regístrate.</p>
        <button onClick={signOut} className={primaryBtn}>Cerrar sesión</button>
      </div>
    );
  else if (wholesaler.status === 'pending')
    body = (
      <div className="max-w-md mx-auto text-center space-y-4">
        <h2 className="font-serif text-2xl">Tu solicitud está en revisión</h2>
        <p className="text-black/70">Recibimos tu solicitud. Cuando el administrador la apruebe te enviaremos un correo para que puedas ingresar y ver los precios mayoristas.</p>
        <ol className="text-left text-sm text-black/70 space-y-2 border border-black/10 p-4">
          <li>✓ Cuenta creada con <b>{wholesaler.email}</b></li>
          <li>⏳ En revisión por el administrador</li>
          <li className="text-black/40">○ Aprobada: recibes un correo y accedes a tus precios</li>
        </ol>
        <button onClick={() => setReloadKey((k) => k + 1)} className={primaryBtn}>Revisar estado de mi solicitud</button>
        <button onClick={signOut} className="text-sm underline text-gold-dark min-h-11">Cerrar sesión</button>
      </div>
    );
  else if (wholesaler.status !== 'approved')
    body = (
      <div className="max-w-md mx-auto text-center space-y-4">
        <h2 className="font-serif text-2xl">{wholesaler.status === 'suspended' ? 'Tu acceso está suspendido' : 'No pudimos habilitar tu acceso'}</h2>
        <p className="text-black/70">{wholesaler.status === 'suspended' ? 'Tu cuenta mayorista está suspendida temporalmente.' : 'Por ahora tu solicitud no fue aprobada.'} Escríbenos por WhatsApp y con gusto revisamos tu caso.</p>
        <a href={whatsappLink('Hola, quiero consultar el estado de mi cuenta mayorista.')} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} flex items-center justify-center`}>Escribir por WhatsApp</a>
        <button onClick={signOut} className="text-sm underline text-gold-dark min-h-11">Cerrar sesión</button>
      </div>
    );
  else body = <WholesaleShop wholesaler={wholesaler} />;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-start justify-between gap-4 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-dark mb-2">Zona mayorista</p>
          <h1 className="font-serif text-3xl md:text-4xl text-ink">Precios para mayoristas</h1>
          <div className="h-px w-16 bg-gold mt-4" />
        </div>
        {session && wholesaler?.status === 'approved' && (
          <button onClick={signOut} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest min-h-11 text-black/60 hover:text-ink">
            <LogOut size={16} /> Salir
          </button>
        )}
      </div>
      {notice && (
        <div role="status" className="max-w-md mx-auto mb-6 p-3 bg-green-50 border border-green-200 text-green-900 text-sm flex justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}
      {body}
    </section>
  );
}
