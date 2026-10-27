import LogoMark from './LogoMark';

interface BrandLogoProps {
  /** 'light' = sobre fondo claro (texto tinta); 'dark' = sobre fondo oscuro (texto marfil). */
  tone?: 'light' | 'dark';
  markClassName?: string;
  textClassName?: string;
}

/** Marca: cabeza de tigre vectorial + wordmark real en HTML (no imagen). */
export default function BrandLogo({
  tone = 'light',
  markClassName = 'h-9 md:h-11',
  textClassName = 'text-[17px] md:text-2xl',
}: BrandLogoProps) {
  const color = tone === 'light' ? 'text-ink' : 'text-ivory';
  return (
    <span className="inline-flex items-center gap-2 md:gap-3">
      <LogoMark className={`${markClassName} w-auto shrink-0 transition-[height] duration-300`} />
      <span className={`flex flex-col leading-none font-serif ${color}`}>
        <span className={`${textClassName} font-medium tracking-[0.14em] uppercase`}>Exotic</span>
        <span className="mt-1 text-[8px] md:text-[10px] tracking-[0.42em] uppercase text-gold-dark font-sans font-medium">
          Joyería
        </span>
      </span>
    </span>
  );
}
