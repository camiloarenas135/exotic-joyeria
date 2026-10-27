import { test as base, expect, type Page, type Locator } from '@playwright/test';

/**
 * Entrega C: burbuja "Promociones" (RPC promo_cover) y filas deslizables (ScrollRow).
 * TODO Supabase está simulado: no depende de datos en vivo ni escribe en producción.
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const NAMES = ['Anillos', 'Pulseras', 'Collares', 'Aretes', 'Dijes', 'Relojes', 'Cadenas', 'Conjuntos de novia con nombre largo', 'Insumos'];
const categories = (n = NAMES.length) =>
  NAMES.slice(0, n).map((name, i) => ({ id: uuid(i + 1), slug: name.toLowerCase().split(' ')[0], name, sort_order: i + 1, is_active: true, image: null }));

const svg = (c: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${c}"/><circle cx="120" cy="120" r="44" fill="none" stroke="#fff" stroke-width="10"/></svg>`)}`;
const PROMO_IMG = svg('#b76e79');

const product = (i: number, promo = false) => ({
  id: uuid(100 + i),
  name: `Pieza ${i}`,
  price: '$100.000',
  price_cop: 100000,
  effective_price_cop: promo ? 80000 : 100000,
  promo_kind: promo ? 'percent' : null,
  promo_value: promo ? 20 : null,
  category: 'Anillos',
  category_id: uuid(1),
  stock: 5,
  description: 'Pieza de prueba',
  variants: [],
  images: [svg('#d4af37')],
  created_at: '2025-01-01T00:00:00Z',
});

interface Opts {
  /** Respuesta de promo_cover: filas, o un código HTTP de error. Función = una respuesta por llamada. */
  promo?: unknown[] | number | ((call: number) => unknown[] | number);
  cats?: number;
  /** Fotos de colección (category_id → image) */
  covers?: Record<string, string>;
}

async function stub(page: Page, opts: Opts = {}) {
  const cats = categories(opts.cats);
  let promoCalls = 0;
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === 'promo_cover') {
      promoCalls++;
      const r = typeof opts.promo === 'function' ? opts.promo(promoCalls) : (opts.promo ?? []);
      return typeof r === 'number' ? route.fulfill({ status: r, json: { message: 'boom' } }) : route.fulfill({ json: r });
    }
    if (name === 'collection_covers') {
      return route.fulfill({ json: Object.entries(opts.covers ?? {}).map(([category_id, image]) => ({ category_id, image })) });
    }
    if (name === 'catalog_retail') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const n = body.p_promo_only ? 4 : 8;
      const rows = Array.from({ length: n }, (_, i) => product(i + 1, !!body.p_promo_only));
      return route.fulfill({ json: rows.map((r) => ({ ...r, total_count: rows.length })) });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = table === 'categories' ? cats : [];
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, json: [] });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 401, json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
  return { promoCalls: () => promoCalls };
}

const PROMO_ROW = (extra: Record<string, unknown> = {}) => [
  { image: PROMO_IMG, product_name: 'Anillo Oferta', max_discount_pct: 35, promo_count: 12, valid_until: null, ...extra },
];

const circles = (page: Page) => page.getByRole('navigation', { name: 'Colecciones' });
const list = (page: Page) => circles(page).locator('ul').first();
const scrollLeft = (loc: Locator) => loc.evaluate((el) => el.scrollLeft);
const pageOverflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

// ---------------------------------------------------------------------------------------------
test.describe('menú sin "Promociones" (escritorio)', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

  test('no hay enlace en el menú ni en el footer, y /promociones sigue existiendo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Promociones' })).toHaveCount(0);
    await expect(page.locator('footer').getByRole('link', { name: 'Promociones' })).toHaveCount(0);
    await page.goto('/promociones');
    await expect(page.getByRole('heading', { level: 1, name: 'Promociones' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('burbuja Promociones', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

  for (const w of [360, 1280]) {
    test(`presente: primer círculo, enlace, foto e insignia a ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await stub(page, { promo: PROMO_ROW() });
      await page.goto('/');
      const nav = circles(page);
      const bubble = nav.getByTestId('promo-bubble');
      await expect(bubble).toHaveCount(1);
      await expect(nav.getByRole('link').first()).toHaveAttribute('data-testid', 'promo-bubble');
      await expect(bubble).toHaveAttribute('href', '/promociones');
      await expect(bubble).toHaveAccessibleName('Promociones, hasta 35% de descuento');
      await expect(bubble.locator('img')).toHaveAttribute('src', PROMO_IMG);
      await expect(bubble.getByTestId('promo-badge')).toHaveText('hasta -35%');
      // el nombre visible empieza igual que el accesible (WCAG 2.5.3)
      await expect(bubble).toContainText('Promociones');
      const box = await bubble.locator('span').first().boundingBox();
      expect(Math.round(box!.width)).toBe(Math.round(box!.height));
      if (process.env.SHOT_DIR) {
        await nav.scrollIntoViewIfNeeded();
        await page.locator('section', { has: nav }).screenshot({ path: `${process.env.SHOT_DIR}/bubble-${w}.png` });
      }
      await bubble.click();
      await expect(page).toHaveURL(/\/promociones$/);
    });
  }

  test('también en /catalogo y /coleccion/:slug', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    for (const url of ['/catalogo', '/coleccion/aretes']) {
      await page.goto(url);
      await expect(circles(page).getByRole('link').first()).toHaveAttribute('href', '/promociones');
    }
  });

  for (const [name, promo] of [
    ['sin filas', []],
    ['error 500', 500],
    ['RPC inexistente (404)', 404],
    ['vencida', PROMO_ROW({ valid_until: '2020-01-01T00:00:00Z' })],
    ['sin foto', PROMO_ROW({ image: null })],
  ] as [string, Opts['promo']][]) {
    test(`ausente: ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await stub(page, { promo });
      await page.goto('/');
      await expect(circles(page).getByRole('link', { name: 'Anillos' })).toBeVisible();
      await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('sin promoción ni colecciones la fila no se pinta', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { cats: 0 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nuestras colecciones' })).toBeVisible();
    await expect(circles(page)).toHaveCount(0);
  });

  test('desaparece al vencer, sin recargar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // La app puede pedir la RPC más de una vez (StrictMode): la respuesta depende de la hora, no del número de llamada
    const until = Date.now() + 3500;
    const s = await stub(page, { promo: () => (Date.now() < until ? PROMO_ROW({ valid_until: new Date(until).toISOString() }) : []) });
    await page.goto('/');
    await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(1);
    await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(0, { timeout: 10000 });
    await expect(circles(page).getByRole('link', { name: 'Anillos' })).toBeVisible();
    expect(s.promoCalls()).toBeGreaterThanOrEqual(2);
  });

  test('una caché vencida no pinta la burbuja aunque la RPC tarde', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      const data = { image: 'x', productName: 'x', maxDiscountPct: 10, validUntil: '2020-01-01T00:00:00Z' };
      sessionStorage.setItem('promo_cover_cache_v1', JSON.stringify({ data, fetchedAt: Date.now() }));
    });
    await stub(page);
    await page.route('**/rest/v1/rpc/promo_cover', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ json: [] }).catch(() => undefined);
    });
    await page.goto('/');
    await expect(circles(page).getByRole('link', { name: 'Anillos' })).toBeVisible();
    await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(0);
  });

  test('una caché vigente pinta la burbuja de inmediato y se revalida', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((img) => {
      const data = { image: img, productName: 'x', maxDiscountPct: 10, validUntil: new Date(Date.now() + 3600_000).toISOString() };
      sessionStorage.setItem('promo_cover_cache_v1', JSON.stringify({ data, fetchedAt: Date.now() }));
    }, PROMO_IMG);
    await stub(page, { promo: [] });
    await page.goto('/');
    // la RPC (vacía) llega después y la quita
    await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(0, { timeout: 5000 });
  });

  test('foto rota: cae al icono y el enlace sigue funcionando; igual con una colección', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW({ image: 'https://img.invalid/rota.png' }), covers: { [uuid(1)]: 'https://img.invalid/rota2.png' } });
    await page.route('https://img.invalid/**', (route) => route.abort());
    await page.goto('/');
    const bubble = circles(page).getByTestId('promo-bubble');
    await expect(bubble.getByTestId('promo-fallback')).toBeVisible();
    await expect(circles(page).getByRole('link', { name: 'Anillos' }).getByTestId('cover-placeholder')).toHaveText('A');
    await bubble.click();
    await expect(page).toHaveURL(/\/promociones$/);
  });

  test('promoción de tienda (muchos productos): una sola burbuja y sin conteo de productos', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW({ promo_count: 257 }) });
    await page.goto('/');
    await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(1);
    await expect(circles(page)).not.toContainText('257');
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('ScrollRow: círculos (escritorio)', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

  test('flechas: aparecen según el desbordamiento y desplazan la fila', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    const next = circles(page).getByRole('button', { name: 'Colecciones: siguiente' });
    const prev = circles(page).getByRole('button', { name: 'Colecciones: anterior' });
    await expect(next).toBeVisible();
    await expect(prev).toHaveCount(0);
    expect(await scrollLeft(list(page))).toBe(0);

    await next.click();
    await expect.poll(() => scrollLeft(list(page))).toBeGreaterThan(100);
    await expect(prev).toBeVisible();
    // hasta el final: Siguiente desaparece y el foco no se pierde
    for (let i = 0; i < 6 && (await next.count()); i++) {
      await next.click({ timeout: 1500 }).catch(() => undefined); // puede desaparecer a mitad de animación
      await page.waitForTimeout(450);
    }
    await expect(next).toHaveCount(0);
    await expect(prev).toBeVisible();
    await expect(prev).toBeFocused();
    await prev.click();
    await expect.poll(() => scrollLeft(list(page))).toBeGreaterThanOrEqual(0);
    // la página nunca gana scroll horizontal
    const { sw, iw } = await pageOverflow(page);
    expect(sw).toBeLessThanOrEqual(iw);
  });

  test('prefers-reduced-motion: la flecha desplaza sin animación', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    await circles(page).getByRole('button', { name: 'Colecciones: siguiente' }).click();
    // sin animación el salto es inmediato (con "smooth" tardaría varios cuadros)
    await expect.poll(() => scrollLeft(list(page)), { timeout: 150, intervals: [30] }).toBeGreaterThan(100);
  });

  test('con pocas colecciones no hay flechas ni degradados', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { cats: 3 });
    await page.goto('/');
    await expect(circles(page).getByRole('link')).toHaveCount(3);
    await expect(circles(page).getByRole('button')).toHaveCount(0);
    expect(await list(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test('teclado: Tab hasta un círculo oculto lo trae a la vista; las flechas se activan con Enter', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    const nav = circles(page);
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(10);
    await links.first().focus();
    for (let i = 0; i < 9; i++) await page.keyboard.press('Tab');
    await expect(links.last()).toBeFocused();
    expect(await scrollLeft(list(page))).toBeGreaterThan(50);
    const inView = await links.last().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const u = el.closest('ul')!.getBoundingClientRect();
      return r.left >= u.left - 1 && r.right <= u.right + 1;
    });
    expect(inView).toBe(true);

    await page.goto('/');
    const next = nav.getByRole('button', { name: 'Colecciones: siguiente' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => scrollLeft(list(page))).toBeGreaterThan(100);
    // el foco visible de la flecha
    const outline = await nav.getByRole('button', { name: 'Colecciones: anterior' }).count();
    expect(outline).toBe(1);
  });

  test('rueda: el scroll horizontal desplaza la fila; la vertical sigue desplazando la PÁGINA', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    const ul = list(page);
    await ul.scrollIntoViewIfNeeded();
    const box = (await ul.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y0);
    expect(await scrollLeft(ul)).toBe(0);
    const box2 = (await ul.boundingBox())!;
    if (box2.y > 0 && box2.y < 700) {
      await page.mouse.move(box2.x + box2.width / 2, box2.y + 40);
      await page.mouse.wheel(300, 0);
      await expect.poll(() => scrollLeft(ul)).toBeGreaterThan(0);
    } else {
      await ul.evaluate((el) => el.scrollBy(300, 0));
      expect(await scrollLeft(ul)).toBeGreaterThan(0);
    }
  });

  test('arrastre con ratón desplaza sin navegar; un clic limpio sí navega', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    const ul = list(page);
    await ul.scrollIntoViewIfNeeded();
    const link = circles(page).getByRole('link', { name: 'Pulseras' });
    const b = (await link.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + 50;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x - i * 25, y);
    await page.mouse.up();
    expect(await scrollLeft(ul)).toBeGreaterThan(100);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await circles(page).getByRole('link', { name: 'Dijes' }).click();
    await expect(page).toHaveURL(/\/coleccion\/dijes$/);
  });

  for (const w of [360, 412, 768, 1280]) {
    test(`sin scroll horizontal de la página a ${w}px (con burbuja y filas)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await stub(page, { promo: PROMO_ROW() });
      for (const url of ['/', '/catalogo', '/coleccion/anillos']) {
        await page.goto(url);
        await expect(circles(page).getByTestId('promo-bubble')).toBeVisible();
        if (url === '/') await expect(page.getByRole('button', { name: 'Ver Pieza 8' })).toHaveCount(1);
        const { sw, iw } = await pageOverflow(page);
        expect(sw, `${url} a ${w}px`).toBeLessThanOrEqual(iw);
        const tops = await circles(page).getByRole('link').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
        expect(tops, 'una sola fila').toBe(1);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
test.describe('ScrollRow: filas de productos en Home (escritorio)', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

  test('Novedades (8) desliza con flechas; Promociones (4) cabe sin flechas; todo en una fila', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Novedades: siguiente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Promociones: siguiente' })).toHaveCount(0);
    const tops = await page.locator('section', { has: page.getByRole('heading', { name: 'Novedades' }) }).locator('article').evaluateAll(
      (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size
    );
    expect(tops).toBe(1);
    const row = page.locator('section', { has: page.getByRole('heading', { name: 'Novedades' }) }).locator('[data-scrollrow] ul');
    await page.getByRole('button', { name: 'Novedades: siguiente' }).click();
    await expect.poll(() => scrollLeft(row)).toBeGreaterThan(200);
    const { sw, iw } = await pageOverflow(page);
    expect(sw).toBeLessThanOrEqual(iw);
  });

  test('arrastrar una tarjeta no abre el producto; un clic sí', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    const row = page.locator('section', { has: page.getByRole('heading', { name: 'Novedades' }) }).locator('[data-scrollrow] ul');
    await row.scrollIntoViewIfNeeded();
    const b = (await row.getByRole('button', { name: 'Ver Pieza 3' }).boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x - i * 30, y);
    await page.mouse.up();
    expect(await scrollLeft(row)).toBeGreaterThan(100);
    await expect(page).not.toHaveURL(/producto=/);
    await row.getByRole('button', { name: 'Ver Pieza 8' }).click();
    await expect(page).toHaveURL(/producto=/);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('ScrollRow: táctil (móvil)', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'solo móvil'));

  test('swipe desplaza la fila de círculos; sin flechas y sin scroll de página', async ({ page }) => {
    await stub(page, { promo: PROMO_ROW() });
    await page.goto('/');
    const ul = list(page);
    await expect(circles(page).getByTestId('promo-bubble')).toBeVisible();
    // La fila queda en el centro de la pantalla: abajo a la derecha está el botón flotante de WhatsApp y taparía el gesto
    await ul.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    // táctil: sin flechas
    await expect(circles(page).getByRole('button')).toBeHidden();
    const b = (await ul.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    // Gesto táctil real: touchStart, varios touchMove y touchEnd (Chromium lo convierte en scroll con inercia)
    const x0 = Math.round(b.x + b.width - 40);
    const y0 = Math.round(b.y + 40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 20, y: y0 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => scrollLeft(ul), { timeout: 5000 }).toBeGreaterThan(80);
    const { sw, iw } = await pageOverflow(page);
    expect(sw).toBeLessThanOrEqual(iw);
    // computed: snap y sin rebote hacia atrás del navegador
    const st = await ul.evaluate((el) => ({ snap: getComputedStyle(el).scrollSnapType, ob: getComputedStyle(el).overscrollBehaviorX }));
    expect(st.snap).toContain('x');
    expect(st.ob).toBe('contain');
  });
});
