import type React from 'react';
import { useCallback, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeString, sanitizePhone } from '../lib/sanitize';
import { useChannel } from '../context/ChannelContext';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile';
import { ACCOUNT_TYPE_LABEL, type AccountType } from '../lib/types';
import { useWholesaleMin } from '../lib/wholesale';
import { formatCOP } from '../lib/pricing';

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
  INVALID_ACCOUNT_TYPE: 'Elige un tipo de cuenta válido.',
};

/** Elegir el tipo de cuenta que se solicita. Es solo una petición: el administrador decide el tipo final al aprobar. */
function TypePicker({ value, onChange }: { value: AccountType; onChange: (t: AccountType) => void }) {
  const w = useWholesaleMin('wholesale');
  const e = useWholesaleMin('entrepreneur');
  const opts: { type: AccountType; min: number; loaded: boolean; text: string }[] = [
    { type: 'entrepreneur', min: e.min, loaded: e.loaded, text: 'Estás empezando tu negocio de joyería.' },
    { type: 'wholesale', min: w.min, loaded: w.loaded, text: 'Ya vendes joyería y compras en volumen.' },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm mb-1">Tipo de cuenta</legend>
      {opts.map((o) => (
        <label key={o.type} className={`flex items-start gap-3 border p-3 cursor-pointer min-h-11 ${value === o.type ? 'border-gold-dark bg-white' : 'border-black/20'}`}>
          <input type="radio" name="wa-account-type" className="mt-1" checked={value === o.type} onChange={() => onChange(o.type)} />
          <span className="text-sm">
            <b>{ACCOUNT_TYPE_LABEL[o.type]}</b>
            <span className="block text-black/65">{o.text} Pedido mínimo {o.loaded ? formatCOP(o.min) : ''}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Campo de contraseña con botón para ver u ocultar lo escrito. El botón va fuera del <label> para no ensuciar el nombre accesible del campo. */
function PasswordField({ label, ...input }: { label?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <div className="block text-sm">
      {label && <label htmlFor={input.id}>{label}</label>}
      <div className="relative">
        <input {...input} className={`${fieldInput} pr-11`} type={shown ? 'text' : 'password'} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-black/60 hover:text-ink"
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

type Mode = 'login' | 'register' | 'forgot';

/** Ingresar / Registrarme (3 pasos cortos) / Olvidé mi contraseña. */
export function AuthPanel({ initialMode = 'login', initialType = 'wholesale' }: { initialMode?: Mode; initialType?: AccountType }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [taxId, setTaxId] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0); // el token de Turnstile es de un solo uso: se pide otro tras cada intento
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errField, setErrField] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setCaptcha(t), []);

  /** Muestra el error, lo asocia al campo y mueve el foco allí (o al aviso si es general). */
  const fail = (msg: string, field?: string) => {
    setError(msg);
    setErrField(field ?? null);
    setTimeout(() => document.getElementById(field ? `wa-${field}` : 'wa-error')?.focus(), 0);
  };
  const fieldProps = (name: string) => ({
    id: `wa-${name}`,
    'aria-invalid': errField === name ? (true as const) : undefined,
    'aria-describedby': errField === name ? 'wa-error' : undefined,
  });

  const goStep = (next: number) => {
    setError(null);
    setErrField(null);
    if (next > step) {
      if (step === 1) {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail('Escribe un correo válido.', 'email');
        if (password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.', 'password');
      }
      if (step === 2) {
        if (sanitizeString(business, 120).length < 2) return fail('Escribe el nombre de tu negocio.', 'business');
        if (sanitizeString(city, 80).length < 2) return fail('Escribe tu ciudad.', 'city');
      }
    }
    setStep(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrField(null);
    setInfo(null);
    const mail = email.trim().toLowerCase();
    if (mode === 'register' && step < 3) return goStep(step + 1);
    setBusy(true);
    try {
      if (mode !== 'register' && TURNSTILE_SITE_KEY && !captcha) return fail('Completa la verificación de seguridad.');
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password, options: { captchaToken: captcha ?? undefined } });
        if (err) fail(/captcha/i.test(err.message) ? 'No pudimos validar la verificación de seguridad. Inténtalo de nuevo.' : err.status === 429 ? 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' : /confirm/i.test(err.message) ? 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.' : 'Correo o contraseña incorrectos. Si no la recuerdas, usa “Olvidé mi contraseña”.');
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/mayoristas`, captchaToken: captcha ?? undefined });
        if (err) fail('No pudimos enviar el correo. Intenta de nuevo.');
        else setInfo('Listo. Si ese correo está registrado, te enviamos un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.');
      } else {
        const problem = validateBusiness({ business, city, phone });
        if (problem) return fail(problem);
        if (TURNSTILE_SITE_KEY && !captcha) return fail('Completa la verificación de seguridad.');
        const { data, error: err } = await supabase.auth.signUp({
          email: mail,
          password,
          options: {
            captchaToken: captcha ?? undefined,
            data: {
              signup_type: 'wholesale',
              requested_account_type: accountType,
              business_name: sanitizeString(business, 120),
              phone: sanitizePhone(phone).slice(0, 30),
              city: sanitizeString(city, 80),
              tax_id: sanitizeString(taxId, 30),
            },
          },
        });
        // 0.4: la respuesta es la MISMA exista o no el correo (no se revela qué correos tienen cuenta). Un correo = una sola cuenta (PK user_id + email único de Auth).
        const exists = !!err && /already|registered|exists/i.test(err.message);
        const hidden = !err && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0; // correo ya registrado (Auth lo oculta)
        if (err && !exists) fail('No pudimos crear tu cuenta. Revisa los datos e inténtalo de nuevo.');
        else if (exists || hidden || !data.session) {
          setInfo('Recibimos tu solicitud. Si te llega un correo para confirmar tu dirección, ábrelo; luego ingresa y revisaremos tu cuenta (aproximadamente 24 horas). Te avisaremos por correo y WhatsApp cuando esté aprobada. Si ya tenías una cuenta con este correo, ingresa en la pestaña “Ingresar” o usa “Olvidé mi contraseña”.');
        }
        // con sesión iniciada, la pantalla pasa sola a "Tu solicitud está en revisión"
      }
    } finally {
      setBusy(false);
      setCaptcha(null);
      setCaptchaNonce((n) => n + 1);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setStep(1);
        setError(null);
        setErrField(null);
        setInfo(null);
        setCaptcha(null);
      }}
      aria-pressed={mode === m}
      className={`flex-1 min-h-11 text-[11px] sm:text-xs uppercase tracking-widest border-b-2 ${mode === m ? 'border-gold-dark text-ink font-semibold' : 'border-transparent text-black/65'}`}
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
              <input {...fieldProps('email')} className={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete={mode === 'login' ? 'username' : 'email'} />
            </label>
            {mode !== 'forgot' && (
              <PasswordField label="Contraseña" {...fieldProps('password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} maxLength={72} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            )}
          </>
        )}
        {mode === 'register' && step === 1 && <TypePicker value={accountType} onChange={setAccountType} />}
        {mode === 'register' && step === 2 && (
          <>
            <label className="block text-sm">Nombre del negocio
              <input {...fieldProps('business')} className={fieldInput} value={business} onChange={(e) => setBusiness(e.target.value)} required minLength={2} maxLength={120} autoComplete="organization" />
            </label>
            <label className="block text-sm">Ciudad
              <input {...fieldProps('city')} className={fieldInput} value={city} onChange={(e) => setCity(e.target.value)} required maxLength={80} autoComplete="address-level2" />
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
          </>
        )}
        {(mode !== 'register' || step === 3) && (
          <div key={`${mode}-${captchaNonce}`}>
            <Turnstile onToken={onToken} />
          </div>
        )}
        {error && <p id="wa-error" tabIndex={-1} role="alert" className="text-sm text-red-700 focus:outline-none">{error}</p>}
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
          <button type="button" onClick={() => { setMode('forgot'); setCaptcha(null); }} className="w-full text-sm text-gold-dark underline min-h-11">
            Olvidé mi contraseña
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" onClick={() => { setMode('login'); setCaptcha(null); }} className="w-full text-sm text-gold-dark underline min-h-11">
            Volver a ingresar
          </button>
        )}
      </form>
    </div>
  );
}

/** Cuenta ya existente (con sesión) pero sin solicitud mayorista: crea la solicitud con request_wholesale_access. */
export function RequestAccessForm({ initialType = 'wholesale' }: { initialType?: AccountType }) {
  const { session, refreshWholesaler } = useChannel();
  const [accountType, setAccountType] = useState<AccountType>(initialType);
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
      p_account_type: accountType,
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
      <h2 className="font-serif text-2xl text-ink">Completa tu solicitud</h2>
      <p className="text-sm text-black/70">Ingresaste como <b>{session?.user.email}</b>, pero esta cuenta aún no tiene una solicitud de cuenta de negocio. Cuéntanos de tu negocio; la revisamos en aproximadamente 24 horas.</p>
      <TypePicker value={accountType} onChange={setAccountType} />
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
      <PasswordField label="Nueva contraseña" id="wa-new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primaryBtn}>Guardar contraseña</button>
    </form>
  );
}
