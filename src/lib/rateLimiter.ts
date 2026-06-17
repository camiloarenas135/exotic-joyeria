/**
 * Rate limiter basado en localStorage.
 * Funciona del lado del cliente sin necesidad de servidor.
 * Usa el algoritmo de "ventana deslizante" para contar intentos recientes.
 *
 * Nota: un usuario técnico puede borrar el localStorage, pero esto cubre
 * el abuso casual y los errores de doble clic. La segunda capa de
 * protección está en las políticas RLS de Supabase (servidor).
 */

interface RateLimitEntry {
  timestamps: number[]; // Milisegundos epoch de cada intento
}

/**
 * Verifica si se puede realizar una acción, y si es así, la registra.
 *
 * @param key     Identificador único de la acción (ej: 'vip_register', 'checkout')
 * @param limit   Número máximo de intentos permitidos en la ventana de tiempo
 * @param windowMs Duración de la ventana de tiempo en milisegundos
 * @returns { allowed: boolean; remainingMs: number }
 *          - allowed: true si se puede proceder
 *          - remainingMs: ms restantes hasta que se libere un slot (0 si allowed=true)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remainingMs: number } {
  const storageKey = `rl_${key}`;
  const now = Date.now();

  let entry: RateLimitEntry = { timestamps: [] };

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      entry = JSON.parse(stored) as RateLimitEntry;
    }
  } catch {
    // Si localStorage falla (modo privado estricto), permitir la acción
    return { allowed: true, remainingMs: 0 };
  }

  // Filtrar solo los timestamps dentro de la ventana activa
  const windowStart = now - windowMs;
  const recentAttempts = entry.timestamps.filter((t) => t > windowStart);

  if (recentAttempts.length >= limit) {
    // Calcular cuánto falta para que el intento más antiguo expire
    const oldestInWindow = Math.min(...recentAttempts);
    const remainingMs = oldestInWindow + windowMs - now;
    return { allowed: false, remainingMs: Math.max(0, remainingMs) };
  }

  // Registrar este nuevo intento
  recentAttempts.push(now);
  try {
    localStorage.setItem(storageKey, JSON.stringify({ timestamps: recentAttempts }));
  } catch {
    // Si no se puede guardar, igual permitir la acción
  }

  return { allowed: true, remainingMs: 0 };
}

/**
 * Formatea milisegundos en un string legible (ej: "5 minutos", "45 segundos")
 */
export function formatCooldown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hora${hours !== 1 ? 's' : ''}`;
}
