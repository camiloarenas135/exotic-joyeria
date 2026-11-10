import { test as base, expect, type Page } from '@playwright/test';
import { newWorld, stubWholesaleWorld, captureWindowOpen, type World } from './helpers/wholesale';

/**
 * Cuenta Emprendedor y stock por variante en la tienda. TODO Supabase está simulado.
 * Cubre: elegir tipo al registrarse, mínimo propio de cada tipo, y topes por variante cuando el modo está encendido.
 */
const test = base.extend({});

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba');
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('tok')},20);return 'w'},remove:function(){},reset:function(){}};",
    })
  );
});

async function open(page: Page, world: World, url: string, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await captureWindowOpen(page);
  await stubWholesaleWorld(page, world);
  await page.goto(url);
}

const cardOf = (page: Page, name: string) => page.locator('article', { hasText: name });

async function fillRegistration(page: Page) {
  await page.getByLabel('Correo').fill('nuevo@ejemplo.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('12345678');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Nombre del negocio').fill('Joyas del Valle');
  await page.getByLabel('Ciudad').fill('Cali');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('textbox', { name: 'WhatsApp' }).fill('3001234567');
  await page.getByRole('button', { name: 'Solicitar acceso' }).click();
  await expect(page.getByRole('status')).toContainText('Recibimos tu solicitud');
}

test.describe('registro con tipo de cuenta', () => {
  test('desde /emprendedor llega con "Emprendedor" elegido y signUp pide ese tipo', async ({ page }) => {
    const world = newWorld({ session: false, status: null, entrepreneurMin: 600_000 });
    await open(page, world, '/emprendedor');
    await expect(page.getByTestId('entrepreneur-min')).toContainText(/600\.000/);
    const cta = page.getByRole('link', { name: 'Solicitar cuenta de emprendedor' });
    await expect(cta).toHaveAttribute('href', '/mayoristas/acceso?tab=registro&tipo=emprendedor');
    await cta.click();
    await expect(page.getByRole('radio', { name: /Emprendedor/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Mayorista/ })).not.toBeChecked();
    await fillRegistration(page);
    expect(world.calls.signup).toHaveLength(1);
    const sent = world.calls.signup[0] as { data: Record<string, string> };
    expect(sent.data).toMatchObject({ signup_type: 'wholesale', requested_account_type: 'entrepreneur' });
  });

  test('sin tipo en la URL es Mayorista; se puede cambiar antes de enviar', async ({ page }) => {
    const world = newWorld({ session: false, status: null });
    await open(page, world, '/mayoristas/acceso?tab=registro');
    await expect(page.getByRole('radio', { name: /Mayorista/ })).toBeChecked();
    await expect(page.getByText(/Pedido mínimo.*3\.500\.000/)).toBeVisible();
    await expect(page.getByText(/Pedido mínimo.*500\.000/).first()).toBeVisible();
    await page.getByRole('radio', { name: /Emprendedor/ }).check();
    await fillRegistration(page);
    expect((world.calls.signup[0] as { data: Record<string, string> }).data.requested_account_type).toBe('entrepreneur');
  });

  test('cuenta ya existente sin solicitud: request_wholesale_access manda el tipo elegido', async ({ page }) => {
    const world = newWorld({ status: null });
    await open(page, world, '/mayoristas/acceso?tipo=emprendedor');
    await expect(page.getByRole('radio', { name: /Emprendedor/ })).toBeChecked();
    await page.getByLabel('Nombre del negocio').fill('Mi Negocio');
    await page.getByLabel('Ciudad').fill('Bogotá');
    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('3001234567');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByRole('heading', { name: 'Tu solicitud está en revisión' })).toBeVisible();
    expect(world.calls.requestAccess[0]).toMatchObject({ p_account_type: 'entrepreneur' });
  });
});

test.describe('cuenta aprobada según su tipo', () => {
  test('emprendedor: la barra usa SU mínimo, no el mayorista; el pedido se identifica como de emprendedor', async ({ page }) => {
    const world = newWorld({ accountType: 'entrepreneur', min: 3_500_000, entrepreneurMin: 650_000 });
    await open(page, world, '/catalogo');
    const bar = page.getByTestId('min-order-bar');
    await expect(bar).toContainText(/650\.000/);
    await expect(bar).not.toContainText(/3\.500\.000/);
    await page.getByRole('button', { name: /Abrir mi pedido/ }).click();
    await expect(page.getByRole('dialog', { name: 'Mi pedido emprendedor' })).toBeVisible();
  });

  test('mayorista: sigue con su mínimo de siempre y el mismo nombre del pedido', async ({ page }) => {
    const world = newWorld({ accountType: 'wholesale', min: 3_500_000, entrepreneurMin: 650_000 });
    await open(page, world, '/catalogo');
    await expect(page.getByTestId('min-order-bar')).toContainText(/3\.500\.000/);
    await page.getByRole('button', { name: /Abrir mi pedido/ }).click();
    await expect(page.getByRole('dialog', { name: 'Mi pedido mayorista' })).toBeVisible();
  });
});

test.describe('stock por variante encendido', () => {
  test('mayorista: cada opción tiene su tope, el agotado no se puede pedir', async ({ page }) => {
    const world = newWorld({ variantStock: true, vstock: { '40cm x 1.5mm': 3, '50cm x 1.5mm': 0 } });
    await open(page, world, '/catalogo');
    await cardOf(page, 'Candonga').getByRole('button', { name: 'Elegir cantidades' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candonga con variantes' });
    const rows = dialog.getByTestId('wholesale-row');
    await expect(rows.first().getByTestId('row-stock')).toContainText('Disponible: 3');
    await expect(rows.nth(1).getByTestId('row-stock')).toContainText('Agotado');
    const plus = dialog.getByRole('button', { name: 'Aumentar 40cm x 1.5mm' });
    for (let i = 0; i < 5; i++) if (await plus.isEnabled()) await plus.click();
    await expect(dialog.getByLabel('Cantidad de 40cm x 1.5mm')).toHaveValue('3');
    await expect(plus).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Aumentar 50cm x 1.5mm' })).toBeDisabled();
    await dialog.getByLabel('Cantidad de 50cm x 1.5mm').fill('4');
    await expect(dialog.getByLabel('Cantidad de 50cm x 1.5mm')).toHaveValue('0');
  });

  test('mayorista con el modo apagado: el tope sigue siendo compartido (como siempre)', async ({ page }) => {
    const world = newWorld({ variantStock: false, vstock: { '40cm x 1.5mm': 1 } });
    await open(page, world, '/catalogo');
    await cardOf(page, 'Candonga').getByRole('button', { name: 'Elegir cantidades' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candonga con variantes' });
    await expect(dialog.getByTestId('row-stock')).toHaveCount(0);
    await dialog.getByLabel('Cantidad de 40cm x 1.5mm').fill('6');
    await expect(dialog.getByLabel('Cantidad de 40cm x 1.5mm')).toHaveValue('6');
  });

  test('detal: la variante agotada sale deshabilitada y tachada, arranca en la primera con stock y avisa "Quedan N"', async ({ page }) => {
    const world = newWorld({ session: false, status: null, variantStock: true, vstock: { '40cm x 1.5mm': 0, '50cm x 1.5mm': 2 } });
    await open(page, world, '/catalogo');
    await cardOf(page, 'Candonga').getByRole('button').first().click();
    const dialog = page.getByRole('dialog', { name: 'Candonga con variantes' });
    const out = dialog.getByRole('button', { name: /40cm x 1\.5mm/ });
    await expect(out).toBeDisabled();
    await expect(out).toContainText('Agotado');
    await expect(dialog.getByRole('button', { name: /50cm x 1\.5mm/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog).toContainText('Quedan 2');
  });
});
