import { lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, Gem, Lock, Check, MessageCircle } from 'lucide-react';
import CollectionCircles from '../components/CollectionCircles';
import HeroCarousel from '../components/HeroCarousel';
import ProductGrid from '../components/ProductGrid';
const OurStory = lazy(() => import('../components/OurStory'));
const Certifications = lazy(() => import('../components/Certifications'));
import MountOnFirstOpen from '../components/MountOnFirstOpen';
import SectionHeader from '../components/SectionHeader';
import TrustBar, { type TrustItem } from '../components/TrustBar';
import Reveal from '../components/Reveal';
import EditorialSplit from '../components/EditorialSplit';
import StepsList from '../components/StepsList';
import FaqAccordion, { type FaqItem } from '../components/FaqAccordion';
import LogoMark from '../components/LogoMark';
import { fetchCatalog } from '../lib/catalog';
import { whatsappLink } from '../lib/config';
import { useKitCatalog, KIT_DEFAULT_CAP_COP } from '../lib/kit';
import { useChannel } from '../context/ChannelContext';
import { useWholesaleMin } from '../lib/wholesale';
import { formatCOP } from '../lib/pricing';
import type { Channel } from '../lib/types';
import type { Product } from '../context/AppContext';

// Solo afirmaciones que el sitio ya publica (franja superior, modales de garantía y envíos)
const TRUST: TrustItem[] = [
  { icon: Truck, title: 'Envío asegurado', text: 'A todo el país' },
  { icon: ShieldCheck, title: 'Garantía', text: 'En cada pieza' },
  { icon: Gem, title: 'Oro laminado 18k', text: 'Acabado de calidad' },
  { icon: Lock, title: 'Pago seguro', text: 'Coordinado por WhatsApp' },
];

const BUY_STEPS = [
  { title: 'Elige tus piezas', text: 'Recorre las colecciones y añade al carrito lo que te guste.' },
  { title: 'Confirma por WhatsApp', text: 'Tu pedido llega a nuestro chat y coordinamos contigo el pago y la entrega.' },
  { title: 'Recíbelo en casa', text: 'Enviamos con envío asegurado a todo el país.' },
];

const KIT_HIGHLIGHTS = ['Tú escoges las piezas', 'Precios especiales solo en el kit', 'Sin mínimo: llega hasta el tope'];

const section = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20';

function useProducts(query: Parameters<typeof fetchCatalog>[0], channel: Channel, enabled = true) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let last = 0;
    const load = () => {
      last = Date.now();
      fetchCatalog(query, channel)
        .then((r) => !cancelled && setProducts(r.products))
        .catch(() => undefined)
        .finally(() => !cancelled && setLoading(false));
    };
    load();
    // Al volver a la pestaña (p. ej. en el celular) se actualiza si pasó más de 1 minuto
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 60_000) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channel]);
  return { products, loading };
}

export default function Home() {
  const { channel, resolving, wholesaler } = useChannel();
  const wholesale = channel === 'wholesale';
  const { min, loaded: minLoaded } = useWholesaleMin();
  // Promociones solo en el detal. Se espera a saber el canal para no pedir precios del canal equivocado.
  const promos = useProducts({ promoOnly: true, inStock: true, pageSize: 4, sort: 'price_asc' }, channel, !resolving && !wholesale);
  const news = useProducts({ inStock: true, sort: 'newest', pageSize: 8 }, channel, !resolving);
  const { catalog: kitCatalog } = useKitCatalog(!resolving && !wholesale);
  const [storyOpen, setStoryOpen] = useState(false);
  const [certsOpen, setCertsOpen] = useState(false);

  useEffect(() => {
    document.title = 'Exotic Joyería | Oro laminado 18k';
  }, []);

  if (wholesale) {
    return (
      <>
        <section className="bg-ink text-ivory">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <p className="text-xs uppercase tracking-[0.25em] text-gold mb-3">Tienda mayorista</p>
            <h1 className="font-serif text-3xl md:text-4xl mb-3">Hola{wholesaler?.business_name ? `, ${wholesaler.business_name}` : ''}</h1>
            <p className="text-ivory/75 font-light max-w-2xl">
              Estos son tus precios mayoristas. El pedido mínimo es de <b className="text-gold">{minLoaded ? formatCOP(min) : 'un valor mínimo'}</b> en un solo pedido; el total lo valida el servidor.
            </p>
          </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <SectionHeader title="Colecciones" to="/catalogo" cta="Ver todo el catálogo" />
          <CollectionCircles />
        </section>
        <section className="bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <SectionHeader title="Novedades" to="/catalogo?orden=newest" />
            <ProductGrid layout="row" rowLabel="Novedades" fade="surface" products={news.products} loading={news.loading} emptyMessage="Pronto publicaremos productos mayoristas." />
          </div>
        </section>
      </>
    );
  }

  const hasPromos = promos.products.length > 0;
  const kitCap = formatCOP(kitCatalog?.capCop ?? KIT_DEFAULT_CAP_COP);
  // Foto editorial: una pieza real del catálogo; sin foto, un bloque tipográfico
  const editorialImg = news.products.find((p) => p.image)?.image;

  const faq: FaqItem[] = [
    {
      q: '¿Cómo hago mi pedido?',
      a: 'Añade tus piezas al carrito y envía el pedido. Llega a nuestro WhatsApp y desde ahí coordinamos contigo el pago y la entrega.',
    },
    {
      q: '¿Cómo y cuándo envían?',
      a: 'Los envíos nacionales se hacen por Inter Rapidísimo los martes y jueves de cada semana y tardan de 2 a 4 días hábiles.',
    },
    {
      q: '¿Qué garantía tienen las piezas?',
      a: 'El oro laminado tiene 5 años de garantía por cambio o pérdida de color. No cubre rupturas ni rayones.',
    },
    {
      q: '¿Hacen devolución de dinero?',
      a: 'No realizamos devolución de dinero. Por temas de garantía se entrega el mismo accesorio u otros por el mismo valor.',
    },
    {
      q: '¿Cómo compro al por mayor?',
      a: (
        <>
          Solicita tu cuenta en la{' '}
          <Link to="/mayoristas" className="text-gold-ink underline underline-offset-2">zona mayorista</Link>. Revisamos tu solicitud en aproximadamente 24 horas
          {minLoaded ? ` y el pedido mínimo es de ${formatCOP(min)}.` : '.'}
        </>
      ),
    },
  ];

  return (
    <>
      <h1 className="sr-only">Exotic Joyería, joyería en oro laminado 18k</h1>
      <HeroCarousel />

      {/* Colecciones + burbuja de promociones */}
      <section className={section}>
        <Reveal>
          <SectionHeader eyebrow="Explora" title="Nuestras colecciones" to="/catalogo" cta="Ver todo" />
          <CollectionCircles />
        </Reveal>
      </section>

      <TrustBar items={TRUST} />

      {/* Novedades */}
      <section className={section}>
        <Reveal>
          <SectionHeader eyebrow="Recién llegado" title="Novedades" to="/catalogo?orden=newest" />
          <ProductGrid layout="row" rowLabel="Novedades" products={news.products} loading={news.loading} emptyMessage="Pronto tendremos novedades." />
        </Reveal>
      </section>

      {/* Promociones activas */}
      {hasPromos && (
        <section className="bg-surface">
          <div className={section}>
            <Reveal>
              <SectionHeader eyebrow="Por tiempo limitado" title="Promociones" to="/promociones" cta="Ver todas" />
              <ProductGrid layout="row" rowLabel="Promociones" fade="surface" products={promos.products} loading={promos.loading} />
            </Reveal>
          </div>
        </section>
      )}

      {/* Editorial: calidad (afirmaciones del modal de garantía) */}
      <section className={hasPromos ? '' : 'bg-surface'}>
        <div className={section}>
          <Reveal>
            <EditorialSplit
              eyebrow="Nuestra calidad"
              mediaClassName="aspect-[16/10] md:aspect-square"
              title="Oro laminado 18k, hecho para durar"
              media={
                editorialImg ? (
                  <img src={editorialImg} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div data-testid="editorial-fallback" className="absolute inset-0 bg-ink flex flex-col items-center justify-center gap-4 border border-gold/40">
                    <LogoMark className="h-24 w-auto" />
                    <span className="font-serif text-3xl text-gold tracking-widest">18K</span>
                  </div>
                )
              }
            >
              <p className="leading-relaxed mb-4">
                Chapado en 18 kilates con más de 5 micras de oro. Cada pieza tiene 5 años de garantía por cambio o pérdida de color.
              </p>
              <p className="leading-relaxed mb-8">Conoce quiénes somos y las certificaciones que respaldan la calidad de lo que usas.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setStoryOpen(true)} className="inline-flex items-center justify-center bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors">
                  Nuestra historia
                </button>
                <button onClick={() => setCertsOpen(true)} className="inline-flex items-center justify-center px-4 min-h-11 text-xs uppercase tracking-[0.2em] text-gold-ink hover:text-ink underline underline-offset-4">
                  Certificaciones
                </button>
              </div>
            </EditorialSplit>
          </Reveal>
        </div>
      </section>

      {/* Kit Emprendedor */}
      <section className="bg-ink text-ivory">
        <div className={section}>
          <Reveal>
            <EditorialSplit
              onDark
              reverse
              eyebrow="Para emprendedores"
              title="Empieza tu propia marca de joyería"
              mediaClassName="aspect-[16/10] md:aspect-[5/4]"
              media={
                <div className="absolute inset-0 border border-gold/40 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_35%,#2a2208,#0C0C0C_70%)]">
                  <LogoMark className="h-16 md:h-24 w-auto opacity-90" />
                  <p className="text-[11px] uppercase tracking-[0.3em] text-ivory/70">Kit Emprendedor · hasta</p>
                  <p className="font-serif text-4xl md:text-5xl text-gold">{kitCap}</p>
                </div>
              }
            >
              <p className="font-light leading-relaxed mb-5">
                Arma tu kit con las piezas de oro laminado que quieras, a precio especial, para iniciar tu negocio de joyería.
              </p>
              <ul className="space-y-2 mb-8">
                {KIT_HIGHLIGHTS.map((h) => (
                  <li key={h} className="flex items-start gap-3 text-sm">
                    <Check size={18} className="text-gold mt-0.5 shrink-0" aria-hidden />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <Link to="/emprendedor" className="inline-flex items-center justify-center bg-gold text-ink px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ivory transition-colors">
                Armar mi kit
              </Link>
            </EditorialSplit>
          </Reveal>
        </div>
      </section>

      {/* Mayorista (el mínimo viene del servidor) */}
      <section className={section}>
        <Reveal>
          <EditorialSplit
            eyebrow="Para negocios"
            mediaLast
            title="Compra al por mayor con precios especiales"
            mediaClassName="min-h-[180px] md:min-h-[300px] md:aspect-auto"
            media={
              <div className="absolute inset-0 border border-black/15 bg-ivory flex flex-col items-center justify-center text-center p-6 gap-2">
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/65">Pedido mínimo</p>
                {minLoaded ? (
                  <p data-testid="home-wholesale-min" className="font-serif text-4xl md:text-5xl text-gold-ink">{formatCOP(min)}</p>
                ) : (
                  <p className="font-serif text-xl text-ink">Consúltalo en la zona mayorista</p>
                )}
                <div className="h-px w-12 bg-gold my-1" />
                <p className="text-sm text-black/70">Aprobación en aproximadamente 24 horas</p>
              </div>
            }
          >
            <p className="leading-relaxed mb-6">
              Regístrate como mayorista, te aprobamos y accedes a la misma tienda con precios especiales para tu negocio.
            </p>
            <Link to="/mayoristas" className="inline-flex items-center justify-center bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors">
              Zona mayorista
            </Link>
          </EditorialSplit>
        </Reveal>
      </section>

      {/* Cómo comprar */}
      <section className="bg-surface">
        <div className={section}>
          <Reveal>
            <SectionHeader align="center" eyebrow="Fácil y seguro" title="Cómo comprar" />
            <StepsList steps={BUY_STEPS} />
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

      {/* Lista de difusión por WhatsApp (el registro VIP de la tienda sigue siendo el modal existente) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 md:pb-20">
        <Reveal>
          <div className="bg-surface border border-gold-ink/30 px-6 py-10 md:py-14 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-gold-ink mb-3">Lista de difusión</p>
            <h2 className="font-serif text-2xl md:text-3xl text-ink mb-3">Entérate primero de lo nuevo</h2>
            <p className="text-black/70 max-w-xl mx-auto mb-6">Únete a nuestra lista de difusión por WhatsApp y recibe novedades y promociones de Exotic Joyería.</p>
            <a
              href={whatsappLink('Hola, quiero unirme a la lista de difusión de Exotic Joyería')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-ink text-ivory px-6 min-h-11 text-xs uppercase tracking-[0.15em] whitespace-nowrap font-semibold hover:bg-gold-dark transition-colors"
            >
              <MessageCircle size={16} aria-hidden /> Unirme por WhatsApp
            </a>
          </div>
        </Reveal>
      </section>

      <MountOnFirstOpen open={storyOpen}><OurStory isOpen={storyOpen} onClose={() => setStoryOpen(false)} /></MountOnFirstOpen>
      <MountOnFirstOpen open={certsOpen}><Certifications isOpen={certsOpen} onClose={() => setCertsOpen(false)} /></MountOnFirstOpen>
    </>
  );
}
