import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, Gem, Lock, ArrowRight } from 'lucide-react';
import CollectionCircles from '../components/CollectionCircles';
import HeroCarousel from '../components/HeroCarousel';
import ProductGrid from '../components/ProductGrid';
import OurStory from '../components/OurStory';
import Certifications from '../components/Certifications';
import { fetchCatalog } from '../lib/catalog';
import { useChannel } from '../context/ChannelContext';
import { useWholesaleMin } from '../lib/wholesale';
import { formatCOP } from '../lib/pricing';
import type { Channel } from '../lib/types';
import type { Product } from '../context/AppContext';

const TRUST = [
  { icon: Truck, title: 'Envío asegurado', text: 'A todo el país' },
  { icon: ShieldCheck, title: 'Garantía', text: 'En cada pieza' },
  { icon: Gem, title: 'Oro laminado 18k', text: 'Acabado de calidad' },
  { icon: Lock, title: 'Pago seguro', text: 'Coordinado por WhatsApp' },
];

function SectionTitle({ title, to, cta }: { title: string; to?: string; cta?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-8">
      <div>
        <h2 className="font-serif text-2xl md:text-3xl text-ink">{title}</h2>
        <div className="h-px w-12 bg-gold mt-3" />
      </div>
      {to && (
        <Link to={to} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-gold-dark hover:text-ink min-h-11">
          {cta ?? 'Ver todo'} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

function useProducts(query: Parameters<typeof fetchCatalog>[0], channel: Channel, enabled = true) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchCatalog(query, channel)
      .then((r) => !cancelled && setProducts(r.products))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
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
          <SectionTitle title="Colecciones" to="/catalogo" cta="Ver todo el catálogo" />
          <CollectionCircles />
        </section>
        <section className="bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <SectionTitle title="Novedades" to="/catalogo?orden=newest" />
            <ProductGrid layout="row" rowLabel="Novedades" fade="surface" products={news.products} loading={news.loading} emptyMessage="Pronto publicaremos productos mayoristas." />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <HeroCarousel />

      {/* Franja de confianza */}
      <section aria-label="Beneficios" className="bg-surface border-y border-black/5">
        <ul className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3">
              <Icon size={26} strokeWidth={1.25} className="text-gold-dark shrink-0" aria-hidden />
              <div>
                <p className="text-xs uppercase tracking-widest font-semibold text-ink">{title}</p>
                <p className="text-xs text-black/60">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Colecciones */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <SectionTitle title="Nuestras colecciones" to="/catalogo" cta="Ver todo el catálogo" />
        <CollectionCircles />
      </section>

      {/* Promociones activas */}
      {promos.products.length > 0 && (
        <section className="bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <SectionTitle title="Promociones" to="/promociones" cta="Ver todas" />
            <ProductGrid layout="row" rowLabel="Promociones" fade="surface" products={promos.products} loading={promos.loading} />
          </div>
        </section>
      )}

      {/* Novedades */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <SectionTitle title="Novedades" to="/catalogo?orden=newest" />
        <ProductGrid layout="row" rowLabel="Novedades" products={news.products} loading={news.loading} emptyMessage="Pronto tendremos novedades." />
      </section>

      {/* Bloque Emprendedor */}
      <section className="bg-ink text-ivory">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold mb-3">Para emprendedores</p>
            <h2 className="font-serif text-3xl md:text-4xl mb-4">Kit Emprendedor</h2>
            <p className="text-ivory/75 font-light leading-relaxed mb-6">
              Todo lo que necesitas para iniciar tu negocio de joyería en oro laminado: asesoría, creación de logo,
              curso de tejidos, tabla para tejer e insumos.
            </p>
            <Link to="/emprendedor" className="inline-flex items-center justify-center bg-gold text-ink px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ivory transition-colors">
              Conocer el kit
            </Link>
          </div>
          <p className="font-serif text-5xl md:text-6xl text-gold md:text-right">$500.000</p>
        </div>
      </section>

      {/* Acceso mayorista */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="border border-black/15 p-8 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h2 className="font-serif text-2xl md:text-3xl text-ink mb-2">¿Compras al por mayor?</h2>
            <p className="text-black/65 max-w-xl">
              Regístrate como mayorista, te aprobamos y accedes a precios especiales.{minLoaded ? ` Pedido mínimo de ${formatCOP(min)}.` : ''}
            </p>
          </div>
          <Link to="/mayoristas" className="inline-flex items-center justify-center bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors shrink-0">
            Zona mayorista
          </Link>
        </div>
      </section>

      {/* Historia y certificaciones */}
      <section className="bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h2 className="font-serif text-2xl md:text-3xl text-ink mb-3">Una marca con historia</h2>
          <p className="text-black/65 max-w-2xl mx-auto mb-6">
            Conoce quiénes somos y las certificaciones que respaldan la calidad de cada pieza.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => setStoryOpen(true)} className="border border-ink px-8 min-h-11 text-xs uppercase tracking-widest hover:bg-ink hover:text-ivory transition-colors">
              Nuestra historia
            </button>
            <button onClick={() => setCertsOpen(true)} className="border border-ink px-8 min-h-11 text-xs uppercase tracking-widest hover:bg-ink hover:text-ivory transition-colors">
              Certificaciones
            </button>
          </div>
        </div>
      </section>

      <OurStory isOpen={storyOpen} onClose={() => setStoryOpen(false)} />
      <Certifications isOpen={certsOpen} onClose={() => setCertsOpen(false)} />
    </>
  );
}
