import { useEffect, useState } from 'react';
import { Check, MessageCircle, ShoppingBag } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { fetchCatalog } from '../lib/catalog';
import { formatCOP } from '../lib/pricing';
import { whatsappLink } from '../lib/config';
import type { Product } from '../context/AppContext';

const INCLUDES = [
  'Asesoría en oro laminado',
  'Asesoría para crear tu página',
  'Creación de logo',
  'Curso de tejidos',
  'Tabla para tejer',
  'Insumos en oro laminado: balines, herrajes, neoprenos e hilos',
];

export default function Emprendedor() {
  const { addToCart } = useAppContext();
  const [kit, setKit] = useState<Product | null>(null);

  useEffect(() => {
    document.title = 'Kit Emprendedor | Exotic Joyería';
    fetchCatalog({ search: 'Kit Emprendedor', pageSize: 1 })
      .then((r) => setKit(r.products[0] ?? null))
      .catch(() => undefined);
  }, []);

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <p className="text-xs uppercase tracking-[0.25em] text-gold-dark mb-3">Para emprendedores</p>
      <h1 className="font-serif text-4xl md:text-5xl text-ink mb-4">Kit Emprendedor</h1>
      <p className="font-serif text-3xl text-gold-dark mb-8">{formatCOP(kit?.effectivePriceCop ?? 500_000)}</p>
      <p className="text-black/70 leading-relaxed mb-8 max-w-2xl">
        Empieza tu negocio de joyería en oro laminado con todo lo necesario en un solo paso.
      </p>

      <h2 className="text-xs uppercase tracking-widest font-semibold text-ink mb-4">¿Qué incluye?</h2>
      <ul className="space-y-3 mb-10">
        {INCLUDES.map((item) => (
          <li key={item} className="flex items-start gap-3 text-ink">
            <Check size={18} className="text-gold-dark mt-0.5 shrink-0" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col sm:flex-row gap-3">
        {kit && kit.stock > 0 && (
          <button
            onClick={() => addToCart(kit)}
            className="inline-flex items-center justify-center gap-2 bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-gold-dark transition-colors"
          >
            <ShoppingBag size={16} /> Añadir al carrito
          </button>
        )}
        <a
          href={whatsappLink('Hola, quiero información sobre el Kit Emprendedor.')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 border border-ink text-ink px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ink hover:text-ivory transition-colors"
        >
          <MessageCircle size={16} /> Pedir por WhatsApp
        </a>
      </div>
    </section>
  );
}
