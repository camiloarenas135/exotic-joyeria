import { test as base, expect, type Page } from '@playwright/test';
import { newWorld, stubWholesaleWorld, captureWindowOpen, USER_A, USER_B, P_PLAIN, P_VAR, P_LOW, P_GONE, type World } from './helpers/wholesale';

/**
 * Entrega E: tienda mayorista = la misma tienda con precios mayoristas.
 * Landing pública, acceso, estados, tienda aprobada, pedido, carrito por usuario. TODO Supabase está simulado.
 */
const test = base.extend({});

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba');
  // Turnstile falso: entrega un token enseguida, haya o no clave configurada
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

const noOverflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
const circles = (page: Page) => page.getByRole('navigation', { name: 'Colecciones' });
const bar = (page: Page) => page.getByTestId('min-order-bar');
const cardOf = (page: Page, name: string) => page.locator('article', { hasText: name });
const cartKey = (uid: string) => `wholesale_cart_v2:${uid}`;
const seedCart = (page: Page, uid: string, lines: unknown[]) =>
  page.addInitScript(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [cartKey(uid), lines] as const);
const line = (productId: string, over: Record<string, unknown> = {}) => ({
  key: `${productId}::`, productId, variant: null, qty: 1, name: 'Producto', image: '', unit: 30000, retailRef: 50000, stock: 500, ...over,
});

// ---------------------------------------------------------------------------------------------
test.describe('landing pública (sin sesión)', () => {
  test('sin precios: secciones, mínimo desde wholesale_min, 24 h, FAQ y vista previa bloqueada', async ({ page }) => {
    const world = newWorld({ session: false, status: null, min: 4_200_000 });
    await open(page, world, '/mayoristas');
    await expect(page.getByRole('heading', { level: 1, name: 'Precios para mayoristas' })).toBeVisible();
    for (const t of ['Precio mayorista único', 'El mismo catálogo', 'Pedido por WhatsApp', 'Envío asegurado']) {
      await expect(page.getByRole('heading', { name: t })).toBeVisible();
    }
    for (const t of ['Solicita tu acceso', 'Te aprobamos', 'Haz tu pedido']) await expect(page.getByRole('heading', { name: t })).toBeVisible();
    await expect(page.getByTestId('min-order-text')).toContainText(/4\.200\.000/);
    await expect(page.getByTestId('approval-note')).toContainText('aproximadamente 24 horas');

    // vista previa bloqueada: foto y nombre, ningún precio
    const preview = page.getByTestId('locked-preview');
    await expect(preview.locator('li')).toHaveCount(3);
    await expect(preview.getByText('Inicia sesión para ver el precio')).toHaveCount(3);
    await expect(preview.locator('img').first()).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/30\.000|50\.000|40\.000|20\.000/);
    expect(world.calls.wholesale).toEqual([]);

    // FAQ con <details>
    const first = page.locator('details').first();
    await expect(page.locator('details')).toHaveCount(5);
    await first.locator('summary').click();
    await expect(first).toHaveAttribute('open', '');

    // CTA y menú: la landing no es parte del menú del mayorista aprobado
    await expect(page.getByRole('link', { name: 'Solicitar acceso' }).first()).toHaveAttribute('href', '/mayoristas/acceso?tab=registro');
    await expect(page.getByRole('link', { name: 'Ya tengo cuenta' })).toHaveAttribute('href', '/mayoristas/acceso');
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/landing-1280.png`, fullPage: true });
  });

  test('landing a 360px: legible y sin scroll horizontal', async ({ page }) => {
    await open(page, newWorld({ session: false, status: null }), '/mayoristas', 360);
    await expect(page.getByTestId('locked-preview')).toBeVisible();
    const m = await noOverflow(page);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/landing-360.png`, fullPage: true });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('acceso /mayoristas/acceso', () => {
  test('registro en 3 pasos con validación y signUp con los datos del negocio', async ({ page }) => {
    const world = newWorld({ session: false, status: null });
    await open(page, world, '/mayoristas/acceso?tab=registro');
    await expect(page.getByText('Paso 1 de 3')).toBeVisible();
    await page.getByLabel('Correo').fill('nuevo@ejemplo.com');
    await page.getByLabel('Contraseña').fill('123');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('alert')).toContainText('al menos 8 caracteres');
    await page.getByLabel('Contraseña').fill('12345678');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByText('Paso 2 de 3')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('alert')).toContainText('nombre de tu negocio');
    await page.getByLabel('Nombre del negocio').fill('Joyas del Valle');
    await page.getByLabel('Ciudad').fill('Cali');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByText('Paso 3 de 3')).toBeVisible();
    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('123');
    await page.getByRole('button', { name: 'Solicitar acceso' }).click();
    await expect(page.getByRole('alert')).toContainText('WhatsApp no es válido');
    expect(world.calls.signup).toHaveLength(0);

    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('300 123 4567');
    await page.getByRole('button', { name: 'Solicitar acceso' }).click();
    await expect(page.getByRole('status')).toContainText('Cuenta creada');
    expect(world.calls.signup).toHaveLength(1);
    const sent = world.calls.signup[0] as { email: string; data: Record<string, string> };
    expect(sent.email).toBe('nuevo@ejemplo.com');
    expect(sent.data).toMatchObject({ signup_type: 'wholesale', business_name: 'Joyas del Valle', city: 'Cali' });
    expect(sent.data.phone.replace(/\D/g, '')).toBe('3001234567');
  });

  test('si el correo ya tiene cuenta lo dice y manda a Ingresar', async ({ page }) => {
    const world = newWorld({ session: false, status: null, signupExists: true });
    await open(page, world, '/mayoristas/acceso?tab=registro');
    await page.getByLabel('Correo').fill('ya@ejemplo.com');
    await page.getByLabel('Contraseña').fill('12345678');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByLabel('Nombre del negocio').fill('Joyas');
    await page.getByLabel('Ciudad').fill('Cali');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('3001234567');
    await page.getByRole('button', { name: 'Solicitar acceso' }).click();
    await expect(page.getByRole('alert')).toContainText('ya tiene una cuenta');
  });

  test('ingresar y olvidé mi contraseña', async ({ page }) => {
    const world = newWorld({ session: false, status: null });
    await open(page, world, '/mayoristas/acceso');
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    await page.getByLabel('Correo').fill('olvido@ejemplo.com');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toContainText('enlace');
    expect(world.calls.recover).toBe(1);
  });

  test('cuenta con sesión pero sin solicitud: request_wholesale_access y pasa a "en revisión"', async ({ page }) => {
    const world = newWorld({ status: null });
    await open(page, world, '/mayoristas/acceso');
    await expect(page.getByRole('heading', { name: 'Completa tu solicitud mayorista' })).toBeVisible();
    await page.getByLabel('Nombre del negocio').fill('Mi Negocio');
    await page.getByLabel('Ciudad').fill('Bogotá');
    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('12');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByRole('alert')).toContainText('WhatsApp no es válido');
    expect(world.calls.requestAccess).toHaveLength(0);
    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('3001234567');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page).toHaveURL(/\/mayoristas$/);
    await expect(page.getByRole('heading', { name: 'Tu solicitud está en revisión' })).toBeVisible();
    expect(world.calls.requestAccess[0]).toMatchObject({ p_business_name: 'Mi Negocio', p_city: 'Bogotá', p_tax_id: null });
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('estados de la cuenta', () => {
  test('pendiente: aviso de 24 h, ningún precio; "revisar estado" detecta la aprobación', async ({ page }) => {
    const world = newWorld({ status: 'pending' });
    await open(page, world, '/mayoristas', 360);
    await expect(page.getByRole('heading', { name: 'Tu solicitud está en revisión' })).toBeVisible();
    await expect(page.getByTestId('status-pending')).toContainText('aproximadamente 24 horas');
    await expect(page.getByText('En revisión por el administrador')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Añadir', exact: true })).toHaveCount(0);
    const m = await noOverflow(page);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    // aún pendiente
    await page.getByRole('button', { name: 'Revisar estado de mi solicitud' }).click();
    await expect(page.getByTestId('status-pending').getByRole('status')).toContainText('sigue en revisión');
    expect(world.calls.wholesale).toEqual([]);
    // el administrador aprueba: el botón lleva a la tienda
    world.status = 'approved';
    await page.getByRole('button', { name: 'Revisar estado de mi solicitud' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Cuenta mayorista' })).toBeVisible();
  });

  test('rechazado y suspendido: mensaje neutro con WhatsApp', async ({ page }) => {
    const world = newWorld({ status: 'rejected' });
    await open(page, world, '/mayoristas', 360);
    await expect(page.getByRole('heading', { name: 'No pudimos habilitar tu acceso' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Escribir por WhatsApp' })).toBeVisible();
    world.status = 'suspended';
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tu acceso está suspendido' })).toBeVisible();
  });

  test('con la cuenta aprobada /mayoristas lleva a la tienda', async ({ page }) => {
    await open(page, newWorld(), '/mayoristas');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /Hola, Negocio de Prueba/ })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('tienda mayorista aprobada', () => {
  test('menú, cuenta mayorista y círculos: sin Kit/Mayorista/Promociones ni burbuja', async ({ page }) => {
    const world = newWorld({ promo: true });
    await open(page, world, '/');
    await expect(page.getByRole('heading', { level: 1, name: /Hola/ })).toBeVisible();
    const main = page.getByRole('navigation', { name: 'Principal' });
    await expect(main.getByRole('link')).toHaveText(['Inicio']);
    await expect(main.getByRole('button', { name: 'Catálogo' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Mayorista|Mayoristas|Emprendedor|Kit Emprendedor|Promociones)$/ })).toHaveCount(0);

    // círculos: solo colecciones con productos publicados, sin burbuja y sin pedir promo_cover
    await expect(circles(page).getByRole('link')).toHaveText([/Cadenas/, /Candongas/]);
    await expect(circles(page).getByTestId('promo-bubble')).toHaveCount(0);
    expect(world.calls.promoCover).toBe(0);
    expect(world.calls.covers).not.toContain('retail');

    await page.getByRole('button', { name: 'Cuenta mayorista' }).click();
    const menu = page.locator('#menu-cuenta-mayorista');
    await expect(menu.getByRole('button', { name: 'Mi pedido' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Soporte WhatsApp' })).toHaveAttribute('href', /wa\.me/);
    await expect(menu.getByRole('button', { name: 'Salir' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Cuenta mayorista' })).toHaveAttribute('aria-expanded', 'false');
    // la fila de Novedades usa el canal mayorista
    await expect(page.getByRole('button', { name: /Ver Cadena Cubana/ })).toBeVisible();
    expect(world.calls.retail).toEqual([]);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/store-1280-home.png`, fullPage: true });
  });

  test('catálogo: precio mayorista, detal tachado y ahorro; filtros sin promoción; /promociones redirige', async ({ page }) => {
    const world = newWorld();
    await open(page, world, '/catalogo');
    const cadena = cardOf(page, 'Cadena Cubana');
    await expect(cadena).toContainText(/30\.000/);
    await expect(cadena.getByTestId('retail-ref')).toContainText(/Detal.*50\.000/);
    await expect(cadena.getByTestId('retail-ref')).toContainText(/Ahorras.*20\.000.*40%/);
    const candonga = cardOf(page, 'Candonga');
    await expect(candonga).toContainText('Desde');
    await expect(candonga).toContainText(/20\.000/);
    await expect(candonga.getByTestId('retail-ref')).toContainText(/40\.000/);
    await expect(cadena.getByRole('button', { name: 'Elegir cantidades' })).toBeVisible();
    // sin promociones: ni badge ni filtro
    await expect(page.getByLabel('En promoción')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hasta $30.000' })).toBeVisible();
    expect(world.calls.wholesale.length).toBeGreaterThan(0);
    expect(world.calls.wholesale.every((c) => !('p_promo_only' in c))).toBe(true);
    expect(world.calls.retail).toEqual([]);
    await page.goto('/promociones');
    await expect(page).toHaveURL(/\/catalogo$/);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/store-1280-catalogo.png` });
  });

  test('colección y círculos: filtran con el canal mayorista', async ({ page }) => {
    const world = newWorld();
    await open(page, world, '/catalogo');
    await circles(page).getByRole('link', { name: 'Candongas' }).click();
    await expect(page).toHaveURL(/\/coleccion\/candongas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Candongas' })).toBeVisible();
    await expect(cardOf(page, 'Candonga')).toBeVisible();
    expect(world.calls.wholesale.some((c) => c.p_category === '00000000-0000-0000-0000-000000000002')).toBe(true);
  });

  test('matriz por variante: stepper de 44px, subtotal, tope de stock sumando variantes y edición', async ({ page }) => {
    await open(page, newWorld(), '/catalogo');
    await cardOf(page, 'Candonga').getByRole('button', { name: 'Elegir cantidades' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candonga con variantes' });
    const rows = dialog.getByTestId('wholesale-row');
    await expect(rows).toHaveCount(2);
    const plus = dialog.getByRole('button', { name: 'Aumentar 40cm x 1.5mm' });
    const box = (await plus.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < 4; i++) await plus.click();
    await expect(dialog.getByLabel('Cantidad de 40cm x 1.5mm')).toHaveValue('4');
    await expect(rows.first().getByTestId('row-subtotal')).toContainText(/80\.000/);
    // stock total 6: la segunda variante solo admite 2 más
    const plus2 = dialog.getByRole('button', { name: 'Aumentar 50cm x 1.5mm' });
    await plus2.click();
    await plus2.click();
    await expect(plus2).toBeDisabled();
    await expect(plus).toBeDisabled();
    await expect(dialog.getByTestId('panel-total')).toContainText(/130\.000/);
    await dialog.getByLabel('Cantidad de 50cm x 1.5mm').fill('9');
    await expect(dialog.getByLabel('Cantidad de 50cm x 1.5mm')).toHaveValue('2');
    await dialog.getByRole('button', { name: 'Añadir al pedido' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(bar(page)).toContainText('6 unidades');
    // se reabre con lo que ya está en el pedido
    await cardOf(page, 'Candonga').getByRole('button', { name: 'Elegir cantidades' }).click();
    const again = page.getByRole('dialog', { name: 'Candonga con variantes' });
    await expect(again.getByLabel('Cantidad de 40cm x 1.5mm')).toHaveValue('4');
    await expect(again.getByRole('button', { name: 'Actualizar pedido' })).toBeVisible();
    await again.getByLabel('Cantidad de 40cm x 1.5mm').fill('0');
    await again.getByLabel('Cantidad de 50cm x 1.5mm').fill('0');
    await again.getByRole('button', { name: 'Quitar del pedido' }).click();
    await expect(bar(page)).toContainText('0 unidades');
  });

  test('MinOrderBar y pedido: el mínimo bloquea con motivo visible, aria-live solo al cruzar, payload sin precios', async ({ page }) => {
    const world = newWorld();
    await open(page, world, '/catalogo');
    const live = bar(page).getByRole('status');
    await expect(bar(page)).toContainText(/3\.500\.000/);
    await expect(live).toHaveText('');

    const add = async (qty: string) => {
      await cardOf(page, 'Cadena Cubana').getByRole('button', { name: 'Elegir cantidades' }).click();
      const d = page.getByRole('dialog', { name: /Cadena Cubana/ });
      await d.getByRole('spinbutton').fill(qty);
      await d.getByRole('button', { name: /(Añadir al pedido|Actualizar pedido|Quitar del pedido)/ }).click();
      await expect(d).toHaveCount(0);
    };

    await add('10'); // $300.000: por debajo del mínimo
    await expect(bar(page).getByTestId('bar-status')).toContainText('Faltan');
    await expect(live).toHaveText(''); // no se anuncia cada unidad
    await bar(page).getByRole('button', { name: 'Ver pedido' }).click();
    const drawer = page.getByRole('dialog', { name: 'Mi pedido mayorista' });
    const send = drawer.getByRole('button', { name: 'Enviar pedido por WhatsApp' });
    await expect(send).toBeDisabled();
    await expect(drawer.getByTestId('send-reason')).toContainText(/Te faltan.*3\.200\.000/);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    await add('120'); // $3.600.000 ≥ mínimo: cruza el umbral
    await expect(bar(page).getByTestId('bar-status')).toHaveText('Mínimo alcanzado');
    await expect(live).toContainText('Alcanzaste el pedido mínimo');
    const announced = await live.innerText();
    await add('121'); // sigue por encima: el aviso no cambia
    await expect(live).toHaveText(announced);
    await expect(bar(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3500000');

    await bar(page).getByRole('button', { name: 'Ver pedido' }).click();
    await expect(send).toBeEnabled();
    await expect(drawer.getByTestId('send-reason')).toHaveCount(0);
    await expect(drawer.getByTestId('order-group')).toHaveCount(1);
    await send.click();
    await expect.poll(() => world.calls.createOrder.length).toBe(1);
    const body = world.calls.createOrder[0] as { p_channel: string; p_lines: { product_id: string; variant: string | null; qty: number }[] };
    expect(body.p_channel).toBe('wholesale');
    expect(body.p_lines).toEqual([{ product_id: P_PLAIN, variant: null, qty: 121 }]);
    expect(JSON.stringify(body.p_lines)).not.toMatch(/price|unit/i);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.join(' '))).toContain('wa.me');
    await expect(bar(page)).toContainText('0 unidades');
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/store-1280-bar.png` });
  });

  test('el mínimo sale de wholesale_min()', async ({ page }) => {
    await open(page, newWorld({ min: 4_200_000 }), '/');
    await expect(bar(page)).toContainText(/4\.200\.000/);
    await expect(page.getByRole('heading', { level: 1 }).locator('xpath=following::p[1]')).toContainText(/4\.200\.000/);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('carrito mayorista propio', () => {
  test('migra el carrito v1, se guarda por usuario y se borra al salir', async ({ page }) => {
    const world = newWorld();
    await page.addInitScript(() => {
      if (!localStorage.getItem('wholesale_cart_v2:22222222-2222-2222-2222-222222222222') && !sessionStorage.getItem('seeded')) {
        localStorage.setItem('wholesale_cart_v1', JSON.stringify([{ id: '00000000-0000-0000-0000-000000000101', variant: null, qty: 3 }]));
        sessionStorage.setItem('seeded', '1');
      }
    });
    await open(page, world, '/catalogo');
    await expect(bar(page)).toContainText('3 unidades');
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('wholesale_cart')));
    expect(keys).toEqual([cartKey(USER_A.id)]);
    // la validación completa nombre y precio
    await bar(page).getByRole('button', { name: 'Ver pedido' }).click();
    const drawer = page.getByRole('dialog', { name: 'Mi pedido mayorista' });
    await expect(drawer.getByTestId('order-group')).toContainText('Cadena Cubana');
    await expect(drawer.getByTestId('line-subtotal')).toContainText(/90\.000/);
    await page.keyboard.press('Escape');

    // salir: se borra todo carrito mayorista y se vuelve al detal
    await page.getByRole('button', { name: 'Cuenta mayorista' }).click();
    await page.locator('#menu-cuenta-mayorista').getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Mayorista' })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('wholesale_cart')))).toEqual([]);
    expect(world.calls.logout).toBe(1);
  });

  test('otro usuario no ve el carrito del anterior', async ({ page }) => {
    const world = newWorld({ user: USER_B });
    await seedCart(page, USER_A.id, [line(P_PLAIN, { qty: 7 })]);
    await open(page, world, '/catalogo');
    await expect(bar(page)).toContainText('0 unidades');
  });

  test('avisos: línea no disponible, precio cambiado y tope de stock; el envío se bloquea hasta resolverlos', async ({ page }) => {
    const world = newWorld();
    await seedCart(page, USER_A.id, [
      line(P_GONE, { name: 'Producto retirado', qty: 2 }),
      line(P_PLAIN, { qty: 120, unit: 25000, name: 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga' }),
      line(P_LOW, { qty: 9, unit: 10000, stock: 9, name: 'Anillo Poco Stock', retailRef: 20000 }),
    ]);
    await open(page, world, '/catalogo');
    await bar(page).getByRole('button', { name: 'Ver pedido' }).click();
    const drawer = page.getByRole('dialog', { name: 'Mi pedido mayorista' });
    await expect(drawer.getByText('Ya no está disponible en el catálogo mayorista.')).toBeVisible();
    await expect(drawer.getByText(/El precio cambió de .*25\.000.* a .*30\.000/)).toBeVisible();
    await expect(drawer.getByText(/Solo hay 5 unidades/)).toBeVisible();
    const send = drawer.getByRole('button', { name: 'Enviar pedido por WhatsApp' });
    await expect(send).toBeDisabled();
    await expect(drawer.getByTestId('send-reason')).toContainText('Resuelve los avisos');

    await drawer.getByRole('button', { name: 'Quitar', exact: true }).first().click(); // la no disponible
    await expect(drawer.getByText('Ya no está disponible en el catálogo mayorista.')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Entendido' }).click();
    await drawer.getByRole('button', { name: 'Ajustar' }).click();
    await expect(drawer.getByText(/Solo hay 5 unidades/)).toHaveCount(0);
    await expect(drawer.getByTestId('send-reason')).toHaveCount(0);
    // 120 × 30.000 + 5 × 10.000 = 3.650.000 ≥ mínimo
    await expect(send).toBeEnabled();
    expect(world.calls.createOrder).toHaveLength(0);
  });

  test('suspensión durante la sesión: al volver a la pestaña la tienda vuelve al detal', async ({ page }) => {
    const world = newWorld();
    await open(page, world, '/');
    await expect(page.getByRole('button', { name: 'Cuenta mayorista' })).toBeVisible();
    world.status = 'suspended';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('button', { name: 'Cuenta mayorista' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Mayorista' })).toBeVisible();
    await expect(page.getByTestId('channel-notice')).toContainText('ya no está activa');
    await expect(bar(page)).toHaveCount(0);
    await expect.poll(() => world.calls.retail.length).toBeGreaterThan(0);
  });

  test('NOT_WHOLESALER al enviar: mensaje y regreso al detal', async ({ page }) => {
    const world = newWorld({ createOrder: 'NOT_WHOLESALER' });
    await seedCart(page, USER_A.id, [line(P_PLAIN, { qty: 150, name: 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga' })]);
    await open(page, world, '/catalogo');
    await bar(page).getByRole('button', { name: 'Ver pedido' }).click();
    const drawer = page.getByRole('dialog', { name: 'Mi pedido mayorista' });
    const send = drawer.getByRole('button', { name: 'Enviar pedido por WhatsApp' });
    await expect(send).toBeEnabled();
    world.status = 'suspended';
    await send.click();
    // el error del drawer es pasajero (la tienda vuelve al detal enseguida): lo estable es el aviso de cuenta no activa
    await expect(page.getByTestId('channel-notice')).toContainText('ya no está activa');
    await expect(page.getByRole('button', { name: 'Cuenta mayorista' })).toHaveCount(0, { timeout: 8000 });
  });

  test('errores de create_order en español (VARIANT_REQUIRED, TOTAL_TOO_LARGE, RATE_LIMIT)', async ({ page }) => {
    const world = newWorld({ createOrder: 'RATE_LIMIT' });
    await seedCart(page, USER_A.id, [line(P_PLAIN, { qty: 150, name: 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga' })]);
    await open(page, world, '/catalogo');
    await bar(page).getByRole('button', { name: 'Ver pedido' }).click();
    const drawer = page.getByRole('dialog', { name: 'Mi pedido mayorista' });
    const send = drawer.getByRole('button', { name: 'Enviar pedido por WhatsApp' });
    await send.click();
    await expect(drawer.getByRole('alert')).toContainText('máximo 5 por hora');
    world.createOrder = 'TOTAL_TOO_LARGE';
    await send.click();
    await expect(drawer.getByRole('alert')).toContainText('demasiado grande');
    world.createOrder = 'VARIANT_REQUIRED:Candonga';
    await send.click();
    await expect(drawer.getByRole('alert')).toContainText('Elige una opción');
  });
});

// ---------------------------------------------------------------------------------------------
for (const w of [360, 412, 768, 1280]) {
  test(`sin scroll horizontal de la página a ${w}px: landing, acceso, tienda, modal y pedido`, async ({ page }) => {
    // Sin sesión: landing y acceso
    const guest = newWorld({ session: false, status: null });
    await open(page, guest, '/mayoristas', w);
    await expect(page.getByTestId('locked-preview')).toBeVisible();
    let m = await noOverflow(page);
    expect(m.sw, `landing a ${w}px`).toBeLessThanOrEqual(m.iw);
    await page.goto('/mayoristas/acceso?tab=registro');
    await expect(page.getByText('Paso 1 de 3')).toBeVisible();
    m = await noOverflow(page);
    expect(m.sw, `acceso a ${w}px`).toBeLessThanOrEqual(m.iw);
  });

  test(`sin scroll horizontal a ${w}px en la tienda mayorista aprobada`, async ({ page }) => {
    const world = newWorld();
    await seedCart(page, USER_A.id, [line(P_PLAIN, { qty: 3, name: 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga' })]);
    await open(page, world, '/', w);
    await expect(page.getByRole('heading', { level: 1, name: /Hola/ })).toBeVisible();
    let m = await noOverflow(page);
    expect(m.sw, `inicio a ${w}px`).toBeLessThanOrEqual(m.iw);
    await page.goto('/catalogo');
    await expect(cardOf(page, 'Candonga')).toBeVisible();
    m = await noOverflow(page);
    expect(m.sw, `catálogo a ${w}px`).toBeLessThanOrEqual(m.iw);
    if (process.env.SHOT_DIR && (w === 360 || w === 1280)) await page.screenshot({ path: `${process.env.SHOT_DIR}/store-${w}-catalogo.png`, fullPage: false });

    // modal con matriz: las variantes se apilan, sin scroll lateral dentro del diálogo
    await cardOf(page, 'Candonga').getByRole('button', { name: 'Elegir cantidades' }).click();
    const dialog = page.getByRole('dialog', { name: 'Candonga con variantes' });
    await expect(dialog.getByTestId('wholesale-row')).toHaveCount(2);
    const inner = await dialog.evaluate((el) => {
      const sc = [...el.querySelectorAll<HTMLElement>('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && e.clientWidth > 0);
      return { sw: el.scrollWidth, cw: el.clientWidth, scrollers: sc.length };
    });
    expect(inner.sw).toBeLessThanOrEqual(inner.cw + 1);
    expect(inner.scrollers).toBe(0);
    if (process.env.SHOT_DIR && (w === 360 || w === 1280)) await page.screenshot({ path: `${process.env.SHOT_DIR}/store-${w}-modal.png` });
    await page.keyboard.press('Escape');

    // pedido abierto
    await page.getByRole('button', { name: /Abrir mi pedido/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Mi pedido mayorista' });
    await expect(drawer.getByTestId('order-group')).toBeVisible();
    const dm = await drawer.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(dm.sw).toBeLessThanOrEqual(dm.cw + 1);
    m = await noOverflow(page);
    expect(m.sw, `pedido a ${w}px`).toBeLessThanOrEqual(m.iw);
    if (process.env.SHOT_DIR && (w === 360 || w === 1280)) await page.screenshot({ path: `${process.env.SHOT_DIR}/store-${w}-pedido.png` });
  });
}

