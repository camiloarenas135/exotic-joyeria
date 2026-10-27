export interface Step {
  title: string;
  text: string;
}

/** Pasos numerados (<ol>): una columna en móvil, en fila en escritorio. El número es decorativo; el orden lo da la lista. */
export default function StepsList({ steps, onDark = false }: { steps: Step[]; onDark?: boolean }) {
  const cols = steps.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return (
    <ol className={`grid gap-8 md:gap-6 sm:grid-cols-2 ${cols}`}>
      {steps.map((s, i) => (
        <li key={s.title} className="flex sm:flex-col gap-4 sm:gap-3">
          <span aria-hidden className={`font-serif text-4xl leading-none shrink-0 w-12 sm:w-auto ${onDark ? 'text-gold' : 'text-gold-ink'}`}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 className={`font-serif text-lg mb-1 ${onDark ? 'text-ivory' : 'text-ink'}`}>{s.title}</h3>
            <p className={`text-sm leading-relaxed ${onDark ? 'text-ivory/75' : 'text-black/70'}`}>{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
