import { test as base, expect, type Page, type Route } from '@playwright/test';
import { makeUser, makeSession, uuid } from './helpers/wholesale';

/**
 * Fase 3.1 / 3.2: reparto de stock por variante (pantalla propia + interruptor) y formulario de producto con variantes que
 * conservan su id y su stock. TODO Supabase está simulado.
 */
const test = base.extend({});
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

const ADMIN = makeUser('11111111-1111-1111-1111-111111111111', 'kevinlgomez058@gmail.com');

const P_CART = uuid(701);
const V_60 = uuid(711);
const V_50 = uuid(712);

const productRow = () => ({
  id: P_CART, name: 'Cadena Cartier', price: '$165.000', category: 'Cadenas', stock: 3, description: '', images: [],
  created_at: '2025-05-01T12:00:00Z',
  variants: [
    { id: V_60, name: '60cm x 3mm', price: '295.000', price_cop: 295000, stock: 2 },
    { id: V_50, name: '50cm x 2mm', price: '$165.000', price_cop: 165000, stock: 1 },
  ],
});

interface World {
  mode: 'on' | 'off';
  /** respuesta de admin_enable_variant_stock cuando no se fuerza */
  enableReport: Record<string, unknown>;
  fail: Record<string, string>;
  calls: Record<string, Record<string, unknown>[]>;
  patches: Record<string, unknown>[];
  /** suma de variantes que devuelve admin_variant_stock_list (para forzar "Revisar reparto") */
  listSum: number;
}
const newWorld = (over: Partial<World> = {}): World => ({
  mode: 'off', enableReport: { enabled: false, differences: [{ product_id: P_CART, name: 'Cadena Cartier', product_stock: 3, variants_sum: 5 }], legacy_pending_orders: 1 },
  fail: {}, calls: {}, patches: [], listSum: 5, ...over,
});

async function stub(page: Page, w: World) {
  await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
  await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), makeSession(ADMIN));
  await page.route('**/auth/v1/**', (route: Route) => route.fulfill({ json: route.request().url().includes('/user') ? ADMIN : makeSession(ADMIN) }));
  await page.route('**/rest/v1/rpc/**', async (route: Route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (w.calls[name] ??= []).push(body);
    if (w.fail[name]) return route.fulfill({ status: 400, json: { message: w.fail[name], code: 'P0001' } });
    switch (name) {
      case 'admin_variant_stock_list':
        return route.fulfill({
          json: [{
            product_id: P_CART, name: 'Cadena Cartier', product_stock: 3, snapshot: 3, variants_sum: w.listSum, needs_review: w.listSum !== 3,
            variants: [
              { id: V_60, name: '60cm x 3mm', stock: 2, price_cop: 295000 },
              { id: V_50, name: '50cm x 2mm', stock: 1, price_cop: 165000 },
            ],
          }],
        });
      case 'admin_set_stock':
        return route.fulfill({ json: { variant_id: body.p_variant, stock: body.p_stock } });
      case 'admin_enable_variant_stock':
        if (body.p_force) { w.mode = 'on'; return route.fulfill({ json: { enabled: true, differences: [], legacy_pending_orders: 0 } }); }
        return route.fulfill({ json: w.enableReport });
      case 'admin_disable_variant_stock':
        w.mode = 'off';
        return route.fulfill({ json: { enabled: false } });
      case 'wholesale_pending_count':
        return route.fulfill({ json: 0 });
      default:
        return route.fulfill({ json: [] });
    }
  });
  await page.route('**/rest/v1/*', (route: Route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    if (req.method() === 'PATCH' && table === 'products') {
      w.patches.push(req.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, json: [] });
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, json: [] });
    let rows: unknown[] = [];
    if (table === 'products') rows = [productRow()];
    if (table === 'categories') rows = [{ id: uuid(1), slug: 'cadenas', name: 'Cadenas', sort_order: 1, is_active: true, image: null }];
    if (table === 'settings') rows = [{ value: w.mode }];
    const headers = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, body: '', headers });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows, headers });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
}

const lastCall = (w: World, name: string) => (w.calls[name] ?? []).at(-1);

async function openCatalog(page: Page, w: World) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stub(page, w);
  await page.goto('/admin');
  await page.getByRole('tab', { name: /^Catálogo/ }).first().click();
  await expect(page.getByText('Cadena Cartier').first()).toBeVisible();
}

test.describe('reparto de stock por variante (3.2)', () => {
  test('lista productos con variantes, marca los que no cuadran y guarda con admin_set_stock y control optimista', async ({ page }) => {
    const w = newWorld();
    await openCatalog(page, w);
    await page.getByRole('button', { name: 'Reparto de stock' }).click();
    const row = page.getByTestId('vs-row');
    await expect(row).toContainText('Cadena Cartier');
    await expect(row).toContainText('Revisar reparto');
    await expect(row).toContainText('Unidades del producto: 3');
    await expect(row).toContainText('Suma de variantes: 3'); // 2 + 1 con los valores cargados
    await expect(page.getByText(/APAGADO/)).toBeVisible();

    const guardar = page.getByRole('button', { name: 'Guardar stock de Cadena Cartier' });
    await expect(guardar).toBeDisabled();
    await page.getByLabel('Stock de Cadena Cartier, variante 50cm x 2mm').fill('4');
    await expect(row).toContainText('Suma de variantes: 6');
    await guardar.click();
    await expect.poll(() => lastCall(w, 'admin_set_stock')).toEqual({ p_variant: V_50, p_stock: 4, p_expected: 1 }); // solo la variante que cambió
    expect((w.calls.admin_set_stock ?? []).length).toBe(1);
    await expect(page.getByRole('status').filter({ hasText: 'Stock de “Cadena Cartier” guardado' })).toBeVisible();
  });

  test('si el stock cambió mientras se editaba (STOCK_CHANGED) lo dice y no lo da por guardado', async ({ page }) => {
    const w = newWorld();
    w.fail.admin_set_stock = 'STOCK_CHANGED:7';
    await openCatalog(page, w);
    await page.getByRole('button', { name: 'Reparto de stock' }).click();
    await page.getByLabel('Stock de Cadena Cartier, variante 60cm x 3mm').fill('9');
    await page.getByRole('button', { name: 'Guardar stock de Cadena Cartier' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'cambió mientras lo editabas' })).toContainText('ahora es 7');
  });

  test('encender: si no cuadra muestra el reporte y no enciende; con "de todos modos" lo fuerza; luego se puede apagar', async ({ page }) => {
    const w = newWorld();
    await openCatalog(page, w);
    await page.getByRole('button', { name: 'Reparto de stock' }).click();
    await page.getByRole('button', { name: 'Encender stock por variante' }).click();
    const report = page.getByTestId('enable-report');
    await expect(report).toContainText('el producto tiene 3 unidades y sus variantes suman 5');
    await expect(report).toContainText('1 pedido(s) pendiente(s)');
    expect(lastCall(w, 'admin_enable_variant_stock')).toEqual({ p_force: false });

    page.once('dialog', (d) => void d.accept());
    await report.getByRole('button', { name: 'Encender de todos modos' }).click();
    await expect.poll(() => lastCall(w, 'admin_enable_variant_stock')).toEqual({ p_force: true });
    await expect(page.getByText(/ENCENDIDO: cada variante/)).toBeVisible();

    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Apagar stock por variante' }).click();
    await expect.poll(() => (w.calls.admin_disable_variant_stock ?? []).length).toBe(1);
    await expect(page.getByText(/APAGADO: el sitio sigue/)).toBeVisible();
  });
});

test.describe('formulario de producto con variantes (3.1)', () => {
  test('modo apagado: las unidades se editan como siempre; cada variante muestra su stock; el id viaja al guardar', async ({ page }) => {
    const w = newWorld();
    await openCatalog(page, w);
    await page.getByTitle('Editar').first().click();
    await expect(page.getByLabel('Stock de la variante 60cm x 3mm')).toHaveValue('2');
    await expect(page.getByLabel('Stock de la variante 50cm x 2mm')).toHaveValue('1');
    await expect(page.getByLabel('Unidades (suma de las variantes)')).toHaveCount(0); // apagado: el campo normal sigue editable

    await page.getByLabel('Stock de la variante 50cm x 2mm').fill('6');
    await page.getByRole('button', { name: /Guardar|Actualizar/ }).last().click();
    await expect.poll(() => lastCall(w, 'admin_set_stock')).toEqual({ p_variant: V_50, p_stock: 6, p_expected: 1 });
    // el update del producto reenvía los ids de las variantes (así renombrar no pierde stock) y NUNCA el stock por variante
    const patch = w.patches.at(-1) as { variants: Record<string, unknown>[] };
    expect(patch.variants).toEqual([
      { id: V_60, name: '60cm x 3mm', price: '295.000' },
      { id: V_50, name: '50cm x 2mm', price: '$165.000' },
    ]);
  });

  test('modo encendido: las unidades del producto son de solo lectura (suma de las variantes) y no se envían', async ({ page }) => {
    const w = newWorld({ mode: 'on' });
    await openCatalog(page, w);
    await page.getByTitle('Editar').first().click();
    const total = page.getByLabel('Unidades (suma de las variantes)');
    await expect(total).toHaveValue('3');
    await expect(total).toHaveAttribute('readonly', '');
    await page.getByLabel('Stock de la variante 60cm x 3mm').fill('10');
    await expect(total).toHaveValue('11');
    await page.getByRole('button', { name: /Guardar|Actualizar/ }).last().click();
    await expect.poll(() => lastCall(w, 'admin_set_stock')).toEqual({ p_variant: V_60, p_stock: 10, p_expected: 2 });
    expect(w.patches.at(-1)).not.toHaveProperty('stock');
  });
});
