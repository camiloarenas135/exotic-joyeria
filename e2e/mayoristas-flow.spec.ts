import { test as base, expect, type Page } from '@playwright/test';

/** Flujo del mayorista con sesión y respuestas de Supabase simuladas (nada llega a producción). */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = 4102444800;
const USER = {
  id: '22222222-2222-2222-2222-222222222222', aud: 'authenticated', role: 'authenticated',
  email: 'negocio@ejemplo.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2024-01-01T00:00:00Z',
};
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, role: 'authenticated', exp: EXP })}.sig`;
const SESSION = { access_token: JWT, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: EXP, user: USER };

const P1 = '00000000-0000-0000-0000-000000000101';
const CATALOG = [
  { id: P1, name: 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga', category: 'Cadenas', category_id: null, stock: 500, description: '', images: [], wholesale_price_cop: 30000, wholesale_variants: [] },
  { id: '00000000-0000-0000-0000-000000000102', name: 'Candonga con variantes', category: 'Candongas', category_id: null, stock: 500, description: '', images: [],
    wholesale_price_cop: null, wholesale_variants: [{ name: '40cm x 1.5mm', price_cop: 20000 }, { name: '50cm x 1.5mm', price_cop: 25000 }] },
];

async function stub(page: Page, status: 'pending' | 'approved' | 'rejected') {
  await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), SESSION);
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ json: route.request().url().includes('/user') ? USER : SESSION }));
  await page.route('**/rest/v1/rpc/wholesale_catalog', (route) => route.fulfill({ json: CATALOG }));
  await page.route('**/rest/v1/rpc/create_order', (route) =>
    route.fulfill({
      json: { order_id: 'o1', total: 3600000, lines: [{ name: 'Cadena', variant: null, qty: 120, unit_price: 30000, line_total: 3600000 }] },
    }));
  await page.route('**/rest/v1/wholesalers*', (route) =>
    route.fulfill({
      json: { user_id: USER.id, email: USER.email, business_name: 'Negocio de Prueba', phone: '3001234567', city: 'Cali', tax_id: null, status, notes: null, created_at: '2025-01-01T00:00:00Z' },
    }));
  await page.route('**/rest/v1/settings*', (route) => route.fulfill({ json: { value: 3500000 } }));
}

const noOverflow = (page: Page) =>
  page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

test.describe('mayorista en 360px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('pendiente: ve el aviso de revisión y ningún precio', async ({ page }) => {
    await stub(page, 'pending');
    await page.goto('/mayoristas');
    await expect(page.getByRole('heading', { name: 'Tu solicitud está en revisión' })).toBeVisible();
    await expect(page.getByText('En revisión por el administrador')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Añadir', exact: true })).toHaveCount(0);
    const m = await noOverflow(page);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
  });

  test('rechazado: mensaje neutro con WhatsApp', async ({ page }) => {
    await stub(page, 'rejected');
    await page.goto('/mayoristas');
    await expect(page.getByRole('heading', { name: 'No pudimos habilitar tu acceso' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Escribir por WhatsApp' })).toBeVisible();
  });

  test('aprobado: catálogo en cards, mínimo bloquea y luego permite enviar', async ({ page }) => {
    await stub(page, 'approved');
    await page.goto('/mayoristas');
    await expect(page.getByText('Tu cuenta está aprobada')).toBeVisible();
    await expect(page.getByText('Cadena Cubana Oro Laminado').first()).toBeVisible();

    let m = await noOverflow(page);
    expect(m.sw, 'catálogo desborda').toBeLessThanOrEqual(m.iw);

    const send = page.getByRole('button', { name: /Enviar pedido por WhatsApp/ });
    await expect(send).toBeDisabled();
    await page.getByRole('button', { name: 'Añadir', exact: true }).first().click();
    await expect(page.getByText(/Te faltan/)).toBeVisible();
    await expect(send).toBeDisabled();

    // 120 unidades × $30.000 = $3.600.000 ≥ mínimo
    for (let i = 0; i < 119; i++) await page.getByRole('button', { name: 'Aumentar' }).first().click();
    await expect(page.getByText('Alcanzaste el pedido mínimo.')).toBeVisible();
    await expect(send).toBeEnabled();

    m = await noOverflow(page);
    expect(m.sw, 'pedido desborda').toBeLessThanOrEqual(m.iw);

    const req = page.waitForRequest('**/rest/v1/rpc/create_order');
    await send.click();
    const body = (await req).postDataJSON();
    expect(body.p_channel).toBe('wholesale');
    expect(JSON.stringify(body.p_lines)).not.toMatch(/price|unit/i);
  });
});
