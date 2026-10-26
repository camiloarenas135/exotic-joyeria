/**
 * Helper único de precios. El servidor (create_order / catalog_retail) es la fuente de verdad;
 * estas funciones solo formatean y replican el redondeo para mostrar en pantalla.
 */
const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCOP(value: number | null | undefined): string {
  return copFormatter.format(Math.max(0, Math.round(value ?? 0)));
}

/** Convierte un texto heredado ("$1.200.000") a pesos enteros. Solo para datos viejos. */
export function parseCOP(text: string | number | null | undefined): number {
  if (typeof text === 'number') return Math.max(0, Math.round(text));
  const digits = String(text ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export type PromoKind = 'percent' | 'fixed';

/** Mismo redondeo que public.apply_discount en la base de datos. */
export function applyDiscount(base: number, kind: PromoKind | null | undefined, value: number | null | undefined): number {
  if (!kind || !value) return base;
  if (kind === 'percent') return base - Math.floor((base * value) / 100);
  return Math.max(base - value, 0);
}

/** Etiqueta "-20 %" calculada contra el precio base. */
export function discountLabel(base: number, final: number): string {
  if (base <= 0 || final >= base) return '';
  return `−${Math.round(((base - final) / base) * 100)} %`;
}

export const WHOLESALE_MIN_FALLBACK = 3_500_000;

export const ORDER_ERROR_MESSAGES: Record<string, string> = {
  INVALID_NAME: 'Escribe tu nombre completo.',
  INVALID_PHONE: 'El número de WhatsApp no es válido.',
  INVALID_LINES: 'Tu carrito está vacío o es demasiado grande.',
  INVALID_QTY: 'Hay una cantidad no válida en el carrito.',
  PRODUCT_NOT_FOUND: 'Un producto del carrito ya no existe.',
  OUT_OF_STOCK: 'No hay stock suficiente de un producto',
  VARIANT_NOT_FOUND: 'Una variante del carrito ya no existe en',
  NO_PRICE: 'Un producto no tiene precio disponible',
  NOT_WHOLESALER: 'Tu cuenta mayorista aún no está aprobada.',
  NOT_IN_CHANNEL: 'Este producto no está disponible para pedidos mayoristas',
  MIN_WHOLESALE: 'No alcanzas el pedido mínimo mayorista',
  RATE_LIMIT: 'Demasiados pedidos seguidos con este número. Intenta más tarde.',
  INVALID_CHANNEL: 'Canal de compra no válido.',
};

/** Traduce el mensaje de error de create_order ("CODE" o "CODE:detalle") a español. */
export function orderErrorMessage(raw: string | undefined): string {
  const [code, detail] = (raw ?? '').split(':');
  const base = ORDER_ERROR_MESSAGES[code];
  if (!base) return 'No pudimos registrar tu pedido. Intenta de nuevo.';
  if (code === 'MIN_WHOLESALE' && detail) return `${base} de ${formatCOP(parseInt(detail, 10))}.`;
  return detail ? `${base}: ${detail}.` : base;
}
