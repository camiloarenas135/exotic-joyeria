import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BadgeCheck, ClipboardList, Lock, MessageCircle, PackageCheck, Truck, UserCheck } from 'lucide-react';
import { useChannel } from '../context/ChannelContext';
import { fetchCatalog } from '../lib/catalog';
import { useWholesaleMin } from '../lib/wholesale';
import { formatCOP } from '../lib/pricing';
import { whatsappLink } from '../lib/config';
import { primaryBtn } from '../components/WholesaleAuth';

const linkBtn = 'inline-flex items-center justify-center min-h-11 px-8 text-xs uppercase tracking-[0.2em] font-semibold transition-colors';

const BENEFITS = [
  { icon: BadgeCheck, title: 'Precio mayorista único', text: 'Un solo precio por pieza, sin escalas ni letra pequeña. Ves el detal tachado y cuánto ahorras.' },
  { icon: PackageCheck, title: 'El mismo catálogo', text: 'Colecciones de oro laminado 18k con los mismos filtros y orden de la tienda, pero con tus precios.' },
  { icon: MessageCircle, title: 'Pedido por WhatsApp', text: 'Armas tu pedido en pantalla y lo envías por WhatsApp; coordinamos pago y envío contigo.' },
  { icon: Truck, title: 'Envío asegurado', text: 'Enviamos a todo el país con el cuidado que merece cada pieza.' },
];

const STEPS = [
  { icon: ClipboardList, title: 'Solicita tu acceso', text: 'Crea tu cuenta con los datos de tu negocio. Toma menos de dos minutos.' },
  { icon: UserCheck, title: 'Te aprobamos', text: 'Revisamos tu solicitud y te avisamos por correo. La aprobación toma aproximadamente 24 horas.' },
  { icon: MessageCircle, title: 'Haz tu pedido', text: 'Ingresas, eliges cantidades por variante y envías tu pedido por WhatsApp.' },
];

const FAQ = [
  { q: '¿Quién puede comprar al por mayor?', a: 'Cualquier negocio o emprendedor que quiera revender joyería. Debes solicitar acceso y esperar la aprobación.' },
  { q: '¿Cuánto tarda la aprobación?', a: 'Aproximadamente 24 horas. Cuando tu cuenta esté aprobada te enviamos un correo para que ingreses.' },
  { q: '¿Hay descuentos por cantidad?', a: 'No. Manejamos un precio mayorista único por pieza: lo que ves es lo que pagas, sin escalas.' },
  { q: '¿Puedo ver los precios sin cuenta?', a: 'No. Los precios mayoristas solo se muestran a cuentas aprobadas; por eso la vista previa está bloqueada.' },
  { q: '¿Cómo pago y cómo recibo mi pedido?', a: 'Envías tu pedido por WhatsApp y allí coordinamos el pago y el envío contigo.' },
];

interface Preview {
  id: string;
  name: string;
  image: string;
}

/** Vista previa BLOQUEADA: solo foto y nombre (del catálogo público); nunca se pintan precios. */
function LockedPreview() {
  const [items, setItems] = useState<Preview[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCatalog({ inStock: true, sort: 'newest', pageSize: 6 })
      .then((r) => !cancelled && setItems(r.products.map((p) => ({ id: p.id, name: p.name, image: p.image }))))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="preview-title" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h2 id="preview-title" className="font-serif text-2xl md:text-3xl text-ink mb-2">Así se ve el catálogo</h2>
      <p className="text-black/65 mb-8">Una muestra de nuestras piezas. Los precios mayoristas se muestran solo a cuentas aprobadas.</p>
      <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="locked-preview">
        {items.map((p) => (
          <li key={p.id} className="flex flex-col">
            <div className="relative aspect-[4/5] bg-surface overflow-hidden mb-2">
              {p.image && <img src={p.image} alt={p.name} width={240} height={300} loading="lazy" className="size-full object-cover" referrerPolicy="no-referrer" />}
              <span className="absolute inset-x-0 bottom-0 bg-ink/80 text-ivory text-[11px] flex items-center justify-center gap-1.5 py-1.5 px-2 text-center">
                <Lock size={12} aria-hidden /> Inicia sesión para ver el precio
              </span>
            </div>
            <h3 className="font-serif text-sm text-ink line-clamp-2">{p.name}</h3>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Estado de la solicitud del usuario con sesión (pendiente, rechazada, suspendida o sin solicitud). */
function StatusPanel() {
  const { session, wholesaler, refreshWholesaler, signOut } = useChannel();
  const [checked, setChecked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!session) return null;

  const wrap = 'max-w-md mx-auto text-center space-y-4 border border-black/10 bg-white p-6 mb-10';

  if (!wholesaler) {
    return (
      <div className={wrap} data-testid="status-none">
        <h2 className="font-serif text-2xl">Esta cuenta aún no es mayorista</h2>
        <p className="text-black/70">Ingresaste como <b>{session.user.email}</b>. Completa tu solicitud para pedir acceso a los precios mayoristas.</p>
        <Link to="/mayoristas/acceso" className={`${primaryBtn} flex items-center justify-center`}>Completar mi solicitud</Link>
        <button onClick={() => void signOut()} className="text-sm underline text-gold-dark min-h-11">Cerrar sesión</button>
      </div>
    );
  }
  if (wholesaler.status === 'pending') {
    return (
      <div className={wrap} data-testid="status-pending">
        <h2 className="font-serif text-2xl">Tu solicitud está en revisión</h2>
        <p className="text-black/70">Recibimos tu solicitud. La aprobación toma aproximadamente 24 horas; cuando el administrador la apruebe te enviaremos un correo para que puedas ingresar y ver los precios mayoristas.</p>
        <ol className="text-left text-sm text-black/70 space-y-2 border border-black/10 p-4">
          <li>✓ Cuenta creada con <b>{wholesaler.email}</b></li>
          <li>⏳ En revisión por el administrador</li>
          <li className="text-black/40">○ Aprobada: recibes un correo y accedes a tus precios</li>
        </ol>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await refreshWholesaler();
            setBusy(false);
            setChecked('Revisamos tu estado: tu solicitud sigue en revisión.');
          }}
          className={primaryBtn}
        >
          Revisar estado de mi solicitud
        </button>
        {checked && <p role="status" className="text-sm text-black/70">{checked}</p>}
        <button onClick={() => void signOut()} className="text-sm underline text-gold-dark min-h-11">Cerrar sesión</button>
      </div>
    );
  }
  return (
    <div className={wrap} data-testid="status-closed">
      <h2 className="font-serif text-2xl">{wholesaler.status === 'suspended' ? 'Tu acceso está suspendido' : 'No pudimos habilitar tu acceso'}</h2>
      <p className="text-black/70">{wholesaler.status === 'suspended' ? 'Tu cuenta mayorista está suspendida temporalmente.' : 'Por ahora tu solicitud no fue aprobada.'} Escríbenos por WhatsApp y con gusto revisamos tu caso.</p>
      <a href={whatsappLink('Hola, quiero consultar el estado de mi cuenta mayorista.')} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} flex items-center justify-center`}>Escribir por WhatsApp</a>
      <button onClick={() => void signOut()} className="text-sm underline text-gold-dark min-h-11">Cerrar sesión</button>
    </div>
  );
}

/**
 * /mayoristas: landing pública (sin precios). Con la cuenta aprobada se vuelve la misma tienda, así que redirige al inicio.
 */
export default function Mayoristas() {
  const { channel, session, resolving, recovery } = useChannel();
  const { min, loaded } = useWholesaleMin();

  useEffect(() => {
    document.title = 'Zona mayorista | Exotic Joyería';
  }, []);

  if (recovery) return <Navigate to="/mayoristas/acceso" replace />;
  if (!resolving && channel === 'wholesale') return <Navigate to="/" replace />;

  return (
    <>
      <section className="bg-ink text-ivory">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs uppercase tracking-[0.25em] text-gold mb-4">Zona mayorista</p>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl leading-tight mb-5 max-w-3xl">Precios para mayoristas</h1>
          <p className="text-ivory/80 font-light text-lg max-w-2xl mb-8">
            Joyería en oro laminado 18k para revender, con precio mayorista único por pieza y pedido directo por WhatsApp.
          </p>
          {!session && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/mayoristas/acceso?tab=registro" className={`${linkBtn} bg-gold text-ink hover:bg-ivory`}>Solicitar acceso</Link>
              <Link to="/mayoristas/acceso" className={`${linkBtn} border border-ivory/60 text-ivory hover:bg-ivory hover:text-ink`}>Ya tengo cuenta</Link>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        {!resolving && <StatusPanel />}
      </div>

      <section aria-labelledby="benefits-title" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 id="benefits-title" className="font-serif text-2xl md:text-3xl text-ink mb-8">Por qué comprar al por mayor con nosotros</h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="border border-black/10 p-5 bg-white">
              <Icon size={28} strokeWidth={1.25} className="text-gold-dark mb-3" aria-hidden />
              <h3 className="font-serif text-lg text-ink mb-1">{title}</h3>
              <p className="text-sm text-black/65 leading-relaxed">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title" className="bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 id="steps-title" className="font-serif text-2xl md:text-3xl text-ink mb-8">Cómo funciona</h2>
          <ol className="grid md:grid-cols-3 gap-6">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4">
                <span className="shrink-0 size-12 rounded-full border border-gold-dark text-gold-dark flex items-center justify-center font-serif text-xl" aria-hidden>{i + 1}</span>
                <div>
                  <h3 className="font-serif text-lg text-ink flex items-center gap-2"><Icon size={18} className="text-gold-dark" aria-hidden /> {title}</h3>
                  <p className="text-sm text-black/65 leading-relaxed mt-1">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 border border-gold/50 bg-ivory p-5 max-w-2xl">
            <p className="text-ink" data-testid="min-order-text">
              Pedido mínimo: <b>{loaded ? formatCOP(min) : 'consúltalo al ingresar'}</b> en un solo pedido.
            </p>
            <p className="text-sm text-black/65 mt-1" data-testid="approval-note">La aprobación de tu cuenta toma aproximadamente 24 horas.</p>
          </div>
        </div>
      </section>

      <LockedPreview />

      <section aria-labelledby="faq-title" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 id="faq-title" className="font-serif text-2xl md:text-3xl text-ink mb-6">Preguntas frecuentes</h2>
        <div className="divide-y divide-black/10 border-y border-black/10">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="cursor-pointer min-h-11 flex items-center justify-between gap-4 py-2 text-ink font-medium list-none [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-gold-dark transition-transform group-open:rotate-45 text-xl leading-none">+</span>
              </summary>
              <p className="pb-4 text-sm text-black/70 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {!session && (
        <section className="bg-ink text-ivory">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
            <h2 className="font-serif text-2xl md:text-3xl mb-4">¿Listo para comprar al por mayor?</h2>
            <Link to="/mayoristas/acceso?tab=registro" className={`${linkBtn} bg-gold text-ink hover:bg-ivory`}>Solicitar acceso</Link>
          </div>
        </section>
      )}
    </>
  );
}
