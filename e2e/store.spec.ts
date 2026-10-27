import { test as base, expect, type Page } from '@playwright/test';

// El modal de registro VIP aparece a los 2 s a visitantes nuevos: se marca como ya registrado
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

/** Pedidos: se intercepta create_order para no escribir en la base de producción. */
async function stubCreateOrder(page: Page) {
  await page.route('**/rest/v1/rpc/create_order', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        order_id: '00000000-0000-0000-0000-000000000001',
        total: 123000,
        lines: [{ product_id: 'x', name: 'Producto Prueba', variant: null, qty: 1, unit_price: 123000, line_total: 123000 }],
      }),
    })
  );
}

test('home carga con menú, carrusel y sin errores de consola', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Exotic Joyería, ir al inicio' })).toBeVisible();
  await expect(page.getByLabel('Destacados')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nuestras colecciones' })).toBeVisible();
  if (info.project.name === 'desktop') {
    const main = page.getByRole('navigation', { name: 'Principal' });
    await expect(main.getByRole('button', { name: 'Catálogo' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Promociones' })).toBeVisible();
    // sin scroll horizontal
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('colección: precios de menor a mayor y paginación en la URL', async ({ page }) => {
  await page.goto('/coleccion/insumos');
  await expect(page.getByRole('heading', { level: 1, name: 'Insumos' })).toBeVisible();
  await expect(page.locator('article').first()).toBeVisible();
  const prices = await page.locator('article p span.font-semibold').allInnerTexts();
  const nums = prices.map((p) => parseInt(p.replace(/\D/g, ''), 10));
  expect(nums.length).toBeGreaterThan(5);
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page).toHaveURL(/page=2/);
});

test('colección desconocida muestra 404 amistoso', async ({ page }) => {
  await page.goto('/coleccion/no-existe-xyz');
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
});

test('búsqueda lleva a resultados', async ({ page }) => {
  await page.goto('/buscar?q=anillo');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('anillo');
  await expect(page.locator('article').first()).toBeVisible();
});

test('compra al detal: crea el pedido en el servidor y abre WhatsApp con el total del servidor', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user_name', 'Cliente Prueba');
    localStorage.setItem('user_whatsapp', '3001234567');
  });
  await stubCreateOrder(page);
  await page.goto('/coleccion/insumos');
  const card = page.locator('article').filter({ has: page.getByRole('button', { name: 'Añadir', exact: true }) }).first();
  await card.getByRole('button', { name: 'Añadir', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Carrito de compras' });
  await expect(drawer).toBeVisible();

  const reqPromise = page.waitForRequest('**/rest/v1/rpc/create_order');
  const popupPromise = context.waitForEvent('page');
  await drawer.getByRole('button', { name: 'Pedir por WhatsApp' }).click();

  const req = (await reqPromise).postDataJSON();
  expect(req.p_channel).toBe('retail');
  // nunca se mandan precios al servidor
  expect(JSON.stringify(req.p_lines)).not.toMatch(/price|unit/i);

  const popup = await popupPromise;
  await popup.waitForURL(/wa\.me|whatsapp/, { timeout: 10_000 }).catch(() => undefined);
  expect(decodeURIComponent(popup.url())).toContain('$');
  expect(decodeURIComponent(popup.url())).toContain('123.000');
});

test('error del servidor se muestra en español y no abre WhatsApp', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user_name', 'Cliente Prueba');
    localStorage.setItem('user_whatsapp', '3001234567');
  });
  await page.route('**/rest/v1/rpc/create_order', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'OUT_OF_STOCK:Anillo', code: 'P0001' }) })
  );
  await page.goto('/coleccion/insumos');
  await page.locator('article').getByRole('button', { name: 'Añadir', exact: true }).first().click();
  await page.getByRole('button', { name: 'Pedir por WhatsApp' }).click();
  await expect(page.getByRole('alert')).toContainText('No hay stock suficiente');
});

test('zona mayorista: sin sesión solo ve el acceso y ningún precio mayorista', async ({ page }) => {
  await page.goto('/mayoristas');
  await expect(page.getByRole('heading', { name: 'Precios para mayoristas' })).toBeVisible();
  await expect(page.getByLabel('Correo')).toBeVisible();
  await expect(page.getByText('Pedido mínimo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Añadir', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page.getByLabel('Nombre del negocio')).toBeVisible();
});

test('menú móvil abre con colecciones en el acordeón de Catálogo', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'solo móvil');
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const menu = page.getByRole('dialog', { name: 'Menú' });
  const acordeon = menu.getByRole('button', { name: 'Catálogo' });
  await expect(acordeon).toHaveAttribute('aria-expanded', 'false');
  await acordeon.click();
  await expect(acordeon).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('link', { name: 'Ver todo el catálogo' })).toBeVisible();
  await menu.getByRole('link', { name: 'Anillos' }).click();
  await expect(page).toHaveURL(/coleccion\/anillos/);
});
