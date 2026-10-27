import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { type HeroSlide } from '../lib/types';
import { resolveLink } from '../lib/bannerLink';
import { useCategories } from '../context/CategoriesContext';

const AUTOPLAY_MS = 6000;

const DEFAULT_SLIDE: HeroSlide = {
  id: 'default',
  image_desktop: '',
  image_mobile: null,
  title: 'Elegancia Atemporal',
  subtitle: 'Descubre nuestra colección de oro laminado de 18k',
  button_label: 'Explorar colección',
  link: '/catalogo',
  link_type: 'catalog',
  link_ref: null,
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
};

function SlideLink({ slide, className, children }: { slide: HeroSlide; className: string; children: React.ReactNode }) {
  const { categories } = useCategories();
  const target = resolveLink(slide, { categories });
  if (!target) return null;
  if (target.kind === 'internal') return <Link to={target.to} className={className}>{children}</Link>;
  return <a href={target.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}

export default function HeroCarousel() {
  const [slides, setSlides] = useState<HeroSlide[]>([DEFAULT_SLIDE]);
  const [idx, setIdx] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('hero_slides')
      .select('id, image_desktop, image_mobile, title, subtitle, button_label, link, link_type, link_ref, sort_order, is_active, starts_at, ends_at')
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data && data.length > 0) setSlides(data as HeroSlide[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = slides.length;
  const autoplay = count > 1 && !hovering && !paused && !reducedMotion;

  useEffect(() => {
    if (!autoplay) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [autoplay, count]);

  const slide = slides[Math.min(idx, count - 1)];

  return (
    <section
      className="relative w-full bg-ink text-ivory overflow-hidden"
      aria-roledescription="carrusel"
      aria-label="Destacados"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="relative h-[60svh] min-h-[380px] max-h-[640px]">
        {slide.image_desktop ? (
          <picture>
            {slide.image_mobile && <source media="(max-width: 767px)" srcSet={slide.image_mobile} />}
            <img
              key={slide.id}
              src={slide.image_desktop}
              alt=""
              width={1600}
              height={640}
              fetchPriority={idx === 0 ? 'high' : 'auto'}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </picture>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-ink via-[#1a1608] to-[#3a2f0b]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-14 sm:pb-20">
          <div className="max-w-xl" aria-live={autoplay ? 'off' : 'polite'}>
            <div className="w-16 h-0.5 bg-gold mb-5" />
            {slide.title && <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight mb-3">{slide.title}</h2>}
            {slide.subtitle && <p className="text-base sm:text-lg text-ivory/85 font-light mb-6">{slide.subtitle}</p>}
            {slide.button_label && (
              <SlideLink
                slide={slide}
                className="inline-flex items-center justify-center bg-gold text-ink px-8 min-h-11 text-xs uppercase tracking-[0.2em] font-semibold hover:bg-ivory transition-colors"
              >
                {slide.button_label}
              </SlideLink>
            )}
          </div>
        </div>

        {count > 1 && (
          <div className="absolute bottom-4 right-4 sm:right-8 flex items-center gap-2">
            <button onClick={() => setIdx((i) => (i - 1 + count) % count)} className="p-3 bg-black/40 hover:bg-black/70" aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setPaused((p) => !p)} className="p-3 bg-black/40 hover:bg-black/70" aria-label={paused ? 'Reanudar' : 'Pausar'}>
              {paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button onClick={() => setIdx((i) => (i + 1) % count)} className="p-3 bg-black/40 hover:bg-black/70" aria-label="Siguiente">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        {count > 1 && (
          <div className="absolute bottom-6 left-4 sm:left-8 flex gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setIdx(i)}
                aria-label={`Ir a la diapositiva ${i + 1}`}
                aria-current={i === idx}
                className={`h-1.5 transition-all ${i === idx ? 'w-8 bg-gold' : 'w-3 bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
