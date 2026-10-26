import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, Gem, Lock, ArrowRight } from 'lucide-react';
import HeroCarousel from '../components/HeroCarousel';
import ProductGrid from '../components/ProductGrid';
import OurStory from '../components/OurStory';
import Certifications from '../components/Certifications';
import { useCategories } from '../context/CategoriesContext';
import { fetchCatalog } from '../lib/catalog';
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

function useProducts(query: Parameters<typeof fetchCatalog>[0]) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchCatalog(query)
      .then((r) => !cancelled && setProducts(r.products))
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { products, loading };
}

export default function Home() {
  const { categories } = useCategories();
  const promos = useProducts({ promoOnly: true, inStock: true, pageSize: 4, sort: 'price_asc' });
  const news = useProducts({ inStock: true, sort: 'newest', pageSize: 8 });
  const [storyOpen, setStoryOpen] = useState(false);
  const [certsOpen, setCertsOpen] = useState(false);

  useEffect(() => {
    document.title = 'Exotic Joyería | Oro laminado 18k';
  }, []);

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

      {/* Categorías destacadas */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <SectionTitle title="Nuestras colecciones" to="/catalogo" cta="Ver todo el catálogo" />
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link
                  to={`/coleccion/${c.slug}`}
                  className="group relative block aspect-[4/5] overflow-hidden bg-ink"
                >
                  {c.image ? (
                    <img
                      src={c.image}
                      alt=""
                      width={400}
                      height={500}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1a1608] to-[#3a2f0b]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-4 left-4 right-4 font-serif text-lg text-ivory">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Promociones activas */}
      {promos.products.length > 0 && (
        <section className="bg-surface">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <SectionTitle title="Promociones" to="/promociones" cta="Ver todas" />
            <ProductGrid products={promos.products} loading={promos.loading} />
          </div>
        </section>
      )}

      {/* Novedades */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <SectionTitle title="Novedades" to="/catalogo?orden=newest" />
        <ProductGrid products={news.products} loading={news.loading} emptyMessage="Pronto tendremos novedades." />
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
              Regístrate como mayorista, te aprobamos y accedes a precios especiales. Pedido mínimo de $3.500.000.
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
