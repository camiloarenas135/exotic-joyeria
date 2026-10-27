import { test as base, expect, type Page, type Request } from '@playwright/test';
import { resolveLink } from '../src/lib/bannerLink';
import { isSafeLink } from '../src/lib/types';

/**
 * Entrega B: enlaces de banners, promociones por alcance y precio por variante del servidor.
 * TODO Supabase está simulado (nada llega a producción, no se crean datos reales).
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const CAT_ANILLOS = uuid(1);
const CAT_ORPHAN = uuid(999);
const P1 = uuid(101);

const CATEGORIES = [
  { id: CAT_ANILLOS, slug: 'anillos', name: 'Anillos', sort_order: 1, is_active: true, image: null },
  { id: uuid(2), slug: 'pulseras', name: 'Pulseras', sort_order: 2, is_active: true, image: null },
];

// ---------- resolveLink / isSafeLink (lógica pura) ----------
test.describe('resolveLink', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'lógica pura: una sola vez'); });
  const ctx = { categories: CATEGORIES };
  const s = (o: Record<string, unknown>) => ({ link: null, link_type: null, link_ref: null, ...o }) as never;

  test('tipos fijos', () => {
    expect(resolveLink(s({ link_type: 'home' }), ctx)).toEqual({ kind: 'internal', to: '/' });
    expect(resolveLink(s({ link_type: 'catalog' }), ctx)).toEqual({ kind: 'internal', to: '/catalogo' });
    expect(resolveLink(s({ link_type: 'promos' }), ctx)).toEqual({ kind: 'internal', to: '/promociones' });
    expect(resolveLink(s({ link_type: 'wholesale' }), ctx)).toEqual({ kind: 'internal', to: '/mayoristas' });
    expect(resolveLink(s({ link_type: 'entrepreneur' }), ctx)).toEqual({ kind: 'internal', to: '/emprendedor' });
  });
  test('colección por uuid y huérfana cae a /catalogo', () => {
    expect(resolveLink(s({ link_type: 'collection', link_ref: CAT_ANILLOS }), ctx)).toEqual({ kind: 'internal', to: '/coleccion/anillos' });
    expect(resolveLink(s({ link_type: 'collection', link_ref: CAT_ORPHAN }), ctx)).toEqual({ kind: 'internal', to: '/catalogo' });
    expect(resolveLink(s({ link_type: 'collection', link_ref: null }), ctx)).toEqual({ kind: 'internal', to: '/catalogo' });
  });
  test('producto abre el modal por enlace profundo; uuid inválido no genera enlace', () => {
    expect(resolveLink(s({ link_type: 'product', link_ref: P1 }), ctx)).toEqual({ kind: 'internal', to: `/catalogo?producto=${P1}` });
    expect(resolveLink(s({ link_type: 'product', link_ref: 'x&y=1' }), ctx)).toBeNull();
  });
  test('externo solo https seguro', () => {
    expect(resolveLink(s({ link_type: 'external', link_ref: 'https://example.com/a?b=1' }), ctx)).toEqual({ kind: 'external', href: 'https://example.com/a?b=1' });
    expect(resolveLink(s({ link_type: 'external', link_ref: 'http://example.com' }), ctx)).toBeNull();
    expect(resolveLink(s({ link_type: 'external', link_ref: 'https://user@evil.com' }), ctx)).toBeNull();
    expect(resolveLink(s({ link_type: 'external', link_ref: 'javascript:alert(1)' }), ctx)).toBeNull();
  });
  test('tipo desconocido no devuelve enlace', () => {
    expect(resolveLink(s({ link_type: 'foo', link: '/catalogo' }), ctx)).toBeNull();
  });
  test('banner viejo: link de texto validado con isSafeLink', () => {
    expect(resolveLink(s({ link: '/catalogo' }), ctx)).toEqual({ kind: 'internal', to: '/catalogo' });
    expect(resolveLink(s({ link: 'https://example.com' }), ctx)).toEqual({ kind: 'external', href: 'https://example.com' });
    for (const bad of ['//evil.com', '/a/../b', 'https://user@evil.com', 'http://x.com', 'javascript:alert(1)', '', null]) {
      expect(resolveLink(s({ link: bad }), ctx), String(bad)).toBeNull();
    }
    expect(isSafeLink('/')).toBe(true);
    expect(isSafeLink('/catalogo?producto=abc&x=1#top')).toBe(true);
    expect(isSafeLink('//evil.com')).toBe(false);
  });
});

// ---------- stub común ----------
type Fixtures = Record<string, unknown[]>;
interface Captured { method: string; url: string; body: unknown }

async function stubStore(page: Page, fixtures: Fixtures, rpc: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = (route.request().postDataJSON?.() ?? {}) as Record<string, unknown>;
    return route.fulfill({ json: rpc[name] ? rpc[name](body) : [] });
  });
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = fixtures[table] ?? [];
    const headers = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, json: [], headers });
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, body: '', headers });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows, headers });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 401, json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
}

const noOverflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

// ---------- HeroCarousel ----------
const slide = (o: Record<string, unknown>) => ({
  id: uuid(500), image_desktop: '', image_mobile: null, title: 'Banner', subtitle: null, button_label: 'Ver oferta',
  link: null, link_type: null, link_ref: null, sort_order: 1, is_active: true, starts_at: null, ends_at: null, ...o,
});

const HERO_CASES: { name: string; slide: Record<string, unknown>; href: string | null; external?: boolean }[] = [
  { name: 'home', slide: { link_type: 'home' }, href: '/' },
  { name: 'catalog', slide: { link_type: 'catalog' }, href: '/catalogo' },
  { name: 'collection', slide: { link_type: 'collection', link_ref: CAT_ANILLOS }, href: '/coleccion/anillos' },
  { name: 'collection huérfana', slide: { link_type: 'collection', link_ref: CAT_ORPHAN }, href: '/catalogo' },
  { name: 'product', slide: { link_type: 'product', link_ref: P1 }, href: `/catalogo?producto=${P1}` },
  { name: 'promos', slide: { link_type: 'promos' }, href: '/promociones' },
  { name: 'wholesale', slide: { link_type: 'wholesale' }, href: '/mayoristas' },
  { name: 'entrepreneur', slide: { link_type: 'entrepreneur' }, href: '/emprendedor' },
  { name: 'external', slide: { link_type: 'external', link_ref: 'https://example.com/promo' }, href: 'https://example.com/promo', external: true },
  { name: 'tipo desconocido', slide: { link_type: 'foo', link: '/catalogo' }, href: null },
  { name: 'banner viejo con link de texto', slide: { link: '/catalogo' }, href: '/catalogo' },
  { name: 'banner viejo con link inseguro', slide: { link: '//evil.com' }, href: null },
];

test.describe('HeroCarousel por tipo de enlace', () => {
  test.use({ viewport: { width: 412, height: 800 } });
  for (const c of HERO_CASES) {
    test(c.name, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'un solo proyecto basta');
      await stubStore(page, { hero_slides: [slide(c.slide)], categories: CATEGORIES });
      await page.goto('/');
      const hero = page.getByLabel('Destacados');
      await expect(hero.getByRole('heading', { name: 'Banner' })).toBeVisible();
      const link = hero.getByRole('link', { name: 'Ver oferta' });
      if (c.href === null) {
        await page.waitForTimeout(500);
        await expect(link).toHaveCount(0);
      } else {
        await expect(link).toHaveAttribute('href', c.href);
        if (c.external) {
          await expect(link).toHaveAttribute('target', '_blank');
          await expect(link).toHaveAttribute('rel', /noopener/);
          await expect(link).toHaveAttribute('rel', /noreferrer/);
        }
      }
    });
  }
});

// ---------- Panel admin ----------
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = 4102444800;
const USER = {
  id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated',
  email: 'kevinlgomez058@gmail.com', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2024-01-01T00:00:00Z',
};
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, role: 'authenticated', exp: EXP })}.sig`;
const SESSION = { access_token: JWT, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: EXP, user: USER };

const PRODUCTS = [
  { id: P1, name: 'Cadena Prueba', price: '$120.000', price_cop: 120000, category: 'Anillos', category_id: CAT_ANILLOS, stock: 5, description: '', variants: [], images: [], created_at: '2025-01-01T00:00:00Z' },
];
const SLIDE_ID = uuid(500);
const OLD_SLIDE = slide({ id: SLIDE_ID, image_desktop: 'https://x.supabase.co/a.webp', title: 'Banner viejo', link: '/catalogo' });

const ADMIN_FIXTURES: Fixtures = {
  products: PRODUCTS,
  categories: CATEGORIES,
  hero_slides: [OLD_SLIDE],
  promotions: [
    { id: uuid(601), scope: 'product', product_id: P1, category_id: null, kind: 'percent', value: 20, starts_at: '2025-01-01T05:00:00Z', ends_at: '2099-01-01T05:00:00Z', is_active: true, products: { name: 'Cadena Prueba', price_cop: 120000 }, categories: null },
    { id: uuid(602), scope: 'category', product_id: null, category_id: CAT_ANILLOS, kind: 'fixed', value: 5000, starts_at: '2025-01-01T05:00:00Z', ends_at: '2099-01-01T05:00:00Z', is_active: true, products: null, categories: { name: 'Anillos' } },
    { id: uuid(603), scope: 'store', product_id: null, category_id: null, kind: 'percent', value: 10, starts_at: '2025-01-01T05:00:00Z', ends_at: '2099-01-01T05:00:00Z', is_active: true, products: null, categories: null },
  ],
  orders: [], order_lines: [], vip_members: [], wholesalers: [], wholesale_prices: [],
  settings: [{ key: 'wholesale_min_cop', value: 3500000 }],
};

async function stubAdmin(page: Page, opts: { rejectWith?: { code: string } } = {}) {
  await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), SESSION);
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = ADMIN_FIXTURES[table] ?? [];
    const headers = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      if (opts.rejectWith && (table === 'hero_slides' || table === 'promotions')) return route.fulfill({ status: 400, json: { code: opts.rejectWith.code, message: 'check constraint' } });
      return route.fulfill({ status: 200, json: [], headers });
    }
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, body: '', headers });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows, headers });
  });
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: route.request().url().includes('/user') ? USER : SESSION }));
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
}

function captureWrites(page: Page, table: string): Captured[] {
  const writes: Captured[] = [];
  page.on('request', (req: Request) => {
    const u = new URL(req.url());
    if (u.pathname.endsWith(`/rest/v1/${table}`) && ['POST', 'PATCH'].includes(req.method())) {
      writes.push({ method: req.method(), url: req.url(), body: req.postDataJSON() });
    }
  });
  return writes;
}

async function openTab(page: Page, name: RegExp) {
  await page.goto('/admin');
  const tab = page.getByRole('button', { name }).first();
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
}

const row = (w: Captured) => (Array.isArray(w.body) ? w.body[0] : w.body) as Record<string, unknown>;

test.describe('AdminBanners', () => {
  test.use({ viewport: { width: 412, height: 900 } });
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'mobile', 'proyecto móvil'); });

  const CASES: { label: string; pick: (page: Page) => Promise<void>; expected: Record<string, unknown> }[] = [
    { label: 'Inicio', pick: async () => {}, expected: { link_type: 'home', link_ref: null } },
    { label: 'Todo el catálogo', pick: async () => {}, expected: { link_type: 'catalog', link_ref: null } },
    { label: 'Promociones', pick: async () => {}, expected: { link_type: 'promos', link_ref: null } },
    { label: 'Mayoristas', pick: async () => {}, expected: { link_type: 'wholesale', link_ref: null } },
    { label: 'Emprendedor', pick: async () => {}, expected: { link_type: 'entrepreneur', link_ref: null } },
    {
      label: 'Una colección',
      pick: async (page) => { await page.getByLabel('Colección', { exact: true }).selectOption(CAT_ANILLOS); },
      expected: { link_type: 'collection', link_ref: CAT_ANILLOS },
    },
    {
      label: 'Un producto',
      pick: async (page) => {
        await page.getByLabel('Buscar producto por nombre').fill('cadena');
        await page.getByRole('button', { name: /Cadena Prueba/ }).click();
      },
      expected: { link_type: 'product', link_ref: P1 },
    },
    {
      label: 'Enlace externo (avanzado)',
      pick: async (page) => { await page.getByLabel('Dirección https://').fill('https://example.com/oferta'); },
      expected: { link_type: 'external', link_ref: 'https://example.com/oferta' },
    },
  ];

  for (const c of CASES) {
    test(`edita banner y guarda destino "${c.label}"`, async ({ page }) => {
      await stubAdmin(page);
      const writes = captureWrites(page, 'hero_slides');
      await openTab(page, /Banners/i);
      await page.getByRole('button', { name: 'Editar' }).first().click();
      // el banner viejo se muestra como enlace personalizado y conserva su valor
      await expect(page.getByLabel('¿A dónde lleva?')).toHaveValue('legacy');
      await expect(page.getByText(/Se conserva el enlace anterior: \/catalogo/)).toBeVisible();
      await page.getByLabel('¿A dónde lleva?').selectOption({ label: c.label });
      await c.pick(page);
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].method).toBe('PATCH');
      expect(row(writes[0])).toMatchObject({ ...c.expected, link: null });
    });
  }

  test('banner viejo sin tocar el destino conserva link y no escribe link_type', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'hero_slides');
    await openTab(page, /Banners/i);
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(row(writes[0])).toMatchObject({ link: '/catalogo', link_type: null, link_ref: null });
  });

  test('crea un banner nuevo (con imagen subida) y envía link_type/link_ref con link null', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'hero_slides');
    await openTab(page, /Banners/i);
    await page.getByRole('button', { name: /Nuevo banner/ }).click();
    // PNG 1x1
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByAltText('Vista previa').first()).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('¿A dónde lleva?').selectOption({ label: 'Una colección' });
    await page.getByLabel('Colección', { exact: true }).selectOption(CAT_ANILLOS);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].method).toBe('POST');
    expect(row(writes[0])).toMatchObject({ link_type: 'collection', link_ref: CAT_ANILLOS, link: null });
  });

  test('valida destino incompleto y enlace externo inseguro sin llamar a la base', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'hero_slides');
    await openTab(page, /Banners/i);
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByLabel('¿A dónde lleva?').selectOption({ label: 'Una colección' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Elige la colección a la que lleva el banner.')).toBeVisible();
    await page.getByLabel('¿A dónde lleva?').selectOption({ label: 'Enlace externo (avanzado)' });
    await page.getByLabel('Dirección https://').fill('https://usuario@evil.com');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(/enlace externo debe empezar con/)).toBeVisible();
    expect(writes.length).toBe(0);
  });

  test('muestra un mensaje claro si la base rechaza el valor', async ({ page }) => {
    await stubAdmin(page, { rejectWith: { code: '23514' } });
    await openTab(page, /Banners/i);
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByLabel('¿A dónde lleva?').selectOption({ label: 'Inicio' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(/La base de datos rechazó el destino del enlace/)).toBeVisible();
  });

  test('no hay campo de ruta manual ni placeholder', async ({ page }) => {
    await stubAdmin(page);
    await openTab(page, /Banners/i);
    await page.getByRole('button', { name: /Nuevo banner/ }).click();
    await expect(page.getByPlaceholder('/coleccion/anillos')).toHaveCount(0);
  });
});

test.describe('AdminPromos', () => {
  test.use({ viewport: { width: 412, height: 900 } });
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'mobile', 'proyecto móvil'); });

  const fillDates = async (page: Page, a = '2030-01-01T10:00', b = '2030-02-01T10:00') => {
    await page.locator('input[type=datetime-local]').nth(0).fill(a);
    await page.locator('input[type=datetime-local]').nth(1).fill(b);
  };

  test('la lista muestra el alcance y usa cards en móvil', async ({ page }) => {
    await stubAdmin(page);
    await openTab(page, /Promociones/i);
    await expect(page.getByText('Producto: Cadena Prueba')).toBeVisible();
    await expect(page.getByText('Colección: Anillos')).toBeVisible();
    await expect(page.getByText('Toda la tienda', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('(producto eliminado)')).toHaveCount(0);
    await expect(page.getByText(/solo al detal/i).first()).toBeVisible();
    await expect(page.locator('table.responsive-table td[data-label="Alcance"]').first()).toBeVisible();
  });

  test('envía scope=product con product_id', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'promotions');
    await openTab(page, /Promociones/i);
    await page.getByRole('button', { name: /Nueva promoción/ }).click();
    await page.getByLabel('Buscar producto por nombre').fill('cadena');
    await page.getByRole('button', { name: /Cadena Prueba/ }).click();
    await page.getByRole('spinbutton').fill('15');
    await fillDates(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(row(writes[0])).toMatchObject({ scope: 'product', product_id: P1, category_id: null, kind: 'percent', value: 15 });
  });

  test('envía scope=category con category_id y product_id null', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'promotions');
    await openTab(page, /Promociones/i);
    await page.getByRole('button', { name: /Nueva promoción/ }).click();
    await page.getByLabel('¿A qué aplica?').selectOption('category');
    await page.getByLabel('Colección', { exact: true }).selectOption(CAT_ANILLOS);
    await expect(page.getByText(/no mostrarán la promoción/)).toBeVisible();
    await page.locator('select').filter({ hasText: 'Valor fijo' }).selectOption('fixed');
    await page.getByRole('spinbutton').fill('99999999'); // en colección el fijo no se compara con un precio
    await fillDates(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(row(writes[0])).toMatchObject({ scope: 'category', product_id: null, category_id: CAT_ANILLOS, kind: 'fixed' });
  });

  test('envía scope=store sin objetivo', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'promotions');
    await openTab(page, /Promociones/i);
    await page.getByRole('button', { name: /Nueva promoción/ }).click();
    await page.getByLabel('¿A qué aplica?').selectOption('store');
    await page.getByRole('spinbutton').fill('10');
    await fillDates(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(row(writes[0])).toMatchObject({ scope: 'store', product_id: null, category_id: null, kind: 'percent', value: 10 });
  });

  test('validaciones de cliente: no se envía nada inválido', async ({ page }) => {
    await stubAdmin(page);
    const writes = captureWrites(page, 'promotions');
    await openTab(page, /Promociones/i);
    await page.getByRole('button', { name: /Nueva promoción/ }).click();
    await page.getByLabel('¿A qué aplica?').selectOption('store');
    const save = page.getByRole('button', { name: 'Guardar' });

    await page.getByRole('spinbutton').fill('95');
    await fillDates(page);
    await save.click();
    await expect(page.getByText('El porcentaje máximo es 90 %.')).toBeVisible();

    await page.getByRole('spinbutton').fill('0');
    await save.click();
    await expect(page.getByText(/entero mayor a 0/)).toBeVisible();

    await page.getByRole('spinbutton').fill('10');
    await fillDates(page, '2030-02-01T10:00', '2030-01-01T10:00');
    await save.click();
    await expect(page.getByText('La fecha de fin debe ser posterior a la de inicio.')).toBeVisible();

    // fijo >= precio en alcance producto
    await page.getByLabel('¿A qué aplica?').selectOption('product');
    await page.getByLabel('Buscar producto por nombre').fill('cadena');
    await page.getByRole('button', { name: /Cadena Prueba/ }).click();
    await page.locator('select').filter({ hasText: 'Valor fijo' }).selectOption('fixed');
    await page.getByRole('spinbutton').fill('120000');
    await fillDates(page);
    await save.click();
    await expect(page.getByText(/valor fijo debe ser menor al precio/i)).toBeVisible();

    // colección sin elegir
    await page.getByLabel('¿A qué aplica?').selectOption('category');
    await save.click();
    await expect(page.getByText('Elige una colección.')).toBeVisible();
    expect(writes.length).toBe(0);
  });
});

test.describe('AdminCategories: aviso al cambiar el slug', () => {
  test.use({ viewport: { width: 412, height: 900 } });
  test('advierte solo cuando el slug cambia', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'proyecto móvil');
    await stubAdmin(page);
    await openTab(page, /Colecciones/i);
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.locator('input.font-mono').fill('anillos-nuevo');
    await expect(page.getByRole('alert')).toContainText('/coleccion/anillos');
    await expect(page.getByRole('alert')).toContainText('dejarán de funcionar');
  });
});

for (const width of [360, 412]) {
  test.describe(`sin scroll horizontal ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

    test(`admin: formularios de banners y promociones abiertos`, async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'proyecto móvil');
      await stubAdmin(page);
      await openTab(page, /Banners/i);
      await page.getByRole('button', { name: 'Editar' }).first().click();
      await page.getByLabel('¿A dónde lleva?').selectOption({ label: 'Enlace externo (avanzado)' });
      await page.getByLabel('Dirección https://').fill('https://example.com/una/direccion/bastante/larga/para/probar/el/desborde/horizontal');
      let m = await noOverflow(page);
      expect(m.sw, 'banners').toBeLessThanOrEqual(m.iw);

      await page.getByRole('button', { name: /Promociones/i }).first().click();
      await page.getByRole('button', { name: /Nueva promoción/ }).click();
      await page.getByLabel('¿A qué aplica?').selectOption('category');
      await page.waitForTimeout(300);
      m = await noOverflow(page);
      expect(m.sw, 'promociones').toBeLessThanOrEqual(m.iw);
    });

    test(`tienda: inicio, catálogo y modal`, async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'proyecto móvil');
      await stubStore(page, { hero_slides: [slide({ link_type: 'catalog' })], categories: CATEGORIES }, { catalog_retail: () => [catalogRow()] });
      for (const path of ['/', '/catalogo']) {
        await page.goto(path);
        await page.waitForTimeout(600);
        const m = await noOverflow(page);
        expect(m.sw, path).toBeLessThanOrEqual(m.iw);
      }
      await page.getByRole('button', { name: 'Ver Cadena Prueba' }).click();
      await expect(page.getByRole('dialog', { name: 'Cadena Prueba' })).toBeVisible();
      const m = await noOverflow(page);
      expect(m.sw, 'modal').toBeLessThanOrEqual(m.iw);
    });
  });
}

// ---------- Precio por variante del servidor ----------
/**
 * Los valores del servidor NO coinciden con lo que calcularía el cliente:
 * - promo del producto: 20 % (el cliente daría 80.000 para la variante A y 120.000 para la B)
 * - servidor: A = 77.000, B = 150.000 (sin promo)
 * Si la pantalla muestra 77.000 / 150.000, el cliente no recalcula.
 */
function catalogRow() {
  return {
    id: P1, name: 'cadena prueba', price: '$100.000', price_cop: 100000, effective_price_cop: 80000,
    promo_kind: 'percent', promo_value: 20, category: 'Cadenas', category_id: CAT_ANILLOS, stock: 5, description: 'x',
    variants: [
      { name: 'A', price: '$100.000', price_cop: 100000, effective_price_cop: 77000, promo_kind: 'fixed', promo_value: 23000 },
      { name: 'B', price: '$150.000', price_cop: 150000, effective_price_cop: 150000, promo_kind: null, promo_value: null },
    ],
    images: [], created_at: '2025-01-01T00:00:00Z', total_count: 1,
  };
}

test.describe('precio por variante (servidor)', () => {
  test.use({ viewport: { width: 412, height: 900 } });

  test('tarjeta, modal y carrito usan effective_price_cop sin recalcular', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'proyecto móvil');
    const orders: unknown[] = [];
    await stubStore(page, { categories: CATEGORIES }, {
      catalog_retail: () => [catalogRow()],
      create_order: (b) => { orders.push(b); return { order_id: 'o', total: 77000, lines: [] }; },
    });
    await page.goto('/catalogo');
    const card = page.locator('article').first();
    await expect(card).toContainText('Desde');
    await expect(card.locator('p span.font-semibold')).toHaveText(/77\.000/);
    await expect(card).toContainText('−23 %');

    await card.getByRole('button', { name: 'Ver Cadena Prueba' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cadena Prueba' });
    await expect(dialog.locator('p span.text-xl')).toHaveText(/77\.000/);
    await expect(dialog.locator('p span.line-through')).toHaveText(/100\.000/);
    await dialog.getByRole('button', { name: 'B', exact: true }).click();
    await expect(dialog.locator('p span.text-xl')).toHaveText(/150\.000/);
    await expect(dialog.locator('p span.line-through')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'A', exact: true }).click();
    await dialog.getByRole('button', { name: 'Añadir al Carrito' }).click();

    const cart = page.getByRole('dialog', { name: 'Carrito de compras' });
    await expect(cart).toBeVisible();
    await expect(cart.getByText(/77\.000/).first()).toBeVisible();
    await expect(cart.getByText('Subtotal').locator('xpath=following-sibling::span')).toHaveText(/77\.000/);
    expect(orders.length).toBe(0); // no se crea ningún pedido en esta prueba
  });

  test('fetchProductById pide catalog_retail con p_id y abre el modal con el precio del servidor', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'proyecto móvil');
    const bodies: Record<string, unknown>[] = [];
    await stubStore(page, { categories: CATEGORIES }, {
      // el listado queda vacío para que el modal NO salga de la caché de la grilla
      catalog_retail: (b) => { bodies.push(b); return b.p_id === P1 ? [catalogRow()] : []; },
    });
    await page.goto(`/catalogo?producto=${P1}`);
    const dialog = page.getByRole('dialog', { name: 'Cadena Prueba' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('p span.text-xl')).toHaveText(/77\.000/);
    const byId = bodies.find((b) => b.p_id === P1);
    expect(byId, 'ninguna llamada con p_id').toBeTruthy();
    expect(byId).toMatchObject({ p_id: P1, p_limit: 1, p_search: null });
  });
});
