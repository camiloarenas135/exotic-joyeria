import { test as base, expect } from '@playwright/test';
import { newWorld, stubWholesaleWorld, captureWindowOpen, uuid } from './helpers/wholesale';

/** "Mis pedidos" del mayorista y envío del token de Turnstile en login / recuperación. Supabase simulado. */
const test = base.extend({});

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba');
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('tok-'+Math.random().toString(36).slice(2))},20);return 'w'},remove:function(){},reset:function(){}};",
    })
  );
});

const order = (n: number, status: string, total: number) => ({
  id: uuid(500 + n), created_at: `2026-10-${String(10 + n).padStart(2, '0')}T15:00:00Z`, status, total_cop: total, total_count: 25,
  lines: [{ name: 'Cadena Cubana', variant: n % 2 ? 'Dorado' : null, qty: 2, unit_price: total / 2, line_total: total }],
});

test.describe('Mis pedidos', () => {
  test('lista los pedidos con su estado y el detalle', async ({ page }) => {
    const world = newWorld({ orders: [order(1, 'pending', 3_600_000), order(2, 'confirmed', 4_000_000), order(3, 'cancelled', 3_500_000)] });
    await page.setViewportSize({ width: 412, height: 900 });
    await captureWindowOpen(page);
    await stubWholesaleWorld(page, world);
    await page.goto('/mayoristas/pedidos');
    await expect(page.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeVisible();
    const items = page.getByTestId('my-orders').getByRole('listitem').filter({ hasText: 'unidades' });
    await expect(items).toHaveCount(3);
    await expect(page.getByText('En revisión')).toBeVisible();
    await expect(page.getByText('Confirmado')).toBeVisible();
    await expect(page.getByText('Cancelado')).toBeVisible();
    await items.first().getByText('unidades').click();
    await expect(items.first().getByText(/2 × Cadena Cubana/)).toBeVisible();
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.iw);
  });

  test('sin pedidos muestra el mensaje vacío', async ({ page }) => {
    const world = newWorld({ orders: [] });
    await stubWholesaleWorld(page, world);
    await page.goto('/mayoristas/pedidos');
    await expect(page.getByTestId('no-orders')).toBeVisible();
  });

  test('quien no es mayorista aprobado vuelve a /mayoristas y no consulta pedidos', async ({ page }) => {
    const world = newWorld({ status: 'pending' });
    await stubWholesaleWorld(page, world);
    await page.goto('/mayoristas/pedidos');
    await expect(page).toHaveURL(/\/mayoristas$/);
    expect(world.calls.myOrders).toBe(0);
  });

  test('sin sesión vuelve a /mayoristas', async ({ page }) => {
    const world = newWorld({ session: false, status: null });
    await stubWholesaleWorld(page, world);
    await page.goto('/mayoristas/pedidos');
    await expect(page).toHaveURL(/\/mayoristas$/);
    expect(world.calls.myOrders).toBe(0);
  });

  test('el menú de cuenta tiene el enlace a Mis pedidos', async ({ page }) => {
    const world = newWorld();
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubWholesaleWorld(page, world);
    await page.goto('/');
    await page.getByRole('button', { name: 'Cuenta mayorista' }).click();
    await page.getByRole('link', { name: 'Mis pedidos' }).click();
    await expect(page).toHaveURL(/\/mayoristas\/pedidos$/);
  });
});

test.describe('Turnstile en login y recuperación', () => {
  // Estas pruebas necesitan la clave pública en el build (VITE_TURNSTILE_SITE_KEY en .env)
  test('el login envía el token de Turnstile a Supabase', async ({ page }) => {
    const world = newWorld({ session: false, status: null });
    await page.setViewportSize({ width: 412, height: 900 });
    await stubWholesaleWorld(page, world);
    await page.goto('/mayoristas/acceso');
    await page.getByLabel('Correo').fill('negocio@ejemplo.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-segura-1');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect.poll(() => world.calls.login.length).toBe(1);
    const sent = world.calls.login[0] as { gotrue_meta_security?: { captcha_token?: string } };
    expect(sent.gotrue_meta_security?.captcha_token).toMatch(/^tok-/);
  });

  test('Olvidé mi contraseña envía el token de Turnstile', async ({ page }) => {
    const world = newWorld({ session: false, status: null });
    await stubWholesaleWorld(page, world);
    await page.goto('/mayoristas/acceso');
    await page.getByRole('button', { name: 'Olvidé', exact: true }).click();
    await page.getByLabel('Correo').fill('negocio@ejemplo.com');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect.poll(() => world.calls.recover).toBe(1);
    const sent = world.calls.recoverBodies[0] as { gotrue_meta_security?: { captcha_token?: string } };
    expect(sent.gotrue_meta_security?.captcha_token).toMatch(/^tok-/);
  });
});
