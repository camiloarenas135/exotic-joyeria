import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Truck } from 'lucide-react';
import { formatCOP } from '../lib/pricing';
import { whatsappLink } from '../lib/config';
import { KIT_DEFAULT_CAP_COP, useKitCatalog } from '../lib/kit';
import { useWholesaleMin } from '../lib/wholesale';
import SectionHeader from '../components/SectionHeader';
import StepsList from '../components/StepsList';
import FaqAccordion, { type FaqItem } from '../components/FaqAccordion';
import Reveal from '../components/Reveal';
import KitBuilder from '../components/KitBuilder';
import LogoMark from '../components/LogoMark';

const STEPS = [
  { title: 'Elige tus piezas', text: 'Escoge del catálogo del kit; cada pieza tiene un precio especial.' },
  { title: 'Cuida el tope', text: 'Tu kit puede llegar hasta el máximo; si te quedas por debajo, no pasa nada.' },
  { title: 'Pídelo por WhatsApp', text: 'Registramos tu pedido y coordinamos el pago y la entrega contigo.' },
  { title: 'Recíbelo en casa', text: 'Lo enviamos con envío asegurado a todo el país. El envío se paga aparte.' },
];

const AUDIENCE = [
  'Quieres iniciar un negocio de joyería en oro laminado.',
  'Quieres aprender a tejer tus propias piezas.',
  'Buscas surtirte con insumos a un precio especial.',
];

const section = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 border border-ink text-ink px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ink hover:text-ivory transition-colors';

export default function Emprendedor() {
  const { catalog } = useKitCatalog();
  const { min, loaded: minLoaded } = useWholesaleMin();
  const cap = formatCOP(catalog?.capCop ?? KIT_DEFAULT_CAP_COP);
  const askKit = whatsappLink('Hola, quiero armar mi Kit Emprendedor. ¿Me ayudan?');

  useEffect(() => {
    document.title = 'Arma tu Kit Emprendedor | Exotic Joyería';
  }, []);

  const faq: FaqItem[] = [
    { q: '¿Cómo funciona el kit?', a: `Tú escoges las piezas que quieras de las que tenemos disponibles para el kit, cada una con un precio especial. El total puede llegar hasta ${cap}; no hay mínimo.` },
    { q: '¿Puedo comprar varias unidades de una pieza?', a: 'Sí, todas las que quieras mientras haya existencias y el total de tu kit no supere el máximo.' },
    { q: '¿El precio especial vale en toda la tienda?', a: 'No, el precio especial aplica solo a las piezas del kit. En el resto del catálogo se mantienen los precios normales.' },
    { q: '¿Cómo lo compro?', a: 'Pulsa “Ver mi kit y pedir”: registramos tu pedido y se abre WhatsApp con el detalle para coordinar contigo el pago y la entrega.' },
    { q: '¿El envío está incluido?', a: 'No. Los envíos nacionales se hacen por Inter Rapidísimo los martes y jueves y tardan de 2 a 4 días hábiles; el costo se coordina por WhatsApp.' },
    { q: '¿Qué garantía tiene el oro laminado?', a: 'El oro laminado tiene 5 años de garantía por cambio o pérdida de color. No cubre rupturas ni rayones.' },
    { q: '¿Puedo comprar al por mayor más adelante?', a: 'Sí. Solicita una cuenta en la zona mayorista; revisamos tu solicitud en aproximadamente 24 horas.' },
  ];

  return (
    <>
      {/* Hero */}
      <section>
        <div className={`${section} grid md:grid-cols-[1.2fr_1fr] gap-10 md:gap-16 items-center`}>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold-ink mb-3">Para emprendedores</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-ink leading-tight mb-4">Arma tu Kit Emprendedor</h1>
            <div className="h-px w-16 bg-gold mb-6" />
            <p className="text-black/70 leading-relaxed mb-6 max-w-lg">
              Escoge las piezas de oro laminado que quieras, con precio especial, hasta <strong data-testid="kit-cap" className="text-ink">{cap}</strong>.
            </p>
            <div id="kit-hero-cta" className="flex flex-col sm:flex-row gap-3 mb-6">
              <a href="#arma-tu-kit" className={primaryBtn}>Elegir mis piezas</a>
              <a href={askKit} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
                <MessageCircle size={16} aria-hidden /> Preguntar por WhatsApp
              </a>
            </div>
            <p className="flex items-center gap-2 text-sm text-black/65">
              <Truck size={18} strokeWidth={1.25} className="text-gold-ink" aria-hidden /> Envío asegurado a todo el país (se paga aparte)
            </p>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden" aria-hidden>
            <div className="absolute inset-0 border border-gold/40 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_35%,#2a2208,#0C0C0C_70%)]">
              <LogoMark className="h-20 md:h-28 w-auto" />
              <p className="text-[11px] uppercase tracking-[0.3em] text-ivory/70">Hasta</p>
              <p className="font-serif text-5xl text-gold">{cap}</p>
              <p className="text-[11px] uppercase tracking-[0.3em] text-ivory/70">en piezas de tu elección</p>
            </div>
          </div>
        </div>
      </section>

      {/* Arma tu kit */}
      <section className="bg-surface">
        <div className={section}>
          <SectionHeader align="center" eyebrow="Precios especiales solo en el kit" title="Arma tu kit" />
          <KitBuilder />
        </div>
      </section>

      {/* Cómo funciona */}
      <section>
        <div className={section}>
          <Reveal>
            <SectionHeader align="center" eyebrow="Del pedido a tus piezas" title="Cómo funciona" />
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
    </>
  );
}
