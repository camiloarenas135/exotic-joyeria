import type React from 'react';
import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sanitizeString, sanitizePhone } from '../lib/sanitize';
import { useChannel } from '../context/ChannelContext';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile';

export const fieldInput = 'w-full border border-black/20 bg-ivory px-3 min-h-11 text-sm focus:outline-none focus:border-gold-dark';
export const primaryBtn =
  'w-full bg-ink text-ivory min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors disabled:opacity-60';
const secondaryBtn = 'w-full border border-ink text-ink min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ink hover:text-ivory transition-colors';

/** Mismas reglas que la base (request_wholesale_access): nombre >= 2, ciudad >= 2, teléfono de 7 a 15 dígitos. */
export function validateBusiness(b: { business: string; city: string; phone: string }): string | null {
  if (sanitizeString(b.business, 120).length < 2) return 'Escribe el nombre de tu negocio.';
  if (sanitizeString(b.city, 80).length < 2) return 'Escribe tu ciudad.';
  const digits = sanitizePhone(b.phone).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'El número de WhatsApp no es válido (entre 7 y 15 dígitos).';
  return null;
}

const ACCESS_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: 'Tu sesión expiró. Ingresa de nuevo.',
  INVALID_NAME: 'Escribe el nombre de tu negocio.',
  INVALID_PHONE: 'El número de WhatsApp no es válido (entre 7 y 15 dígitos).',
  INVALID_CITY: 'Escribe tu ciudad.',
};

type Mode = 'login' | 'register' | 'forgot';

/** Ingresar / Registrarme (3 pasos cortos) / Olvidé mi contraseña. */
export function AuthPanel({ initialMode = 'login' }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(1);
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

  const goStep = (next: number) => {
    setError(null);
    if (next > step) {
      if (step === 1) {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe un correo válido.');
        if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
      }
      if (step === 2) {
        if (sanitizeString(business, 120).length < 2) return setError('Escribe el nombre de tu negocio.');
        if (sanitizeString(city, 80).length < 2) return setError('Escribe tu ciudad.');
      }
    }
    setStep(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const mail = email.trim().toLowerCase();
    if (mode === 'register' && step < 3) return goStep(step + 1);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (err) setError(/confirm/i.test(err.message) ? 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.' : 'Correo o contraseña incorrectos. Si no la recuerdas, usa “Olvidé mi contraseña”.');
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/mayoristas` });
        if (err) setError('No pudimos enviar el correo. Intenta de nuevo.');
        else setInfo('Listo. Si ese correo está registrado, te enviamos un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.');
      } else {
        const problem = validateBusiness({ business, city, phone });
        if (problem) return setError(problem);
        if (TURNSTILE_SITE_KEY && !captcha) return setError('Completa la verificación de seguridad.');
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
        const exists = !!err && /already|registered|exists/i.test(err.message);
        const hidden = !err && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0; // correo ya registrado (Auth lo oculta)
        if (exists || hidden) {
          setError('Ese correo ya tiene una cuenta. Ingresa con ella en la pestaña “Ingresar”: si aún no eres mayorista, ahí mismo podrás completar tu solicitud.');
        } else if (err) setError('No pudimos crear tu cuenta. Revisa los datos o intenta con otro correo.');
        else if (!data.session) setInfo('Cuenta creada. Revisa tu correo para confirmarla; luego ingresa y tu solicitud quedará en revisión (aproximadamente 24 horas).');
        // con sesión iniciada, la pantalla pasa sola a "Tu solicitud está en revisión"
      }
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setStep(1);
        setError(null);
        setInfo(null);
      }}
      aria-pressed={mode === m}
      className={`flex-1 min-h-11 text-[11px] sm:text-xs uppercase tracking-widest border-b-2 ${mode === m ? 'border-gold-dark text-ink font-semibold' : 'border-transparent text-black/50'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="flex mb-6" role="group" aria-label="Acceso mayorista">
        {tab('login', 'Ingresar')}
        {tab('register', 'Registrarme')}
        {tab('forgot', 'Olvidé')}
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === 'register' && (
          <p className="text-xs uppercase tracking-widest text-gold-dark" aria-live="polite">
            Paso {step} de 3 · {step === 1 ? 'Tu cuenta' : step === 2 ? 'Tu negocio' : 'Contacto'}
          </p>
        )}
        {(mode !== 'register' || step === 1) && (
          <>
            <label className="block text-sm">Correo
              <input className={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
            </label>
            {mode !== 'forgot' && (
              <label className="block text-sm">Contraseña
                <input className={fieldInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} maxLength={72} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
              </label>
            )}
          </>
        )}
        {mode === 'register' && step === 2 && (
          <>
            <label className="block text-sm">Nombre del negocio
              <input className={fieldInput} value={business} onChange={(e) => setBusiness(e.target.value)} required minLength={2} maxLength={120} autoComplete="organization" />
            </label>
            <label className="block text-sm">Ciudad
              <input className={fieldInput} value={city} onChange={(e) => setCity(e.target.value)} required maxLength={80} autoComplete="address-level2" />
            </label>
            <label className="block text-sm">Cédula o NIT (opcional)
              <input className={fieldInput} value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={30} />
            </label>
          </>
        )}
        {mode === 'register' && step === 3 && (
          <>
            <label className="block text-sm">WhatsApp
              <input className={fieldInput} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={20} autoComplete="tel" />
            </label>
            <p className="text-xs text-black/60">Te escribiremos a este número y al correo cuando tu cuenta esté aprobada (aproximadamente 24 horas).</p>
            <Turnstile onToken={onToken} />
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {info && <p role="status" className="text-sm text-green-800">{info}</p>}
        <div className="flex gap-3">
          {mode === 'register' && step > 1 && (
            <button type="button" onClick={() => goStep(step - 1)} className={`${secondaryBtn} flex-1`}>Atrás</button>
          )}
          <button type="submit" disabled={busy} className={`${primaryBtn} ${mode === 'register' && step > 1 ? 'flex-1' : ''}`}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : mode === 'register' ? (step < 3 ? 'Siguiente' : 'Solicitar acceso') : 'Enviar enlace'}
          </button>
        </div>
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

/** Cuenta ya existente (con sesión) pero sin solicitud mayorista: crea la solicitud con request_wholesale_access. */
export function RequestAccessForm() {
  const { session, refreshWholesaler } = useChannel();
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [taxId, setTaxId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = validateBusiness({ business, city, phone });
    if (problem) return setError(problem);
    setBusy(true);
    const { error: err } = await supabase.rpc('request_wholesale_access', {
      p_business_name: sanitizeString(business, 120),
      p_phone: sanitizePhone(phone).slice(0, 30),
      p_city: sanitizeString(city, 80),
      p_tax_id: sanitizeString(taxId, 30) || null,
    });
    if (err) {
      setBusy(false);
      return setError(ACCESS_ERRORS[(err.message ?? '').split(':')[0]] ?? 'No pudimos enviar tu solicitud. Intenta de nuevo.');
    }
    await refreshWholesaler(); // pasa sola a "Tu solicitud está en revisión"
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="max-w-md mx-auto space-y-4" noValidate>
      <h2 className="font-serif text-2xl text-ink">Completa tu solicitud mayorista</h2>
      <p className="text-sm text-black/70">Ingresaste como <b>{session?.user.email}</b>, pero esta cuenta aún no tiene una solicitud mayorista. Cuéntanos de tu negocio; la revisamos en aproximadamente 24 horas.</p>
      <label className="block text-sm">Nombre del negocio
        <input className={fieldInput} value={business} onChange={(e) => setBusiness(e.target.value)} required maxLength={120} autoComplete="organization" />
      </label>
      <label className="block text-sm">WhatsApp
        <input className={fieldInput} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={20} autoComplete="tel" />
      </label>
      <label className="block text-sm">Ciudad
        <input className={fieldInput} value={city} onChange={(e) => setCity(e.target.value)} required maxLength={80} autoComplete="address-level2" />
      </label>
      <label className="block text-sm">Cédula o NIT (opcional)
        <input className={fieldInput} value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={30} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
    </form>
  );
}

export function RecoveryPanel({ onDone }: { onDone: () => void }) {
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
      <input className={fieldInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" aria-label="Nueva contraseña" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primaryBtn}>Guardar contraseña</button>
    </form>
  );
}
