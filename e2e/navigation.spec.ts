import { test as base, expect, type Page } from '@playwright/test';

/**
 * Colecciones, menú principal, /promociones y enlace profundo ?producto=.
 * Todo Supabase se simula: no depende de datos en vivo ni escribe en producción.
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const CAT_ANILLOS = uuid(1);
const CAT_INSUMOS = uuid(2);
const ID_PROMO = uuid(101);
const ID_PLAIN = uuid(102);
const ID_SOLD = uuid(103);
const ID_MISSING = uuid(999);

const CATEGORIES = [
  { id: CAT_ANILLOS, slug: 'anillos', name: 'Anillos', sort_order: 1, is_active: true, image: null },
  { id: CAT_INSUMOS, slug: 'insumos', name: 'Insumos', sort_order: 2, is_active: true, image: null },
];

const row = (id: string, name: string, cat: string, catName: string, stock: number, promo = false) => ({
  id,
  name,
  price: '$100.000',
  price_cop: 100000,
  effective_price_cop: promo ? 80000 : 100000,
  promo_kind: promo ? 'percent' : null,
  promo_value: promo ? 20 : null,
  category: catName,
  category_id: cat,
  stock,
  description: 'Pieza de prueba',
  variants: [],
  images: [],
  created_at: '2025-01-01T00:00:00Z',
});

const PRODUCTS = [
  row(ID_PROMO, 'Anillo Alfa', CAT_ANILLOS, 'Anillos', 5, true),
  row(ID_PLAIN, 'Anillo Beta', CAT_ANILLOS, 'Anillos', 5),
  row(ID_SOLD, 'Insumo Gamma', CAT_INSUMOS, 'Insumos', 0),
];

interface Stub {
  /** Cuerpos recibidos por catalog_retail */
  rpcCalls: Record<string, unknown>[];
}

// Playwright da prioridad a la ruta registrada al final: primero las genéricas, al último las específicas
async function stubStore(page: Page, opts: { noPromos?: boolean } = {}): Promise<Stub> {
  const stub: Stub = { rpcCalls: [] };
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/catalog_retail', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    stub.rpcCalls.push(body);
    let rows = PRODUCTS.filter((p) => (!body.p_category || p.category_id === body.p_category) && (!body.p_id || p.id === body.p_id));
    if (body.p_promo_only) rows = opts.noPromos ? [] : rows.filter((p) => p.promo_kind);
    if (body.p_in_stock) rows = rows.filter((p) => p.stock > 0);
    if (body.p_search) rows = rows.filter((p) => p.name.toLowerCase().includes(String(body.p_search).toLowerCase()));
    return route.fulfill({ json: rows.map((r) => ({ ...r, total_count: rows.length })) });
  });
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop()!;
    if (req.method() !== 'GET') return route.fulfill({ status: 200, json: [] });
    if (table === 'categories') return route.fulfill({ json: CATEGORIES });
    if (table === 'products') {
      const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
      const found = PRODUCTS.filter((p) => p.id === id);
      const single = (req.headers()['accept'] ?? '').includes('object+json');
      if (single && found.length === 0) return route.fulfill({ status: 406, json: { message: 'no rows', code: 'PGRST116' } });
      return route.fulfill({ json: single ? found[0] : found });
    }
    return route.fulfill({ json: [] });
  });
  return stub;
}

test.describe('redirección /categoria -> /coleccion', () => {
  test('conserva query y hash', async ({ page }) => {
    await stubStore(page);
    await page.goto('/categoria/anillos?orden=precio_asc&page=2#resultados');
    await expect(page).toHaveURL(/\/coleccion\/anillos\?orden=precio_asc&page=2#resultados$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Anillos' })).toBeVisible();
  });

  test('slug inválido muestra 404 sin redirigir', async ({ page }) => {
    await stubStore(page);
    await page.goto('/categoria/Anillos_X');
    await expect(page).toHaveURL(/\/categoria\/Anillos_X$/);
    await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
  });
});

test.describe('enlace profundo ?producto=', () => {
  test('clic abre el modal, conserva parámetros, Atrás lo cierra y devuelve el foco', async ({ page }) => {
    const stub = await stubStore(page);
    await page.goto('/coleccion/anillos?orden=newest&stock=1');
    const card = page.getByRole('button', { name: 'Ver Anillo Beta' });
    await card.click();
    await expect(page.getByRole('dialog', { name: 'Anillo Beta' })).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('producto')).toBe(ID_PLAIN);
    expect(url.searchParams.get('orden')).toBe('newest');
    expect(url.searchParams.get('stock')).toBe('1');

    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Anillo Beta' })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has('producto')).toBe(false);
    await expect(card).toBeFocused();

    // abrir y cerrar el modal no vuelve a pedir el catálogo
    const before = stub.rpcCalls.length;
    await card.click();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Anillo Beta' })).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(stub.rpcCalls.length).toBe(before);
  });

  test('enlace directo abre el modal con el producto', async ({ page }) => {
    await stubStore(page);
    await page.goto(`/coleccion/anillos?page=1&producto=${ID_PROMO}`);
    const dialog = page.getByRole('dialog', { name: 'Anillo Alfa' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/80.000/);
  });

  test('producto agotado abre el modal con "Agotado"', async ({ page }) => {
    await stubStore(page);
    await page.goto(`/?producto=${ID_SOLD}`);
    const dialog = page.getByRole('dialog', { name: 'Insumo Gamma' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Agotado');
  });

  test('uuid inválido o inexistente se ignora y se quita el parámetro', async ({ page }) => {
    await stubStore(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const bad of ['no-es-uuid', ID_MISSING]) {
      await page.goto(`/coleccion/anillos?orden=newest&producto=${bad}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Anillos' })).toBeVisible();
      await expect(page).not.toHaveURL(/producto=/);
      await expect(page).toHaveURL(/orden=newest/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
});

test('cambiar el orden con el modal abierto quita ?producto', async ({ page }) => {
  await stubStore(page);
  await page.goto('/coleccion/anillos');
  await page.getByRole('button', { name: 'Ver Anillo Beta' }).click();
  await expect(page).toHaveURL(/producto=/);
  // el modal tapa los controles: se navega con la URL actual para simular el cambio de orden desde la UI
  await page.evaluate(() => document.body.style.setProperty('overflow', ''));
  await page.getByRole('combobox', { name: 'Ordenar por' }).evaluate((el: HTMLSelectElement) => {
    el.value = 'name';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page).not.toHaveURL(/producto=/);
  await expect(page).toHaveURL(/orden=name/);
  await expect(page.getByRole('dialog', { name: 'Anillo Beta' })).toHaveCount(0);
});

test.describe('/promociones', () => {
  test('solo ofertas, sin control "Solo promociones" y ?promo=0 se ignora', async ({ page }) => {
    const stub = await stubStore(page);
    await page.goto('/promociones?promo=0');
    await expect(page.getByRole('heading', { level: 1, name: 'Promociones' })).toBeVisible();
    await expect(page).toHaveTitle(/Promociones \| Exotic Joyería/);
    await expect(page.getByRole('button', { name: 'Ver Anillo Alfa' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver Anillo Beta' })).toHaveCount(0);
    await expect(page.getByLabel('En promoción')).toHaveCount(0);
    expect(stub.rpcCalls.every((c) => c.p_promo_only === true)).toBe(true);
  });

  test('sin ofertas muestra el mensaje vacío', async ({ page }) => {
    await stubStore(page, { noPromos: true });
    await page.goto('/promociones');
    await expect(page.getByText('Aún no hay promociones activas')).toBeVisible();
  });

  test('Home enlaza "Ver todas" a /promociones', async ({ page }) => {
    await stubStore(page);
    await page.goto('/');
    await page.getByRole('link', { name: /Ver todas/ }).click();
    await expect(page).toHaveURL(/\/promociones$/);
  });
});

test.describe('menú principal (escritorio)', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'desktop', 'solo escritorio');
  });

  test('un solo landmark Principal, sin "Categorías" y estado activo de Catálogo', async ({ page }) => {
    await stubStore(page);
    await page.goto('/coleccion/anillos');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole('link')).toHaveText(['Inicio', 'Mayorista', 'Emprendedor']);
    await expect(page.getByRole('link', { name: /categor[ií]as/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /categor[ií]as/i })).toHaveCount(0);
    const btn = nav.getByRole('button', { name: 'Catálogo' });
    await expect(btn).toHaveClass(/border-gold-dark/);
    await expect(btn).not.toHaveAttribute('aria-haspopup', /.*/);
    await page.goto('/promociones');
    await expect(nav.getByRole('button', { name: 'Catálogo' })).not.toHaveClass(/border-gold-dark/);
    await expect(nav.getByRole('link', { name: 'Promociones' })).toHaveCount(0);
    await page.goto('/mayoristas');
    await expect(nav.getByRole('link', { name: 'Inicio' })).not.toHaveClass(/border-gold-dark/);
  });

  test('disclosure: clic, Escape devuelve el foco, clic fuera y cambio de ruta lo cierran', async ({ page }) => {
    await stubStore(page);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    const btn = nav.getByRole('button', { name: 'Catálogo' });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-controls', 'menu-catalogo');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const links = page.locator('#menu-catalogo').getByRole('link');
    await expect(links).toHaveText(['Ver todo el catálogo', 'Anillos', 'Insumos']);

    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();

    // clic fuera
    await btn.click();
    await page.mouse.click(10, 400);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    // cambio de ruta
    await btn.click();
    await links.nth(1).click();
    await expect(page).toHaveURL(/\/coleccion\/anillos$/);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('teclado: Enter abre, Tab entra al panel, Escape vuelve al botón', async ({ page }) => {
    await stubStore(page);
    await page.goto('/');
    const btn = page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Catálogo' });
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('#menu-catalogo').getByRole('link', { name: 'Ver todo el catálogo' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();
    // Tab fuera del contenedor cierra
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('con muchas colecciones el panel hace scroll interno', async ({ page }) => {
    await stubStore(page);
    await page.route('**/rest/v1/categories*', (route) =>
      route.fulfill({
        json: Array.from({ length: 40 }, (_, i) => ({ id: uuid(500 + i), slug: `col-${i}`, name: `Colección ${i}`, sort_order: i, is_active: true, image: null })),
      })
    );
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Catálogo' }).click();
    const panel = page.locator('#menu-catalogo');
    await expect(panel).toBeVisible();
    const m = await panel.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, ih: window.innerHeight }));
    expect(m.sh).toBeGreaterThan(m.ch);
    expect(m.ch).toBeLessThanOrEqual(m.ih);
  });
});

test.describe('menú móvil', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'mobile', 'solo móvil');
  });

  test('ítems, acordeón, focus trap, fondo inerte y foco al cerrar', async ({ page }) => {
    await stubStore(page);
    await page.goto('/');
    const opener = page.getByRole('button', { name: 'Abrir menú' });
    await opener.click();
    const menu = page.getByRole('dialog', { name: 'Menú' });
    await expect(menu.getByRole('link')).toContainText(['Inicio']);
    await expect(menu.getByRole('link', { name: 'Mayorista' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Emprendedor' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Promociones' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /categor[ií]as/i })).toHaveCount(0);

    const acordeon = menu.getByRole('button', { name: 'Catálogo' });
    await expect(acordeon).toHaveAttribute('aria-controls', 'drawer-catalogo');
    await expect(acordeon).toHaveAttribute('aria-expanded', 'false');
    await acordeon.click();
    await expect(acordeon).toHaveAttribute('aria-expanded', 'true');
    await expect(page).toHaveURL(/\/$/); // el acordeón no navega
    await expect(page.locator('#drawer-catalogo').getByRole('link')).toHaveText(['Ver todo el catálogo', 'Anillos', 'Insumos']);

    // fondo inerte
    await expect(page.locator('#root')).toHaveAttribute('inert', '');

    // el foco nunca sale del menú
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Menú"]'))).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Menú"]'))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
    await expect(opener).toBeFocused();
  });

  test('Atrás del navegador cierra el menú', async ({ page }) => {
    await stubStore(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('link', { name: 'Emprendedor' }).click();
    await expect(page).toHaveURL(/\/emprendedor$/);
    await expect(page.getByRole('dialog', { name: 'Menú' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('dialog', { name: 'Menú' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog', { name: 'Menú' })).toHaveCount(0);
  });
});
