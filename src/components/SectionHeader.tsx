import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface Props {
  title: string;
  /** Texto pequeño sobre el título (dorado oscuro sobre claro; nunca #D4AF37 sobre ivory). */
  eyebrow?: string;
  to?: string;
  cta?: string;
  /** 'center' para bloques de texto centrado (FAQ, Cómo comprar). */
  align?: 'left' | 'center';
  /** Sobre fondo oscuro. */
  onDark?: boolean;
  /** Nivel del encabezado: 2 por defecto (el h1 lo tiene el hero de cada página). */
  as?: 'h1' | 'h2';
  className?: string;
}

/** Cabecera de sección: eyebrow + título serif + hilo dorado + enlace "Ver todo". */
export default function SectionHeader({ title, eyebrow, to, cta, align = 'left', onDark = false, as: Tag = 'h2', className = 'mb-8 md:mb-10' }: Props) {
  const center = align === 'center';
  return (
    <div className={`flex items-end gap-4 ${center ? 'justify-center text-center' : 'justify-between'} ${className}`}>
      <div className={center ? 'flex flex-col items-center' : undefined}>
        {eyebrow && <p className={`text-xs uppercase tracking-[0.25em] mb-2 ${onDark ? 'text-gold' : 'text-gold-ink'}`}>{eyebrow}</p>}
        <Tag className={`font-serif text-2xl md:text-3xl ${onDark ? 'text-ivory' : 'text-ink'}`}>{title}</Tag>
        <div className="h-px w-12 bg-gold mt-3" />
      </div>
      {to && !center && (
        <Link
          to={to}
          className={`group inline-flex items-center gap-2 text-xs uppercase tracking-widest min-h-11 shrink-0 ${onDark ? 'text-gold hover:text-ivory' : 'text-gold-ink hover:text-ink'}`}
        >
          <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat group-hover:bg-[length:100%_1px] transition-[background-size] duration-300 motion-reduce:transition-none pb-0.5">
            {cta ?? 'Ver todo'}
          </span>
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}
