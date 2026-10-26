/** Colombia no tiene horario de verano: siempre UTC-5. */
const OFFSET_MS = -5 * 60 * 60 * 1000;

/** ISO (UTC) -> valor para <input type="datetime-local"> en hora de Colombia. */
export function toColombiaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return d.toISOString().slice(0, 16);
}

/** Valor de <input type="datetime-local"> (hora de Colombia) -> ISO con offset -05:00. */
export function fromColombiaInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return new Date(`${value}:00-05:00`).toISOString();
}

export function formatColombia(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(iso));
}

export type WindowState = 'active' | 'upcoming' | 'expired';

export function windowState(starts: string | null, ends: string | null, now = Date.now()): WindowState {
  if (starts && new Date(starts).getTime() > now) return 'upcoming';
  if (ends && new Date(ends).getTime() <= now) return 'expired';
  return 'active';
}
