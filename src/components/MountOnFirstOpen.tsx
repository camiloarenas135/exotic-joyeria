import { Suspense, useState, type ReactNode } from 'react';

/**
 * Monta (y descarga, si es un componente `lazy`) su contenido recién cuando `open` es true por primera vez.
 * Después se queda montado, así la animación de cierre del modal sigue funcionando.
 */
export default function MountOnFirstOpen({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen ? <Suspense fallback={null}>{children}</Suspense> : null;
}
