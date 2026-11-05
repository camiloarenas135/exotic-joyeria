import { test as base, expect, type Page } from '@playwright/test';

/**
 * Admin > Kit Emprendedor. Sesión admin y TODAS las respuestas de Supabase simuladas (nada llega a producción).
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = 4102444800;
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
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const PIECE = {
  product_id: uuid(601), name: 'Balines con un nombre bastante largo para probar el desborde', category: 'Insumos', image: null,
  normal_price_cop: 250000, special_price_cop: 200000, enabled: true, sort: 0, stock: 10, has_variants: false,
};
const FOUND = [
  { id: uuid(700), name: 'Herraje nuevo', price_cop: 90000, stock: 4, variants: [], images: [] },
  { id: uuid(701), name: 'Cadena con variantes', price_cop: 120000, stock: 4, variants: [{ name: '40cm' }], images: [] },
];

async function stub(page: Page) {
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), SESSION);
  await page.route('**/auth/v1/**', (route) => (route.request().url().includes('/user') ? route.fulfill({ json: USER }) : route.fulfill({ json: SESSION })));
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()!;
    if (fn === 'admin_kit_list') return route.fulfill({ json: { cap_cop: 500000, pieces: [PIECE] } });
    if (fn.startsWith('admin_kit_')) {
      calls.push({ fn, body: route.request().postDataJSON() as Record<string, unknown> });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = table === 'products' ? FOUND : [];
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, json: [] });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows, headers: { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' } });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: [] }));
  await page.routeWebSocket(/realtime/, () => undefined);
  return { calls };
}

async function openKit(page: Page) {
  await page.goto('/admin');
  const tab = page.getByRole('tab', { name: /Kit Emprendedor/i });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kit Emprendedor' })).toBeVisible();
}

test.describe('Admin: Kit Emprendedor', () => {
  test('lista las piezas y el tope; un precio mayor al normal bloquea Guardar', async ({ page }) => {
    await stub(page);
    await openKit(page);
    await expect(page.getByLabel('Total máximo (COP)')).toHaveValue('500000');
    const price = page.getByLabel('Precio especial').first();
    await expect(price).toHaveValue('200000');
    const save = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(save).toBeDisabled(); // sin cambios
    await price.fill('300000'); // mayor que el normal (250.000)
    await expect(price).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: /no superar el precio normal/ })).toBeVisible();
    await expect(save).toBeDisabled();
    await price.fill('180000');
    await expect(save).toBeEnabled();
  });

  test('guardar precio, cambiar el tope y quitar una pieza llaman a las RPC correctas', async ({ page }) => {
    const world = await stub(page);
    page.on('dialog', (d) => void d.accept());
    await openKit(page);
    await page.getByLabel('Precio especial').first().fill('180000');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => world.calls.filter((c) => c.fn === 'admin_kit_upsert').length).toBe(1);
    expect(world.calls.find((c) => c.fn === 'admin_kit_upsert')!.body).toMatchObject({ p_product_id: uuid(601), p_special_price: 180000, p_enabled: true });

    await page.getByLabel('Total máximo (COP)').fill('450000');
    await page.getByRole('button', { name: 'Guardar tope' }).click();
    await expect.poll(() => world.calls.some((c) => c.fn === 'admin_kit_set_cap')).toBe(true);
    expect(world.calls.find((c) => c.fn === 'admin_kit_set_cap')!.body).toEqual({ p_cap: 450000 });

    await page.getByRole('button', { name: /^Quitar .* del kit$/ }).click();
    await expect.poll(() => world.calls.some((c) => c.fn === 'admin_kit_remove')).toBe(true);
  });

  test('buscar y agregar una pieza; los productos con variantes no se pueden agregar', async ({ page }) => {
    const world = await stub(page);
    await openKit(page);
    await page.getByLabel('Buscar producto').fill('her');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Tiene variantes: no puede entrar al kit')).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: 'Herraje nuevo' });
    await row.getByLabel('Precio especial').fill('70000');
    await row.getByRole('button', { name: 'Agregar' }).click();
    await expect.poll(() => world.calls.some((c) => c.fn === 'admin_kit_upsert')).toBe(true);
    expect(world.calls.find((c) => c.fn === 'admin_kit_upsert')!.body).toMatchObject({ p_product_id: uuid(700), p_special_price: 70000 });
  });

  test('sin scroll horizontal a 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await stub(page);
    await openKit(page);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw, `scrollWidth ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
  });
});
