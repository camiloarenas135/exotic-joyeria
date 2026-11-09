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
  VARIANT_REQUIRED: 'Elige una opción (variante) para',
  TOTAL_TOO_LARGE: 'El total del pedido es demasiado grande. Divídelo en dos pedidos.',
};

/** Traduce el mensaje de error de create_order ("CODE" o "CODE:detalle") a español. */
export function orderErrorMessage(raw: string | undefined, channel: 'retail' | 'wholesale' = 'retail'): string {
  const [code, detail] = (raw ?? '').split(':');
  if (code === 'RATE_LIMIT' && channel === 'wholesale') {
    return 'Hiciste varios pedidos seguidos con tu cuenta (máximo 5 por hora). Intenta de nuevo más tarde o escríbenos por WhatsApp.';
  }
  const base = ORDER_ERROR_MESSAGES[code];
  if (!base) return 'No pudimos registrar tu pedido. Intenta de nuevo.';
  if (code === 'MIN_WHOLESALE' && detail) return `${base} de ${formatCOP(parseInt(detail, 10))}.`;
  return detail ? `${base}: ${detail}.` : base;
}

/** Ahorro del mayorista frente al detal de referencia: pesos y porcentaje redondeado. Null si no ahorra. */
export function wholesaleSavings(retailRef: number | null | undefined, price: number): { cop: number; pct: number } | null {
  if (!retailRef || retailRef <= price) return null;
  return { cop: retailRef - price, pct: Math.round(((retailRef - price) / retailRef) * 100) };
}

const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN: 'No tienes permiso para hacer esto. Vuelve a iniciar sesión como administrador.',
  INVALID_ROWS: 'Los datos enviados no son válidos (o son más de 500 filas). Revisa e intenta de nuevo.',
  INVALID_PRICE: 'Los precios deben ser números enteros mayores a 0.',
  INVALID_MIN: 'El mínimo debe ser un número entero entre 0 y 1.000.000.000.',
  PRODUCT_NOT_FOUND: 'Uno de los productos ya no existe. Recarga la lista.',
  VARIANT_REQUIRED: 'Este producto tiene variantes: el precio mayorista se pone por variante, no en la fila base',
  VARIANT_NOT_FOUND: 'Una variante ya no existe en el producto. Recarga la lista',
  ORDER_NOT_FOUND: 'El pedido ya no existe. Recarga la lista.',
  INVALID_STATE: 'El pedido está en un estado que no permite esta acción',
  NOT_FOUND: 'No se encontró el registro. Recarga la lista.',
  INVALID_STATUS: 'Estado no válido.',
  INVALID_ACCOUNT_TYPE: 'Tipo de cuenta no válido.',
  INVALID_PRICE_LIST: 'Lista de precios no válida.',
  INVALID_STOCK: 'El stock debe ser un número entero entre 0 y 1.000.000.',
  STOCK_CHANGED: 'El stock cambió mientras lo editabas (otro administrador o un pedido confirmado). Recarga y vuelve a intentar',
  DUPLICATE_VARIANT: 'Hay dos variantes con el mismo nombre. Cada variante de un producto debe tener un nombre distinto',
  LEGACY_VARIANT_LINE: 'Este pedido tiene una línea sin variante de un producto que ahora maneja stock por variante. Cancélalo y rehazlo con la variante',
};

/** Traduce los errores de las RPC de administración (admin_*, confirm_order, cancel_order) a español. */
export function adminErrorMessage(raw: string | undefined): string {
  const parts = (raw ?? '').split(':');
  const code = parts[0];
  if (code === 'INSUFFICIENT_STOCK') {
    const [, product, stock, wanted] = parts;
    return `No hay stock suficiente de ${product || 'un producto'}: quedan ${stock ?? '0'} y el pedido pide ${wanted ?? '?'}. Repón el inventario y vuelve a confirmar.`;
  }
  const base = ADMIN_ERRORS[code];
  if (!base) return 'No se pudo completar la acción. Intenta de nuevo.';
  if (code === 'STOCK_CHANGED' && parts[1]) return `${base} (ahora es ${parts[1]}).`;
  if ((code === 'VARIANT_REQUIRED' || code === 'VARIANT_NOT_FOUND' || code === 'INVALID_STATE' || code === 'DUPLICATE_VARIANT' || code === 'LEGACY_VARIANT_LINE') && parts[1]) return `${base}: ${parts[1]}.`;
  return base;
}
