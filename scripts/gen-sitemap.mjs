// Genera public/sitemap.xml antes de cada build: rutas fijas + una por colección activa (lee la API pública de Supabase).
// Si no hay red o faltan variables, escribe solo las rutas fijas: nunca rompe el build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://exoticjoyeria.lat';
const FIXED = ['/', '/catalogo', '/promociones', '/emprendedor', '/mayoristas'];

function envFromFile() {
  try {
    const out = {};
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = envFromFile();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY;

let slugs = [];
if (url && key) {
  try {
    const res = await fetch(`${url}/rest/v1/categories?select=slug&is_active=eq.true&order=sort_order`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) slugs = (await res.json()).map((c) => c.slug).filter((s) => /^[a-z0-9-]{1,60}$/.test(s));
    else console.warn(`[sitemap] Supabase respondió ${res.status}; solo rutas fijas.`);
  } catch (e) {
    console.warn('[sitemap] sin red; solo rutas fijas:', e instanceof Error ? e.message : e);
  }
}

const paths = [...FIXED, ...slugs.map((s) => `/coleccion/${s}`)];
const today = new Date().toISOString().slice(0, 10);
const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paths.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`;

mkdirSync(resolve(root, 'public'), { recursive: true });
writeFileSync(resolve(root, 'public/sitemap.xml'), xml);
console.log(`[sitemap] ${paths.length} URLs (${slugs.length} colecciones).`);
