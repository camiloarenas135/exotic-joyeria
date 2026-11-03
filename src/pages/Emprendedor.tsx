import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Compass, Gem, MessageCircle, Palette, PenTool, ShoppingBag, Store, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatCOP } from '../lib/pricing';
import { whatsappLink } from '../lib/config';
import { KIT_FALLBACK_COP, KIT_INCLUDES, useKit } from '../lib/kit';
import { useWholesaleMin } from '../lib/wholesale';
import SectionHeader from '../components/SectionHeader';
import FeatureCards, { type Feature } from '../components/FeatureCards';
import StepsList from '../components/StepsList';
import FaqAccordion, { type FaqItem } from '../components/FaqAccordion';
import Reveal from '../components/Reveal';
import StickyBuyBar from '../components/StickyBuyBar';
import LogoMark from '../components/LogoMark';

// Un icono por cada elemento de KIT_INCLUDES, en el mismo orden
const INCLUDE_ICONS: LucideIcon[] = [Compass, Store, Palette, PenTool, BadgeCheck, Gem];

const FEATURES: Feature[] = KIT_INCLUDES.map((it, i) => ({ icon: INCLUDE_ICONS[i], title: it.title, text: it.text }));

const STEPS = [
  { title: 'Haz tu pedido', text: 'Añade el kit al carrito o escríbenos por WhatsApp.' },
  { title: 'Coordinamos contigo', text: 'Por WhatsApp acordamos el pago y la entrega.' },
  { title: 'Recíbelo en casa', text: 'Lo enviamos con envío asegurado a todo el país.' },
  { title: 'Empieza a crear', text: 'Con la asesoría, el curso y los insumos para dar el primer paso.' },
];

const AUDIENCE = [
  'Quieres iniciar un negocio de joyería en oro laminado.',
  'Quieres aprender a tejer tus propias piezas.',
  'Buscas una marca propia, con logo y tienda en línea.',
];

const section = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 border border-ink text-ink px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ink hover:text-ivory transition-colors';

export default function Emprendedor() {
  const { addToCart } = useAppContext();
  const { kit } = useKit();
  const { min, loaded: minLoaded } = useWholesaleMin();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    document.title = 'Kit Emprendedor | Exotic Joyería';
  }, []);

  const price = formatCOP(kit?.effectivePriceCop ?? KIT_FALLBACK_COP);
  const canBuy = !!kit && kit.stock > 0;
  const photo = kit?.image && !imgFailed ? kit.image : null;
  const askKit = whatsappLink(`Hola, quiero comprar el Kit Emprendedor (${price}).`);

  const faq: FaqItem[] = [
    { q: '¿Qué incluye el kit?', a: 'Asesoría en oro laminado, asesoría para crear tu página, creación de logo, curso de tejidos, tabla para tejer e insumos en oro laminado: balines, herrajes, neoprenos e hilos.' },
    { q: '¿Cómo lo compro?', a: 'Pulsa el botón “Pedir por WhatsApp”: se abre la conversación con tu pedido del kit y desde ahí coordinamos contigo el pago y la entrega.' },
    { q: '¿Cómo y cuándo lo envían?', a: 'Los envíos nacionales se hacen por Inter Rapidísimo los martes y jueves de cada semana y tardan de 2 a 4 días hábiles.' },
    { q: '¿Qué garantía tiene el oro laminado?', a: 'El oro laminado tiene 5 años de garantía por cambio o pérdida de color. No cubre rupturas ni rayones.' },
    { q: '¿Puedo comprar al por mayor más adelante?', a: 'Sí. Solicita una cuenta en la zona mayorista; revisamos tu solicitud en aproximadamente 24 horas.' },
  ];

  return (
    <>
      {/* Hero */}
      <section>
        <div className={`${section} grid md:grid-cols-2 gap-10 md:gap-16 items-center`}>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold-ink mb-3">Para emprendedores</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-ink leading-tight mb-4">Kit Emprendedor</h1>
            <div className="h-px w-16 bg-gold mb-6" />
            <p className="text-black/70 leading-relaxed mb-6 max-w-lg">
              Empieza tu negocio de joyería en oro laminado con todo lo necesario en un solo paso: asesoría, logo, curso, herramienta e insumos.
            </p>
            <p data-testid="kit-price" className="font-serif text-4xl text-gold-ink mb-6">{price}</p>
            <div id="kit-buy" className="flex flex-col sm:flex-row gap-3 mb-6">
              {canBuy && (
                <button type="button" onClick={() => addToCart(kit!)} className={primaryBtn}>
                  <ShoppingBag size={16} aria-hidden /> Añadir al carrito
                </button>
              )}
              <a href={askKit} target="_blank" rel="noopener noreferrer" className={canBuy ? secondaryBtn : primaryBtn}>
                <MessageCircle size={16} aria-hidden /> Pedir por WhatsApp
              </a>
            </div>
            <p className="flex items-center gap-2 text-sm text-black/65">
              <Truck size={18} strokeWidth={1.25} className="text-gold-ink" aria-hidden /> Envío asegurado a todo el país
            </p>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden">
            {photo ? (
              <img src={photo} alt={kit?.name ?? 'Kit Emprendedor'} loading="eager" decoding="async" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} className="absolute inset-0 size-full object-cover" />
            ) : (
              <div data-testid="kit-fallback" className="absolute inset-0 border border-gold/40 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_50%_35%,#2a2208,#0C0C0C_70%)]">
                <LogoMark className="h-24 md:h-32 w-auto" />
                <p className="text-[11px] uppercase tracking-[0.3em] text-ivory/70">Exotic Joyería</p>
                <p className="font-serif text-2xl text-gold">Kit Emprendedor</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="bg-surface">
        <div className={section}>
          <Reveal>
            <SectionHeader align="center" eyebrow="Todo en un solo paso" title="¿Qué incluye?" />
            <FeatureCards items={FEATURES} />
          </Reveal>
        </div>
      </section>

      {/* Cómo funciona */}
      <section>
        <div className={section}>
          <Reveal>
            <SectionHeader align="center" eyebrow="Del pedido a tu primera pieza" title="Cómo funciona" />
            <StepsList steps={STEPS} />
          </Reveal>
        </div>
      </section>

      {/* Para quién es */}
      <section className="bg-ink text-ivory">
        <div className={section}>
          <Reveal>
            <SectionHeader align="center" onDark eyebrow="Este kit es para ti si" title="¿Para quién es?" />
            <ul className="max-w-5xl mx-auto grid gap-4 md:grid-cols-3">
              {AUDIENCE.map((a) => (
                <li key={a} className="border border-gold/30 p-6 text-ivory/90 leading-relaxed text-center md:text-left">
                  {a}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Preguntas frecuentes */}
      <section>
        <div className={section}>
          <Reveal>
            <SectionHeader align="center" eyebrow="Resolvemos tus dudas" title="Preguntas frecuentes" />
            <FaqAccordion items={faq} />
          </Reveal>
        </div>
      </section>

      {/* Siguiente paso: mayoristas */}
      <section className="bg-surface">
        <div className={section}>
          <Reveal>
            <div className="border border-gold-ink/30 bg-ivory px-6 py-10 md:p-12 grid md:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-gold-ink mb-3">Cuando tu negocio crezca</p>
                <h2 className="font-serif text-2xl md:text-3xl text-ink mb-3">Compra al por mayor con precios especiales</h2>
                <p className="text-black/70 max-w-xl">
                  Solicita tu cuenta mayorista; la revisamos en aproximadamente 24 horas.
                  {minLoaded ? ` El pedido mínimo es de ${formatCOP(min)}.` : ''}
                </p>
              </div>
              <Link to="/mayoristas" className={secondaryBtn}>
                Zona mayorista
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <StickyBuyBar watchId="kit-buy" label="Kit Emprendedor" price={price}>
        {canBuy ? (
          <button type="button" onClick={() => addToCart(kit!)} className={`${primaryBtn} px-5`}>
            <ShoppingBag size={16} aria-hidden /> Añadir
          </button>
        ) : (
          <a href={askKit} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} px-5`}>
            <MessageCircle size={16} aria-hidden /> WhatsApp
          </a>
        )}
      </StickyBuyBar>
    </>
  );
}
