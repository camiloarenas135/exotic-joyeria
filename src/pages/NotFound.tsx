import { Link } from 'react-router-dom';
import { useEffect } from 'react';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Página no encontrada | Exotic Joyería';
  }, []);
  return (
    <section className="max-w-xl mx-auto px-4 py-24 text-center">
      <p className="text-xs uppercase tracking-widest text-gold-dark mb-3">Error 404</p>
      <h1 className="font-serif text-3xl md:text-4xl text-ink mb-4">No encontramos esta página</h1>
      <p className="text-black/60 mb-8">Puede que la colección ya no exista o que el enlace tenga un error.</p>
      <Link to="/" className="inline-flex items-center justify-center bg-ink text-ivory px-8 min-h-11 text-xs uppercase tracking-widest hover:bg-gold-dark transition-colors">
        Volver al inicio
      </Link>
    </section>
  );
}
