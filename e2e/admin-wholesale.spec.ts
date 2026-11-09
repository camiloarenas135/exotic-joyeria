import { test as base, expect, type Page, type Route } from '@playwright/test';
import { makeUser, makeSession, uuid, svg } from './helpers/wholesale';

/**
 * Entrega E, admin: tabla de productos mayoristas (precios en línea, publicar/ocultar, lote), mínimo, insignia de
 * solicitudes, aviso del correo y pedidos con confirm_order / cancel_order. TODO Supabase está simulado.
 */
const test = base.extend({});

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

const ADMIN = makeUser('11111111-1111-1111-1111-111111111111', 'kevinlgomez058@gmail.com');

const R_PLAIN = uuid(301);
const R_VAR = uuid(302);
const R_HIDDEN = uuid(303);
const R_NOSTOCK = uuid(304);

const baseRow = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, category: 'Cadenas', category_id: uuid(1), image: svg('#d4af37'), stock: 10, price_cop: 50000,
  variants: { base: null, items: [] }, wholesale_price_cop: null, wholesale_status: 'none', total_count: 4, ...over,
});

const ROWS = [
  baseRow(R_PLAIN, 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga'),
  baseRow(R_VAR, 'Candonga con variantes', {
    category: 'Candongas', category_id: uuid(2), price_cop: 40000,
    variants: { base: null, items: [
      { name: '40cm x 1.5mm', retail_price_cop: 40000, wholesale_price_cop: 20000, is_visible: true },
      { name: '50cm x 1.5mm', retail_price_cop: 45000, wholesale_price_cop: null, is_visible: null },
    ] },
    wholesale_price_cop: 20000, wholesale_status: 'published',
  }),
  baseRow(R_HIDDEN, 'Anillo precio alto', { price_cop: 20000, variants: { base: { wholesale_price_cop: 30000, is_visible: false }, items: [] }, wholesale_price_cop: null, wholesale_status: 'hidden' }),
  baseRow(R_NOSTOCK, 'Aretes sin stock', { stock: 0, price_cop: 15000 }),
];

const PENDING_ORDER = uuid(500);
const CONFIRMED_ORDER = uuid(501);
const FIXTURES: Record<string, unknown[]> = {
  categories: [
    { id: uuid(1), slug: 'cadenas', name: 'Cadenas', sort_order: 1, is_active: true, image: null },
    { id: uuid(2), slug: 'candongas', name: 'Candongas', sort_order: 2, is_active: true, image: null },
  ],
  orders: [
    { id: PENDING_ORDER, customer_name: 'Negocio Uno', customer_phone: '3001112233', items: [{ id: R_PLAIN, name: 'Cadena Cubana', quantity: 120, price: '$30.000' }], total_amount: 3600000, status: 'pending', channel: 'wholesale', user_id: uuid(300), created_at: '2025-05-01T12:00:00Z' },
    { id: CONFIRMED_ORDER, customer_name: 'Cliente Dos', customer_phone: '3004445566', items: [{ id: R_VAR, name: 'Candonga', quantity: 1, price: '$40.000' }], total_amount: 40000, status: 'confirmed', channel: 'retail', user_id: null, created_at: '2025-05-02T12:00:00Z' },
  ],
  products: [{ id: R_PLAIN, stock: 10 }, { id: R_VAR, stock: 5 }],
  wholesalers: [
    { user_id: uuid(300), email: 'negocio@ejemplo.com', business_name: 'Negocio Uno', phone: '3001112233', city: 'Cali', tax_id: null, status: 'pending', notes: null, created_at: '2025-05-01T12:00:00Z', account_type: 'wholesale', requested_account_type: 'entrepreneur' },
  ],
  settings: [{ value: 750000 }],
};

interface AdminWorld {
  rows: typeof ROWS;
  total?: number;
  pending: number;
  min: number;
  /** error de la próxima RPC por nombre */
  fail: Record<string, string>;
  mail: Record<string, unknown>;
  calls: Record<string, Record<string, unknown>[]>;
  mutations: string[];
}
const newAdmin = (over: Partial<AdminWorld> = {}): AdminWorld => ({ rows: ROWS, pending: 3, min: 3_500_000, fail: {}, mail: { ok: true, sent: true }, calls: {}, mutations: [], ...over });

async function stubAdmin(page: Page, w: AdminWorld) {
  await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
  await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), makeSession(ADMIN));
  await page.route('**/auth/v1/**', (route: Route) => route.fulfill({ json: route.request().url().includes('/user') ? ADMIN : makeSession(ADMIN) }));
  await page.route('**/functions/v1/wholesale-mail', (route) => route.fulfill({ json: w.mail }));
  await page.route('**/rest/v1/rpc/**', async (route: Route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (w.calls[name] ??= []).push(body);
    if (w.fail[name]) return route.fulfill({ status: 400, json: { message: w.fail[name], code: 'P0001' } });
    switch (name) {
      case 'admin_wholesale_products': {
        let list = w.rows;
        if (body.p_status && body.p_status !== 'all') {
          list = list.filter((r) => (body.p_status === 'no_stock' ? (r.stock ?? 0) <= 0 : r.wholesale_status === body.p_status));
        }
        if (body.p_search) list = list.filter((r) => r.name.toLowerCase().includes(String(body.p_search).toLowerCase()));
        if (body.p_category) list = list.filter((r) => r.category_id === body.p_category);
        const total = w.total ?? list.length;
        return route.fulfill({ json: list.map((r) => ({ ...r, total_count: total })) });
      }
      case 'wholesale_min':
        return route.fulfill({ json: w.min });
      case 'wholesale_pending_count':
        return route.fulfill({ json: w.pending });
      case 'admin_list_wholesalers': {
        const all = FIXTURES.wholesalers as { status: string }[];
        return route.fulfill({ json: body.p_status ? all.filter((r) => r.status === body.p_status) : all });
      }
      case 'admin_upsert_wholesale_prices':
        return route.fulfill({ json: { upserted: (body.p_rows as unknown[]).length } });
      case 'admin_set_wholesale_visibility':
        return route.fulfill({ json: (body.p_product_ids as unknown[]).length });
      case 'admin_remove_wholesale_prices':
        return route.fulfill({ json: (body.p_product_ids as unknown[]).length });
      case 'confirm_order':
      case 'cancel_order':
        return route.fulfill({ json: { order_id: body.p_order_id, status: name === 'confirm_order' ? 'confirmed' : 'cancelled' } });
      default:
        return route.fulfill({ json: [] });
    }
  });
  await page.route('**/rest/v1/*', (route: Route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      w.mutations.push(`${req.method()} ${table}`);
      return route.fulfill({ status: 200, json: [] });
    }
    const rows = FIXTURES[table] ?? [];
    const headers = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, body: '', headers });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows, headers });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
}

const lastCall = (w: AdminWorld, name: string) => (w.calls[name] ?? []).at(-1) as Record<string, unknown> | undefined;
const noOverflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

async function openProducts(page: Page, w: AdminWorld, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await stubAdmin(page, w);
  await page.goto('/admin');
  await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
  await page.getByRole('tab', { name: 'Productos' }).click();
  await expect(page.getByTestId('wholesale-prices')).toBeVisible();
  await expect(page.getByTestId('wp-row').first()).toBeVisible();
}

const rowOf = (page: Page, name: string) => page.getByTestId('wp-row').filter({ hasText: name });

// ---------------------------------------------------------------------------------------------
test.describe('tabla de productos mayoristas', () => {
  test('lista TODOS los productos con foto, colección, stock, detal y estado; filtros y búsqueda llegan a la RPC', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    await expect(page.getByTestId('wp-row')).toHaveCount(4);
    const cadena = rowOf(page, 'Cadena Cubana');
    await expect(cadena).toContainText('Cadenas');
    await expect(cadena).toContainText(/50\.000/);
    await expect(cadena.locator('img')).toHaveCount(1);
    await expect(cadena.getByRole('switch')).toContainText('Sin precio');
    await expect(cadena.getByRole('switch')).toBeDisabled();
    await expect(rowOf(page, 'Candonga').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect(rowOf(page, 'Anillo precio alto').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await expect(rowOf(page, 'Aretes sin stock')).toContainText('0');
    expect(lastCall(w, 'admin_wholesale_products')).toMatchObject({ p_search: null, p_category: null, p_status: 'all', p_limit: 50, p_offset: 0 });

    await page.getByLabel('Estado').selectOption('published');
    await expect(page.getByTestId('wp-row')).toHaveCount(1);
    expect(lastCall(w, 'admin_wholesale_products')).toMatchObject({ p_status: 'published' });
    await page.getByLabel('Estado').selectOption('all');
    await page.getByLabel('Colección').selectOption({ label: 'Candongas' });
    await expect(page.getByTestId('wp-row')).toHaveCount(1);
    expect(lastCall(w, 'admin_wholesale_products')).toMatchObject({ p_category: uuid(2) });
    await page.getByLabel('Colección').selectOption('');
    await page.getByLabel('Buscar').fill('anillo');
    await expect(page.getByTestId('wp-row')).toHaveCount(1);
    expect(lastCall(w, 'admin_wholesale_products')).toMatchObject({ p_search: 'anillo' });
  });

  test('paginación de 50 en 50', async ({ page }) => {
    const w = newAdmin({ total: 120 });
    await openProducts(page, w);
    await expect(page.getByText('Página 1 de 3')).toBeVisible();
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page.getByText('Página 2 de 3')).toBeVisible();
    expect(lastCall(w, 'admin_wholesale_products')).toMatchObject({ p_offset: 50, p_limit: 50 });
  });

  test('precio en línea: guarda con admin_upsert_wholesale_prices (sin delete+insert, sin is_visible)', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    const cadena = rowOf(page, 'Cadena Cubana');
    const save = cadena.getByRole('button', { name: /Guardar precio de/ });
    await expect(save).toBeDisabled();
    await cadena.getByRole('textbox', { name: /Precio mayorista de Cadena/ }).fill('35000');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole('status').filter({ hasText: 'guardado' })).toBeVisible();
    expect(lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({ p_rows: [{ product_id: R_PLAIN, variant_name: null, price_cop: 35000 }] });
    expect(w.mutations).toEqual([]); // nada de PATCH/DELETE/POST directos a tablas
    await expect(save).toBeDisabled(); // sin cambios pendientes tras guardar
  });

  test('producto con variantes: un campo por variante', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    const row = rowOf(page, 'Candonga');
    await expect(row.getByRole('textbox')).toHaveCount(2);
    await expect(row.getByRole('textbox', { name: /variante 40cm x 1.5mm/ })).toHaveValue('20000');
    await expect(row.getByRole('textbox', { name: /variante 50cm x 1.5mm/ })).toHaveValue('');
    await row.getByRole('textbox', { name: /variante 50cm x 1.5mm/ }).fill('28000');
    await row.getByRole('button', { name: /Guardar precio de/ }).click();
    await expect.poll(() => lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({ p_rows: [{ product_id: R_VAR, variant_name: '50cm x 1.5mm', price_cop: 28000 }] });
  });

  test('advertencia (no bloqueo) si el mayorista queda ≥ detal; precios no válidos no se envían', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    // el anillo ya tiene 30.000 con detal 20.000
    await expect(rowOf(page, 'Anillo precio alto').getByTestId('warn-ge-retail')).toBeVisible();
    const cadena = rowOf(page, 'Cadena Cubana');
    const input = cadena.getByRole('textbox', { name: /Precio mayorista de Cadena/ });
    await input.fill('60000');
    await expect(cadena.getByTestId('warn-ge-retail')).toContainText(/igual o por encima del detal/);
    await cadena.getByRole('button', { name: /Guardar precio de/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'igual o por encima del detal' })).toBeVisible();
    expect(lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({ p_rows: [{ product_id: R_PLAIN, variant_name: null, price_cop: 60000 }] });

    // precio 0: error y ninguna llamada nueva
    const before = (w.calls.admin_upsert_wholesale_prices ?? []).length;
    await input.fill('0');
    await cadena.getByRole('button', { name: /Guardar precio de/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'enteros mayores a 0' })).toBeVisible();
    expect((w.calls.admin_upsert_wholesale_prices ?? []).length).toBe(before);
  });

  test('errores del servidor en español (VARIANT_REQUIRED, FORBIDDEN)', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    w.fail.admin_upsert_wholesale_prices = 'VARIANT_REQUIRED:Candonga con variantes';
    const cadena = rowOf(page, 'Cadena Cubana');
    await cadena.getByRole('textbox', { name: /Precio mayorista de Cadena/ }).fill('35000');
    await cadena.getByRole('button', { name: /Guardar precio de/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'se pone por variante' })).toContainText('Candonga con variantes');
    w.fail.admin_upsert_wholesale_prices = 'FORBIDDEN';
    await cadena.getByRole('button', { name: /Guardar precio de/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'No tienes permiso' })).toBeVisible();
  });

  test('interruptor Publicado/Oculto usa admin_set_wholesale_visibility', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    await rowOf(page, 'Candonga').getByRole('switch').click();
    await expect.poll(() => lastCall(w, 'admin_set_wholesale_visibility')).toEqual({ p_product_ids: [R_VAR], p_visible: false });
    await rowOf(page, 'Anillo precio alto').getByRole('switch').click();
    await expect.poll(() => lastCall(w, 'admin_set_wholesale_visibility')).toEqual({ p_product_ids: [R_HIDDEN], p_visible: true });
    expect(w.mutations).toEqual([]);
  });

  test('lote: publicar/ocultar, copiar precio del detal, −X% y quitar', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);
    await page.getByRole('checkbox', { name: /Seleccionar Cadena Cubana/ }).check();
    await page.getByRole('checkbox', { name: /Seleccionar Aretes sin stock/ }).check();
    const bulk = page.getByTestId('bulk-bar');
    await expect(bulk).toContainText('2 seleccionados');

    await bulk.getByRole('button', { name: 'Publicar' }).click();
    await expect.poll(() => lastCall(w, 'admin_set_wholesale_visibility')).toEqual({ p_product_ids: [R_PLAIN, R_NOSTOCK], p_visible: true });
    await bulk.getByRole('button', { name: 'Ocultar' }).click();
    await expect.poll(() => lastCall(w, 'admin_set_wholesale_visibility')).toEqual({ p_product_ids: [R_PLAIN, R_NOSTOCK], p_visible: false });

    // sin % escrito no se puede aplicar −X%
    await expect(bulk.getByRole('button', { name: /Aplicar −X% al detal/ })).toBeDisabled();
    await bulk.getByRole('button', { name: 'Copiar precio del detal' }).click();
    await expect.poll(() => lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({
      p_rows: [
        { product_id: R_PLAIN, variant_name: null, price_cop: 50000 },
        { product_id: R_NOSTOCK, variant_name: null, price_cop: 15000 },
      ],
    });
    await expect(page.getByRole('status').filter({ hasText: 'quedaron iguales o por encima del detal' })).toBeVisible();

    // −40 %: el campo sugerido (opcional, sin valor por defecto) también rellena el placeholder
    const pct = page.getByRole('textbox', { name: 'Porcentaje sugerido sobre el detal' });
    await expect(pct).toHaveValue('');
    await pct.fill('40');
    await expect(rowOf(page, 'Cadena Cubana').getByRole('textbox', { name: /Precio mayorista de Cadena/ })).toHaveAttribute('placeholder', '30000');
    await bulk.getByRole('button', { name: /Aplicar −40% al detal/ }).click();
    await expect.poll(() => lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({
      p_rows: [
        { product_id: R_PLAIN, variant_name: null, price_cop: 30000 },
        { product_id: R_NOSTOCK, variant_name: null, price_cop: 9000 },
      ],
    });

    page.once('dialog', (d) => d.accept());
    await bulk.getByRole('button', { name: 'Quitar' }).click();
    await expect.poll(() => lastCall(w, 'admin_remove_wholesale_prices')).toEqual({ p_product_ids: [R_PLAIN, R_NOSTOCK] });
    expect(w.mutations).toEqual([]);
  });

  test('−X% en producto con variantes usa el detal de cada variante', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    await page.getByRole('checkbox', { name: /Seleccionar Candonga/ }).check();
    await page.getByRole('textbox', { name: 'Porcentaje sugerido sobre el detal' }).fill('50');
    await page.getByTestId('bulk-bar').getByRole('button', { name: /Aplicar −50%/ }).click();
    await expect.poll(() => lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({
      p_rows: [
        { product_id: R_VAR, variant_name: '40cm x 1.5mm', price_cop: 20000 },
        { product_id: R_VAR, variant_name: '50cm x 1.5mm', price_cop: 22500 },
      ],
    });
  });

  test('mínimo mayorista: se lee de wholesale_min y se guarda con admin_set_wholesale_min', async ({ page }) => {
    const w = newAdmin({ min: 4_200_000 });
    await openProducts(page, w);
    const input = page.getByRole('textbox', { name: 'Pedido mínimo mayorista' });
    await expect(input).toHaveValue('4200000');
    await input.fill('5000000');
    await page.getByRole('button', { name: 'Guardar mínimo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pedido mínimo mayorista actualizado' })).toContainText(/5\.000\.000/);
    expect(lastCall(w, 'admin_set_wholesale_min')).toEqual({ p_cop: 5000000 });
    w.fail.admin_set_wholesale_min = 'INVALID_MIN';
    await page.getByRole('button', { name: 'Guardar mínimo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'entre 0 y 1.000.000.000' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('solicitudes y correo', () => {
  test('insignia con wholesale_pending_count y aviso cuando el correo ya se había enviado', async ({ page }) => {
    const w = newAdmin({ pending: 3, mail: { ok: true, sent: false, already: true } });
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    await expect(page.getByTestId('pending-badge')).toHaveText('3');
    await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'quedó aprobado' })).toContainText('ya se había enviado un correo anteriormente');
    expect(lastCall(w, 'set_wholesaler_status')).toMatchObject({ p_user: uuid(300), p_status: 'approved' });
    // tras aprobar se vuelve a leer el conteo
    w.pending = 2;
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByTestId('pending-badge')).toHaveText('2');
  });

  test('la lista de solicitudes sale de admin_list_wholesalers y la tabla nunca se lee con * ni con notes (fase 0.3)', async ({ page }) => {
    const w = newAdmin();
    const tableReads: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.endsWith('/rest/v1/wholesalers')) tableReads.push(decodeURIComponent(u.search));
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
    await expect(page.getByText('Negocio Uno')).toBeVisible();
    expect(lastCall(w, 'admin_list_wholesalers')).toMatchObject({ p_status: 'pending' });
    await page.getByRole('button', { name: 'Todos' }).click();
    await expect.poll(() => lastCall(w, 'admin_list_wholesalers')).toMatchObject({ p_status: null });
    // Con la migración 062 un select('*') o la columna notes dan "permission denied": el front no debe pedirlos
    expect(tableReads.filter((s) => /select=\*|select=[^&]*notes|select=[^&]*reviewed_by|select=[^&]*last_status_notified/.test(s))).toEqual([]);
  });

  test('tipo de cuenta: muestra lo que solicitó, filtra por tipo y lo cambia con admin_set_account_type (fase 3.3)', async ({ page }) => {
    const w = newAdmin();
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
    const row = page.getByRole('row').filter({ hasText: 'Negocio Uno' });
    await expect(row).toContainText('Solicitó: Emprendedor'); // pidió una cosa y la cuenta es otra: se destaca
    const select = page.getByRole('combobox', { name: 'Tipo de cuenta de Negocio Uno' });
    await expect(select).toHaveValue('wholesale');
    await select.selectOption('entrepreneur');
    await expect.poll(() => lastCall(w, 'admin_set_account_type')).toEqual({ p_user: uuid(300), p_type: 'entrepreneur' });
    await expect(page.getByRole('status').filter({ hasText: 'ahora es Emprendedor' })).toBeVisible();
    // el filtro por tipo oculta la fila cuando no coincide
    await page.getByRole('button', { name: 'Emprendedores' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Negocio Uno' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mayoristas', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Negocio Uno' })).toHaveCount(1);
  });

  test('cambiar el tipo de una cuenta aprobada pide confirmación', async ({ page }) => {
    const w = newAdmin();
    (FIXTURES.wholesalers as Record<string, unknown>[])[0].status = 'approved';
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await stubAdmin(page, w);
      await page.goto('/admin');
      await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
      await page.getByRole('button', { name: 'Todos', exact: true }).click();
      let asked = '';
      page.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
      await page.getByRole('combobox', { name: 'Tipo de cuenta de Negocio Uno' }).selectOption('entrepreneur');
      await expect.poll(() => asked).toContain('otros precios y otro pedido mínimo');
      expect(lastCall(w, 'admin_set_account_type')).toBeUndefined(); // cancelado: no se llama
    } finally {
      (FIXTURES.wholesalers as Record<string, unknown>[])[0].status = 'pending';
    }
  });

  test('correo aún sin confirmar: queda aprobado pero avisa que no se envió el aviso (fase 3.6)', async ({ page }) => {
    const w = newAdmin({ mail: { ok: true, sent: false, unconfirmed: true } });
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'quedó aprobado' })).toContainText('aún no está confirmado');
  });

  test('correo enviado de verdad: mensaje de éxito', async ({ page }) => {
    const w = newAdmin({ mail: { ok: true, sent: true } });
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    await page.getByRole('tab', { name: /^Mayoristas/ }).first().click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'le enviamos un correo' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('lista de precios de emprendedor (fase 3.4)', () => {
  test('la lista mayorista no envía p_price_list; la de emprendedor sí, en lectura, guardado, publicar y quitar', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    expect(lastCall(w, 'admin_wholesale_products')).not.toHaveProperty('p_price_list');
    await page.getByRole('button', { name: 'Lista emprendedor' }).click();
    await expect(page.getByRole('heading', { name: 'Productos para emprendedores' })).toBeVisible();
    await expect.poll(() => lastCall(w, 'admin_wholesale_products')).toMatchObject({ p_price_list: 'entrepreneur', p_offset: 0 });

    const cadena = rowOf(page, 'Cadena Cubana');
    await cadena.getByLabel(/^Precio emprendedor de Cadena Cubana/).fill('42000');
    await cadena.getByRole('button', { name: /Guardar precio de/ }).click();
    await expect.poll(() => lastCall(w, 'admin_upsert_wholesale_prices')).toEqual({ p_rows: [{ product_id: R_PLAIN, variant_name: null, price_cop: 42000 }], p_price_list: 'entrepreneur' });

    await rowOf(page, 'Candonga con variantes').getByRole('switch').click();
    await expect.poll(() => lastCall(w, 'admin_set_wholesale_visibility')).toEqual({ p_product_ids: [R_VAR], p_visible: false, p_price_list: 'entrepreneur' });

    await page.getByLabel('Seleccionar Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga').check();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Quitar' }).click();
    await expect.poll(() => lastCall(w, 'admin_remove_wholesale_prices')).toEqual({ p_product_ids: [R_PLAIN], p_price_list: 'entrepreneur' });
  });

  test('cada lista tiene su mínimo: el de emprendedor se lee de settings y se guarda con admin_set_entrepreneur_min', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    await expect(page.getByLabel('Pedido mínimo mayorista')).toHaveValue('3500000');
    await page.getByRole('button', { name: 'Lista emprendedor' }).click();
    const min = page.getByLabel('Pedido mínimo emprendedor');
    await expect(min).toHaveValue('750000');
    await min.fill('600000');
    await page.getByRole('button', { name: 'Guardar mínimo' }).click();
    await expect.poll(() => lastCall(w, 'admin_set_entrepreneur_min')).toEqual({ p_cop: 600000 });
    expect(lastCall(w, 'admin_set_wholesale_min')).toBeUndefined();
    await expect(page.getByRole('status').filter({ hasText: 'Pedido mínimo emprendedor actualizado' })).toBeVisible();
  });

  test('al volver a la lista mayorista se descartan borradores y se recarga sin p_price_list', async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w);
    await page.getByRole('button', { name: 'Lista emprendedor' }).click();
    await rowOf(page, 'Cadena Cubana').getByLabel(/^Precio emprendedor de/).fill('12345');
    await page.getByRole('button', { name: 'Lista mayorista' }).click();
    await expect.poll(() => lastCall(w, 'admin_wholesale_products')).not.toHaveProperty('p_price_list');
    await expect(rowOf(page, 'Cadena Cubana').getByLabel(/^Precio mayorista de/)).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('pedidos: confirm_order / cancel_order', () => {
  test('confirmar y cancelar usan las RPC (sin update directo) y explican el inventario', async ({ page }) => {
    const w = newAdmin();
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    await expect(page.getByText(/confirmar descuenta el stock/)).toBeVisible();
    const pending = page.locator('tr', { hasText: 'Negocio Uno' });
    await pending.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page.getByText(/se descuenta del inventario/)).toBeVisible();
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect.poll(() => lastCall(w, 'confirm_order')).toEqual({ p_order_id: PENDING_ORDER });

    await pending.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByText(/aún no descontó inventario/)).toBeVisible();
    await expect(page.getByText('El inventario no se modificará')).toHaveCount(0);
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect.poll(() => lastCall(w, 'cancel_order')).toEqual({ p_order_id: PENDING_ORDER });

    // un pedido confirmado se cancela devolviendo el stock
    await page.locator('tr', { hasText: 'Cliente Dos' }).getByRole('button', { name: 'Cancelar y devolver stock' }).click();
    await expect(page.getByText(/vuelve al inventario/)).toBeVisible();
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect.poll(() => (w.calls.cancel_order ?? []).length).toBe(2);
    expect(w.mutations).toEqual([]); // ningún PATCH a orders ni products
  });

  test('INSUFFICIENT_STOCK y otros errores se muestran en español', async ({ page }) => {
    const w = newAdmin();
    await page.setViewportSize({ width: 1280, height: 900 });
    await stubAdmin(page, w);
    await page.goto('/admin');
    w.fail.confirm_order = 'INSUFFICIENT_STOCK:Cadena Cubana:5:120';
    await page.locator('tr', { hasText: 'Negocio Uno' }).getByRole('button', { name: 'Confirmar pedido' }).click();
    await page.getByRole('button', { name: 'Aceptar' }).click();
    const alert = page.getByRole('heading', { name: 'No se pudo confirmar el pedido' }).locator('xpath=..');
    await expect(alert).toContainText('No hay stock suficiente de Cadena Cubana');
    await expect(alert).toContainText('quedan 5');
    await expect(alert).toContainText('pide 120');
    await alert.getByRole('button', { name: 'Aceptar' }).click();

    w.fail.confirm_order = 'INVALID_STATE:cancelled';
    await page.locator('tr', { hasText: 'Negocio Uno' }).getByRole('button', { name: 'Confirmar pedido' }).click();
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await expect(page.getByText(/estado que no permite esta acción/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
for (const width of [360, 412, 768, 1280]) {
  test(`admin a ${width}px: la tabla de productos mayoristas no desborda (cards en móvil)`, async ({ page }) => {
    const w = newAdmin();
    await openProducts(page, w, width);
    const m = await noOverflow(page);
    const offenders = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}→${Math.round(e.getBoundingClientRect().right)}`));
    expect(m.sw, `scrollWidth ${m.sw} > ${m.iw}; ${offenders.join(' | ')}`).toBeLessThanOrEqual(m.iw);
    if (width < 768) {
      // en móvil cada fila es una card: las etiquetas salen de data-label
      await expect(page.locator('tbody td[data-label="Precio mayorista"]').first()).toBeVisible();
      const display = await page.locator('tbody tr').first().evaluate((el) => getComputedStyle(el).display);
      expect(display).toBe('block');
    }
    await page.getByRole('checkbox', { name: /Seleccionar Cadena Cubana/ }).check();
    const m2 = await noOverflow(page);
    expect(m2.sw).toBeLessThanOrEqual(m2.iw);
    if (process.env.SHOT_DIR && (width === 412 || width === 1280)) await page.screenshot({ path: `${process.env.SHOT_DIR}/admin-table-${width}.png`, fullPage: true });
  });
}
