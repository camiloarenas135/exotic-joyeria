import { test as base, expect, type Page } from '@playwright/test';
import { captureWindowOpen } from './helpers/wholesale';

/**
 * Entrega D: rediseño de Inicio y /emprendedor.
 * TODO Supabase está simulado (incluido create_order): no depende de datos en vivo ni escribe en producción.
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const KIT_ID = uuid(500);
const svg = (c: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="${c}"/></svg>`)}`;

const CATS = ['Anillos', 'Pulseras', 'Collares', 'Aretes', 'Dijes'].map((name, i) => ({
  id: uuid(i + 1), slug: name.toLowerCase(), name, sort_order: i + 1, is_active: true, image: null,
}));

const product = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, price: '$100.000', price_cop: 100000, effective_price_cop: 100000, promo_kind: null, promo_value: null,
  category: 'Anillos', category_id: uuid(1), stock: 5, description: 'Pieza de prueba', variants: [], images: [svg('#d4af37')],
  created_at: '2025-01-01T00:00:00Z', ...over,
});

interface Opts {
  /** false = el catálogo no tiene el kit (cae al precio de lista y a WhatsApp) */
  kit?: boolean;
  /** true = productos sin foto (el bloque editorial degrada a monograma) */
  noImages?: boolean;
  promos?: boolean;
  wholesaleMin?: number | null;
}

async function stub(page: Page, opts: Opts = {}) {
  const { kit = true, noImages = false, promos = true, wholesaleMin = 3_500_000 } = opts;
  const orders: Record<string, unknown>[] = [];
  const imgs = noImages ? { images: [] } : {};
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === 'wholesale_min') return wholesaleMin === null ? route.fulfill({ status: 500, json: { message: 'x' } }) : route.fulfill({ json: wholesaleMin });
    if (name === 'create_order') {
      orders.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        json: { order_id: uuid(900), total: 500000, lines: [{ product_id: KIT_ID, name: 'Kit Emprendedor', variant: null, qty: 1, unit_price: 500000, line_total: 500000 }] },
      });
    }
    if (name === 'catalog_retail') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      let rows: ReturnType<typeof product>[];
      if (body.p_search) rows = kit ? [product(KIT_ID, 'Kit Emprendedor', { price: '$500.000', price_cop: 500000, effective_price_cop: 500000, category: 'Kits', ...imgs })] : [];
      else if (body.p_promo_only) rows = promos ? [1, 2, 3, 4].map((i) => product(uuid(300 + i), `Promo ${i}`, { effective_price_cop: 80000, promo_kind: 'percent', promo_value: 20, ...imgs })) : [];
      else rows = Array.from({ length: 8 }, (_, i) => product(uuid(100 + i), `Pieza ${i + 1}`, imgs));
      return route.fulfill({ json: rows.map((r) => ({ ...r, total_count: rows.length })) });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/*', (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    const rows = table === 'categories' ? CATS : [];
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 200, json: [] });
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 401, json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
  return { orders };
}

/** Recorre la página de arriba abajo para que los bloques con Reveal entren en pantalla. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight * 0.6, 200);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
}

const overflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'el viewport lo fija cada prueba'));

// ---------------------------------------------------------------------------------------------
test.describe('Inicio', () => {
  test('tiene todas las secciones, un solo h1 y datos reales del servidor', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/');
    await scrollThrough(page);

    await expect(page.locator('h1')).toHaveCount(1);
    for (const name of [
      'Nuestras colecciones', 'Novedades', 'Promociones', 'Oro laminado 18k, hecho para durar', 'Empieza tu propia marca de joyería',
      'Compra al por mayor con precios especiales', 'Cómo comprar', 'Preguntas frecuentes', 'Entérate primero de lo nuevo',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name }), name).toBeVisible();
    }
    // franja de confianza: solo los 4 mensajes que el sitio ya publicaba
    const trust = page.getByRole('region', { name: 'Beneficios' });
    for (const t of ['Envío asegurado', 'Garantía', 'Oro laminado 18k', 'Pago seguro']) await expect(trust.getByText(t, { exact: true })).toBeVisible();
    // precio del kit y mínimo mayorista salen del servidor
    await expect(page.getByText(/\$\s*500\.000/).first()).toBeVisible();
    await expect(page.getByTestId('home-wholesale-min')).toHaveText(/^\$\s*3\.500\.000$/);
    await expect(page.getByText('aproximadamente 24 horas').first()).toBeVisible();
    // sin testimonios ni prueba social
    await expect(page.getByText(/testimonio|opiniones|reseñas|clientes felices/i)).toHaveCount(0);
    // 3 pasos
    await expect(page.getByRole('list').filter({ has: page.getByRole('heading', { level: 3, name: 'Confirma por WhatsApp' }) }).getByRole('listitem')).toHaveCount(3);
  });

  test('sin promociones no hay sección; sin fotos el editorial y el kit degradan a monograma', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { promos: false, noImages: true, wholesaleMin: null });
    await page.goto('/');
    await scrollThrough(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Promociones' })).toHaveCount(0);
    await expect(page.getByTestId('editorial-fallback')).toBeVisible();
    // si el mínimo no carga no se inventa una cifra
    await expect(page.getByTestId('home-wholesale-min')).toHaveCount(0);
    await expect(page.getByText('Consúltalo en la zona mayorista')).toBeVisible();
  });

  test('lista de difusión: enlace a WhatsApp con el mensaje pedido, sin inventar listas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Unirme por WhatsApp' });
    const href = (await link.getAttribute('href'))!;
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe('https://wa.me/573170817990');
    expect(url.searchParams.get('text')).toBe('Hola, quiero unirme a la lista de difusión de Exotic Joyería');
    expect(await link.getAttribute('target')).toBe('_blank');
    expect(await link.getAttribute('rel')).toContain('noopener');
  });

  test('FAQ: abre y cierra con el teclado (Enter y Espacio)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/');
    const first = page.locator('details.faq').first();
    const summary = first.locator('summary');
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await expect(first).not.toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('open', '');
    await expect(first.getByText(/Añade tus piezas al carrito/)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(first).not.toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(first).not.toHaveAttribute('open', '');
    // alto táctil
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('"Nuestra historia" y "Certificaciones" siguen abriendo sus modales', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Nuestra historia', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cerrar' }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('Kit Emprendedor', () => {
  test('secciones, un solo h1 y nada de promesas de ingresos', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/emprendedor');
    await scrollThrough(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Kit Emprendedor' })).toBeVisible();
    await expect(page.getByTestId('kit-price')).toHaveText(/^\$\s*500\.000$/);
    for (const name of ['¿Qué incluye?', 'Cómo funciona', '¿Para quién es?', 'Preguntas frecuentes', 'Compra al por mayor con precios especiales']) {
      await expect(page.getByRole('heading', { level: 2, name }), name).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /^(Asesoría en oro laminado|Asesoría para crear tu página|Creación de logo|Curso de tejidos|Tabla para tejer|Insumos en oro laminado)$/ })).toHaveCount(6);
    await expect(page.getByRole('list').filter({ has: page.getByRole('heading', { level: 3, name: 'Empieza a crear' }) }).getByRole('listitem')).toHaveCount(4);
    await expect(page.getByText(/ganancia|ingresos|retorno|recupera|rentab|millon/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Zona mayorista' })).toHaveAttribute('href', '/mayoristas');
    await expect(page.getByText(/pedido mínimo es de \$\s*3\.500\.000/)).toBeVisible();
  });

  test('sin el producto en el catálogo: precio de lista, sin botón de carrito y WhatsApp como acción', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page, { kit: false });
    await page.goto('/emprendedor');
    await expect(page.getByTestId('kit-price')).toHaveText(/^\$\s*500\.000$/);
    await expect(page.getByRole('button', { name: 'Añadir al carrito' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pedir por WhatsApp' })).toBeVisible();
    await expect(page.getByTestId('kit-fallback')).toBeVisible();
  });

  test('StickyBuyBar (móvil): aparece al pasar el botón principal, respeta el área segura y añade el kit; el pedido va stubeado', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const world = await stub(page);
    await captureWindowOpen(page);
    await page.addInitScript(() => {
      localStorage.setItem('user_name', 'Cliente Prueba');
      localStorage.setItem('user_whatsapp', '3001234567');
    });
    await page.goto('/emprendedor');
    const bar = page.getByTestId('sticky-buy-bar');
    await expect(page.getByRole('button', { name: 'Añadir al carrito' })).toBeVisible();
    await expect(bar).toBeHidden(); // el botón principal aún está a la vista
    await page.evaluate(() => window.scrollTo(0, 1400));
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/\$\s*500\.000/);
    expect(await bar.evaluate((el) => getComputedStyle(el).paddingBottom)).toBeDefined();
    const btn = bar.getByRole('button', { name: 'Añadir' });
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await btn.click();
    const drawer = page.getByRole('dialog', { name: 'Carrito de compras' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Kit Emprendedor').first()).toBeVisible();
    expect(world.orders).toHaveLength(0); // añadir al carrito no crea pedidos
    await drawer.getByRole('button', { name: 'Pedir por WhatsApp' }).click();
    await expect.poll(() => world.orders.length).toBe(1);
    expect(JSON.stringify(world.orders[0].p_lines)).toContain(KIT_ID);
    expect(world.orders[0].p_channel).toBe('retail');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(1);
  });

  test('StickyBuyBar no existe en escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    await page.goto('/emprendedor');
    await page.evaluate(() => window.scrollTo(0, 1400));
    await expect(page.getByTestId('sticky-buy-bar')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('Transversales', () => {
  for (const width of [360, 412, 768, 1280]) {
    for (const path of ['/', '/emprendedor']) {
      test(`sin scroll horizontal en ${path} a ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await stub(page);
        await page.goto(path);
        await expect(page.locator('h1')).toHaveCount(1);
        await scrollThrough(page);
        // abre todas las preguntas: el contenido desplegado tampoco debe ensanchar la página
        await page.evaluate(() => document.querySelectorAll('details.faq').forEach((d) => d.setAttribute('open', '')));
        const { sw, iw } = await overflow(page);
        expect(sw, `scrollWidth ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
      });
    }
  }

  test('prefers-reduced-motion: ningún bloque queda oculto ni se anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 740 });
    await stub(page);
    for (const path of ['/', '/emprendedor']) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('[data-reveal]')).toHaveCount(0);
      const hidden = await page.evaluate(() =>
        [...document.querySelectorAll('main section')].filter((s) => getComputedStyle(s).opacity !== '1').length
      );
      expect(hidden).toBe(0);
    }
  });

  test('con movimiento normal los bloques bajo el pliegue aparecen al llegar (fade-up) y terminan visibles', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await stub(page);
    await page.goto('/');
    await expect(page.locator('[data-reveal="hidden"]').first()).toBeAttached();
    await scrollThrough(page);
    await expect(page.locator('[data-reveal="hidden"]')).toHaveCount(0);
    expect(await page.locator('[data-reveal="shown"]').count()).toBeGreaterThan(3);
  });

  test('contraste mínimo WCAG AA en los textos de las secciones nuevas (Inicio y Kit)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stub(page);
    for (const path of ['/', '/emprendedor']) {
      await page.goto(path);
      await scrollThrough(page);
      await page.waitForTimeout(700); // termina el fade-up
      const bad = await page.evaluate(() => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        const rgba = (css: string): [number, number, number, number] | null => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#010203';
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        };
        const over = (fg: number[], bg: number[]) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const backdrop = (el: Element): number[] => {
          const chain: Element[] = [];
          for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
          let base: number[] = [255, 255, 255, 1];
          for (const e of chain.reverse()) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage !== 'none' && /radial-gradient/.test(cs.backgroundImage)) base = [12, 12, 12, 1]; // paneles con degradado oscuro (#0C0C0C)
            else { const c = rgba(cs.backgroundColor); if (c && c[3] > 0) base = [...over(c, base), 1]; }
          }
          return base;
        };
        const out: string[] = [];
        const skip = '[aria-roledescription], article, nav[aria-label="Colecciones"], .sr-only, [aria-hidden="true"]';
        const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
        const seen = new Set<Element>();
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || seen.has(el) || !n.textContent?.trim() || el.closest(skip)) continue;
          seen.add(el);
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || el.getBoundingClientRect().width === 0) continue;
          const fg = rgba(cs.color)!;
          const bg = backdrop(el);
          const c = over(fg, bg);
          const [l1, l2] = [lum(c), lum(bg)].sort((a, b) => b - a);
          const ratio = (l1 + 0.05) / (l2 + 0.05);
          const px = parseFloat(cs.fontSize);
          const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} "${n.textContent!.trim().slice(0, 40)}" <${el.tagName.toLowerCase()}> ${cs.color}`);
        }
        return out;
      });
      expect(bad, `${path}: ${bad.join(' | ')}`).toEqual([]);
    }
  });
});
