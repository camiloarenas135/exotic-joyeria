import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  /** Contenido de texto (párrafos, listas, CTAs). */
  children: ReactNode;
  /** Imagen o bloque tipográfico del lado visual. */
  media: ReactNode;
  /** Visual a la derecha en escritorio. */
  reverse?: boolean;
  onDark?: boolean;
  /** En móvil el texto va primero y el visual después (por defecto el visual va primero). */
  mediaLast?: boolean;
  /** Proporción del bloque visual. En móvil es bajo para no empujar el texto. */
  mediaClassName?: string;
}

/** Dos columnas visual / texto. El visual va primero en móvil salvo `mediaLast`. */
export default function EditorialSplit({ eyebrow, title, children, media, reverse = false, onDark = false, mediaLast = false, mediaClassName = 'aspect-[16/10] md:aspect-[4/5]' }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-8 md:gap-14 items-center">
      <div className={`relative overflow-hidden ${mediaClassName} ${mediaLast ? 'order-2 md:order-none' : ''} ${reverse ? 'md:order-2' : ''}`}>{media}</div>
      <div className={reverse ? 'md:order-1' : ''}>
        {eyebrow && <p className={`text-xs uppercase tracking-[0.25em] mb-3 ${onDark ? 'text-gold' : 'text-gold-ink'}`}>{eyebrow}</p>}
        <h2 className={`font-serif text-3xl md:text-4xl leading-tight mb-5 ${onDark ? 'text-ivory' : 'text-ink'}`}>{title}</h2>
        <div className={onDark ? 'text-ivory/80' : 'text-black/70'}>{children}</div>
      </div>
    </div>
  );
}
