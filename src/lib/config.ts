export const STORE_WHATSAPP = '573170817990';

export function whatsappLink(text?: string): string {
  const base = `https://wa.me/${STORE_WHATSAPP}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
