import { test as base, expect, type Page } from '@playwright/test';

/**
 * Panel admin en móvil: ninguna pestaña debe tener scroll horizontal.
 * Se simula la sesión admin y TODAS las respuestas de Supabase (nada llega a producción).
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = 4102444800; // año 2100
const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'kevinlgomez058@gmail.com',
  app_metadata: { provider: 'google' },
  user_metadata: {},
  created_at: '2024-01-01T00:00:00Z',
};
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, role: 'authenticated', exp: EXP })}.sig`;
const SESSION = { access_token: JWT, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: EXP, user: USER };

const long = 'Pulsera Eslabón Cubano Oro Laminado 18k Extra Larga Edición Especial Aniversario';
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const products = Array.from({ length: 6 }, (_, i) => ({
  id: uuid(100 + i),
  name: i === 0 ? long : `Producto ${i}`,
  price: '$120.000',
  price_cop: 120000,
  category: 'Anillos',
  category_id: uuid(1),
  stock: i === 1 ? 0 : 5 + i,
  description: 'Descripción de prueba',
  variants: [{ name: '40cm x 1.5mm', price: '$95.000', price_cop: 95000 }],
  images: [],
  created_at: '2025-01-01T00:00:00Z',
}));

const FIXTURES: Record<string, unknown[]> = {
  products,
  categories: [
    { id: uuid(1), slug: 'anillos', name: 'Anillos', sort_order: 1, is_active: true, image: null },
    { id: uuid(2), slug: 'pulseras-tejidas-edicion-especial', name: 'Pulseras Tejidas Edición Especial', sort_order: 2, is_active: false, image: null },
  ],
  orders: [
    {
      id: uuid(200), customer_name: 'maría fernanda rodríguez de la cruz', customer_phone: '+57 300 123 4567',
      items: [{ id: products[0].id, name: long, quantity: 2, price: '$120.000', selectedVariant: { name: '40cm x 1.5mm', price: '$95.000' } }],
      total_amount: 240000, status: 'pending', channel: 'wholesale', user_id: uuid(300), created_at: '2025-05-01T12:00:00Z',
    },
    {
      id: uuid(201), customer_name: 'Juan Pérez', customer_phone: '3001112233',
      items: [{ id: products[2].id, name: 'Producto 2', quantity: 1, price: '$120.000' }],
      total_amount: 120000, status: 'confirmed', channel: 'retail', user_id: null, created_at: '2025-05-02T12:00:00Z',
    },
  ],
  order_lines: [{ order_id: uuid(200), name_snapshot: long, qty: 2, line_total_cop: 240000 }],
  vip_members: [
    { id: uuid(400), name: 'Cliente VIP con un nombre bastante largo para probar', whatsapp: '+57 300 999 8888', created_at: '2025-04-01T10:00:00Z' },
  ],
  hero_slides: [
    { id: uuid(500), image_desktop: 'https://x.supabase.co/a.webp', image_mobile: null, title: 'Colección de temporada con título largo', subtitle: 'Sub', button_label: 'Ver', link: '/catalogo', sort_order: 1, is_active: true, starts_at: null, ends_at: null },
  ],
  promotions: [
    { id: uuid(600), product_id: products[0].id, kind: 'percent', value: 20, starts_at: '2025-01-01T05:00:00Z', ends_at: '2099-01-01T05:00:00Z', is_active: true, products: { name: long, price_cop: 120000 } },
  ],
  wholesalers: [
    { user_id: uuid(300), email: 'negocio.con.correo.muy.largo@ejemplo-de-dominio-largo.com', business_name: 'Distribuidora Joyas del Valle S.A.S.', phone: '+57 300 555 1234', city: 'Bogotá', tax_id: '900123456', status: 'pending', notes: null, created_at: '2025-05-01T12:00:00Z' },
    { user_id: uuid(301), email: 'ok@x.com', business_name: 'Tienda Aprobada', phone: '3005551234', city: 'Cali', tax_id: null, status: 'approved', notes: 'Nota', created_at: '2025-04-01T12:00:00Z' },
  ],
  wholesale_prices: [
    { id: uuid(700), product_id: products[0].id, variant_name: null, price_cop: 80000, is_visible: true, products: { name: long } },
  ],
  settings: [{ key: 'wholesale_min_cop', value: 3500000 }],
};

async function stubSupabase(page: Page) {
  await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), SESSION);

  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/user')) return route.fulfill({ json: USER });
    return route.fulfill({ json: SESSION });
  });
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = FIXTURES[table] ?? [];
    const headers = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, json: [], headers });
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, body: '', headers });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows, headers });
  });
  // storage y realtime: sin red
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: [] }));
  await page.routeWebSocket(/realtime/, () => undefined);
}

const TABS = [
  { name: 'Pedidos', marker: /Pedidos/i },
  { name: 'Catálogo', marker: /Catálogo/i },
  { name: 'Estadísticas', marker: /Estadísticas/i },
  { name: 'Colecciones', marker: /Colecciones/i },
  { name: 'Banners', marker: /Banners/i },
  { name: 'Promociones', marker: /Promociones/i },
  { name: 'Mayoristas', marker: /Mayoristas/i },
  { name: 'Miembros VIP', marker: /Miembros VIP/i },
];

for (const width of [412, 360]) {
  test.describe(`admin móvil ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

    for (const tab of TABS) {
      test(`pestaña ${tab.name} sin scroll horizontal`, async ({ page }, info) => {
        test.skip(info.project.name !== 'mobile', 'solo proyecto móvil');
        await stubSupabase(page);
        await page.goto('/admin');
        await expect(page.getByRole('button', { name: tab.marker }).first()).toBeVisible({ timeout: 15_000 });
        await page.getByRole('button', { name: tab.marker }).first().click();
        await page.waitForTimeout(1200);

        const m = await page.evaluate(() => {
          const w = window.innerWidth;
          const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && r.right > w + 1 && getComputedStyle(e).position !== 'fixed';
            })
            .slice(0, 6)
            .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 50)} →${Math.round(e.getBoundingClientRect().right)}`);
          return { w, sw: document.documentElement.scrollWidth, offenders };
        });
        await page.screenshot({ path: `test-results/admin-${width}-${tab.name}.png`, fullPage: true });
        expect(m.sw, `scrollWidth ${m.sw} > ${m.w}; ${m.offenders.join(' | ')}`).toBeLessThanOrEqual(m.w);
      });
    }
  });
}
