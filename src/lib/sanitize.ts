/**
 * Utility functions to sanitize user inputs and prevent XSS or DB injection issues.
 */

/**
 * Sanitizes a string by trimming it and removing HTML tags.
 */
export function sanitizeString(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>]/g, '');   // Remove angle brackets
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

