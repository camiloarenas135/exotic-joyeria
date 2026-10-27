import { test as base, expect, type Page } from '@playwright/test';

/** Círculos de colecciones. TODO Supabase está simulado (sin datos reales). */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const NAMES = ['Anillos', 'Pulseras', 'Collares', 'Aretes', 'Dijes', 'Relojes', 'Cadenas', 'Conjuntos de novia con nombre largo', 'Insumos'];
const CATEGORIES = NAMES.map((name, i) => ({
  id: uuid(i + 1),
  slug: name.toLowerCase().split(' ')[0],
  name,
  sort_order: i + 1,
  is_active: true,
  image: null,
}));
// Las dos últimas no tienen portada (placeholder)
const svg = (c: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#3a2f0b"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="120" cy="120" r="44" fill="none" stroke="#fff" stroke-width="10"/></svg>`)}`;
const COLORS = ['#d4af37', '#b76e79', '#7a8fa6', '#6b8f71', '#c9a227', '#8b6f14', '#a35d6a'];
const COVERS = CATEGORIES.slice(0, 7).map((c, i) => ({ category_id: c.id, image: svg(COLORS[i]) }));

async function stub(page: Page, opts: { coversFail?: boolean } = {}) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === 'collection_covers') {
      return opts.coversFail
        ? route.fulfill({ status: 500, json: { message: 'boom' } })
        : route.fulfill({ json: [...COVERS, { category_id: CATEGORIES[7].id, image: null }, { category_id: CATEGORIES[8].id, image: null }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = table === 'categories' ? CATEGORIES : [];
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

const pageOverflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

test.describe('CollectionCircles', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba');
  });

  test('home: círculos con enlace, portada del stub y monograma sin foto', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Colecciones' });
    await expect(nav.getByRole('link')).toHaveCount(CATEGORIES.length);
    await expect(nav.getByRole('link', { name: 'Anillos' })).toHaveAttribute('href', '/coleccion/anillos');
    await expect(nav.getByRole('link', { name: 'Insumos' })).toHaveAttribute('href', '/coleccion/insumos');
    const img = nav.getByRole('link', { name: 'Anillos' }).locator('img');
    await expect(img).toHaveAttribute('src', COVERS[0].image);
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(nav.getByTestId('cover-placeholder')).toHaveCount(2);
    await expect(nav.getByTestId('cover-placeholder').first()).toHaveText('C');
    // círculo de verdad y target >= 44px
    const box = await nav.getByRole('link', { name: 'Anillos' }).locator('span').first().boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(112);
    expect(Math.round(box!.width)).toBe(Math.round(box!.height));
    // en escritorio todo cabe sin scroll interno
    const inner = await nav.locator('ul').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(inner).toBe(true);
    if (process.env.SHOT_DIR) await page.locator('section', { has: nav }).screenshot({ path: `${process.env.SHOT_DIR}/home-1280.png` });
  });

  for (const w of [360, 412, 768]) {
    test(`sin scroll horizontal de la página a ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await stub(page);
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Colecciones' });
      await expect(nav.getByRole('link')).toHaveCount(CATEGORIES.length);
      await expect(nav.locator('img').first()).toBeVisible();
      const { sw, iw } = await pageOverflow(page);
      expect(sw).toBeLessThanOrEqual(iw);
      if (w < 1024) {
        // el carrusel sí desplaza dentro de su contenedor
        const scrollable = await nav.locator('ul').evaluate((el) => el.scrollWidth > el.clientWidth);
        if (w <= 412) expect(scrollable).toBe(true);
      }
      if (process.env.SHOT_DIR && w === 360) {
        await nav.scrollIntoViewIfNeeded();
        await page.locator('section', { has: nav }).screenshot({ path: `${process.env.SHOT_DIR}/home-360.png` });
      }
    });
  }

  test('foco por teclado visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/');
    const link = page.getByRole('navigation', { name: 'Colecciones' }).getByRole('link', { name: 'Pulseras' });
    await expect(link).toBeVisible();
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    const outline = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('si falla la RPC de portadas, caen al monograma sin romper', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 800 });
    await stub(page, { coversFail: true });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Colecciones' });
    await expect(nav.getByTestId('cover-placeholder')).toHaveCount(CATEGORIES.length);
    await expect(nav.getByRole('link', { name: 'Anillos' })).toBeVisible();
  });

  test('/catalogo muestra los círculos; /coleccion/:slug resalta la actual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/catalogo');
    const nav = page.getByRole('navigation', { name: 'Colecciones' });
    await expect(nav.getByRole('link')).toHaveCount(CATEGORIES.length);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    await nav.getByRole('link', { name: 'Aretes' }).click();
    await expect(page).toHaveURL(/\/coleccion\/aretes$/);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: 'Aretes' })).toHaveAttribute('aria-current', 'page');
    const { sw, iw } = await pageOverflow(page);
    expect(sw).toBeLessThanOrEqual(iw);
  });
});
