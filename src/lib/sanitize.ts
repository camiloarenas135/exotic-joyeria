/**
 * Utility functions to sanitize user inputs and prevent XSS or DB injection issues.
 */

/**
 * Sanitizes a string by trimming it and removing HTML tags.
 */
export function sanitizeString(str: string, maxLength = 200): string {
  if (!str) return '';
  return str
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>]/g, '')    // Remove angle brackets
    .slice(0, maxLength);    // Prevent oversized payloads
}

/**
 * Sanitizes and parses a number input, ensuring it is a non-negative integer.
 */
export function sanitizeNumber(val: any, fallback = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = parseInt(String(val), 10);
  return isNaN(num) ? fallback : Math.max(0, num);
}

/**
 * Sanitizes a phone number to only keep digits, spaces, plus sign, and dashes.
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return '';
  return phone.trim().replace(/[^0-9+\s-]/g, '');
}

/**
 * Sanitizes a price string by trimming it and removing unsafe HTML tags.
 */
export function sanitizePrice(price: string): string {
  return sanitizeString(price);
}

/**
 * Enforces Title Case for all words in a string (first letter uppercase, rest lowercase).
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Reads a value from localStorage, re-sanitizes it (defense-in-depth against
 * DevTools tampering), and checks an optional expiry timestamp.
 *
 * Storage format: JSON { value: string, expires: number (epoch ms) }
 * Falls back to plain string for backwards compatibility.
 *
 * @param key        localStorage key
 * @param maxLength  Maximum allowed length for the stored value
 * @returns          Sanitized string, or null if missing / expired / invalid
 */
export function readSafeLocalStorage(key: string, maxLength = 200): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    // Try parsing as JSON (new format with expiry)
    let value: string = raw;
    try {
      const parsed = JSON.parse(raw) as { value: string; expires?: number };
      if (parsed && typeof parsed.value === 'string') {
        // Check expiry
        if (parsed.expires && Date.now() > parsed.expires) {
          localStorage.removeItem(key);
          return null;
        }
        value = parsed.value;
      }
    } catch {
      // Legacy plain string — use as-is
      value = raw;
    }

    const sanitized = sanitizeString(value, maxLength);
    return sanitized.length > 0 ? sanitized : null;
  } catch {
    return null;
  }
}

/**
 * Writes a value to localStorage with an expiry date.
 *
 * @param key      localStorage key
 * @param value    Value to store (will be sanitized before storing)
 * @param ttlMs    Time-to-live in milliseconds (default: 30 days)
 */
export function writeSafeLocalStorage(key: string, value: string, ttlMs = 30 * 24 * 60 * 60 * 1000): void {
  try {
    const sanitized = sanitizeString(value, 200);
    if (!sanitized) return;
    const entry = { value: sanitized, expires: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage might be unavailable (private mode, quota exceeded)
  }
}


/**
 * Limpia los items del carrito antes de guardarlos en la base de datos.
 * Solo conserva los campos necesarios y descarta datos sensibles o innecesarios
 * como URLs de imágenes, stock, y otros metadatos del cliente.
 */
export interface SafeOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: string;
  selectedVariant?: { name: string; price: string };
}

export function sanitizeOrderItems(cartItems: any[]): SafeOrderItem[] {
  return cartItems.map((item) => ({
    id: String(item.id || '').slice(0, 100),
    name: sanitizeString(String(item.name || ''), 100),
    quantity: Math.max(1, Math.min(99, parseInt(item.quantity, 10) || 1)),
    price: sanitizeString(String(item.selectedVariant?.price || item.price || ''), 30),
    ...(item.selectedVariant ? {
      selectedVariant: {
        name: sanitizeString(String(item.selectedVariant.name || ''), 50),
        price: sanitizeString(String(item.selectedVariant.price || ''), 30),
      }
    } : {}),
  }));
}

/**
 * Valida y capea el total de un pedido.
 * Previene que un cliente manipule el precio en el navegador.
 * Máximo: 10.000.000 COP (ajustar si vendes piezas más costosas).
 */
const MAX_ORDER_AMOUNT = 10_000_000;

export function sanitizeTotalAmount(amount: number): number {
  if (!isFinite(amount) || isNaN(amount) || amount < 0) return 0;
  return Math.min(Math.round(amount), MAX_ORDER_AMOUNT);
}
