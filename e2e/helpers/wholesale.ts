import type { Page, Route } from '@playwright/test';

/** Mundo simulado para las pruebas mayoristas: TODO Supabase es falso (nada llega a producción). */

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = 4102444800; // año 2100

export const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

export const makeUser = (id: string, email: string) => ({
  id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2024-01-01T00:00:00Z',
});
export const makeSession = (user: ReturnType<typeof makeUser>) => {
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', exp: EXP })}.sig`;
  return { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 99999999, expires_at: EXP, user };
};

export const USER_A = makeUser('22222222-2222-2222-2222-222222222222', 'negocio@ejemplo.com');
export const USER_B = makeUser('33333333-3333-3333-3333-333333333333', 'otro@ejemplo.com');

export const svg = (c: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="${c}"/></svg>`)}`;

export const CATS = [
  { id: uuid(1), slug: 'cadenas', name: 'Cadenas', sort_order: 1, is_active: true, image: null },
  { id: uuid(2), slug: 'candongas', name: 'Candongas', sort_order: 2, is_active: true, image: null },
  { id: uuid(3), slug: 'sin-publicar', name: 'Sin publicar', sort_order: 3, is_active: true, image: null },
];

export const P_PLAIN = uuid(101);
export const P_VAR = uuid(102);
export const P_LOW = uuid(103);
export const P_GONE = uuid(199);

interface WProduct {
  id: string;
  name: string;
  category: string;
  category_id: string;
  stock: number;
  wholesale: number | null;
  retail: number;
  variants: { name: string; wholesale: number; retail: number }[];
}

/** Productos publicados para mayoristas (con su precio detal de referencia). */
export const WPRODUCTS: WProduct[] = [
  { id: P_PLAIN, name: 'Cadena Cubana Oro Laminado 18k Edición Especial Extra Larga', category: 'Cadenas', category_id: uuid(1), stock: 500, wholesale: 30000, retail: 50000, variants: [] },
  { id: P_VAR, name: 'Candonga con variantes', category: 'Candongas', category_id: uuid(2), stock: 6, wholesale: null, retail: 40000,
    variants: [{ name: '40cm x 1.5mm', wholesale: 20000, retail: 40000 }, { name: '50cm x 1.5mm', wholesale: 25000, retail: 45000 }] },
  { id: P_LOW, name: 'Anillo Poco Stock', category: 'Cadenas', category_id: uuid(1), stock: 5, wholesale: 10000, retail: 20000, variants: [] },
];

const wholesaleRow = (p: WProduct, total: number) => {
  const from = p.variants.length ? Math.min(...p.variants.map((v) => v.wholesale)) : (p.wholesale as number);
  return {
    id: p.id, name: p.name, price: `$${from}`, price_cop: from, effective_price_cop: from, promo_kind: null, promo_value: null,
    category: p.category, category_id: p.category_id, stock: p.stock, description: 'Pieza de prueba',
    variants: p.variants.map((v) => ({ name: v.name, price: `$${v.wholesale}`, price_cop: v.wholesale, effective_price_cop: v.wholesale, promo_kind: null, promo_value: null, retail_price_cop: v.retail, retail_effective_price_cop: v.retail })),
    images: [svg('#d4af37')], created_at: '2025-01-01T00:00:00Z', total_count: total,
    retail_price_cop: p.retail, retail_effective_price_cop: p.retail,
  };
};

const retailRow = (p: WProduct, total: number) => ({
  id: p.id, name: p.name, price: `$${p.retail}`, price_cop: p.retail, effective_price_cop: p.retail, promo_kind: null, promo_value: null,
  category: p.category, category_id: p.category_id, stock: p.stock, description: '', variants: [], images: [svg('#b76e79')],
  created_at: '2025-01-01T00:00:00Z', total_count: total,
});

export type WStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface World {
  /** null = usuario con sesión pero sin fila en wholesalers */
  status: WStatus | null;
  session: boolean;
  user: ReturnType<typeof makeUser>;
  min: number;
  /** productos que catalog_wholesale devuelve (por id); el resto "ya no está publicado" */
  published: Set<string>;
  promo: boolean;
  createOrder: 'ok' | 'NOT_WHOLESALER' | 'MIN_WHOLESALE' | string;
  calls: {
    wholesale: Record<string, unknown>[];
    retail: Record<string, unknown>[];
    promoCover: number;
    covers: string[];
    createOrder: Record<string, unknown>[];
    requestAccess: Record<string, unknown>[];
    signup: Record<string, unknown>[];
    recover: number;
    logout: number;
    mutations: string[];
  };
  signupExists: boolean;
}

export function newWorld(over: Partial<World> = {}): World {
  return {
    status: 'approved', session: true, user: USER_A, min: 3_500_000, published: new Set([P_PLAIN, P_VAR, P_LOW]), promo: false, createOrder: 'ok', signupExists: false,
    calls: { wholesale: [], retail: [], promoCover: 0, covers: [], createOrder: [], requestAccess: [], signup: [], recover: 0, logout: 0, mutations: [] },
    ...over,
  };
}

const wholesalerRow = (w: World) =>
  w.status
    ? { user_id: w.user.id, email: w.user.email, business_name: 'Negocio de Prueba', phone: '3001234567', city: 'Cali', tax_id: null, status: w.status, notes: null, created_at: '2025-01-01T00:00:00Z' }
    : null;

/** Registra todas las rutas de Supabase. Las respuestas salen del objeto `world`, que la prueba puede mutar en vivo. */
export async function stubWholesaleWorld(page: Page, world: World) {
  await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
  if (world.session) {
    await page.addInitScript((s) => localStorage.setItem('sb-bimkpnteulwsqxxdfopx-auth-token', JSON.stringify(s)), makeSession(world.user));
  }

  await page.route('**/auth/v1/**', async (route: Route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/logout')) {
      world.calls.logout++;
      world.session = false;
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('/signup')) {
      const body = req.postDataJSON() as Record<string, unknown>;
      world.calls.signup.push(body);
      const identities = world.signupExists ? [] : [{ id: 'x', identity_id: 'x', user_id: 'n', provider: 'email' }];
      return route.fulfill({ json: { id: uuid(900), aud: 'authenticated', role: '', email: body.email, identities, user_metadata: {}, app_metadata: {}, created_at: '2025-01-01T00:00:00Z' } });
    }
    if (url.includes('/recover')) {
      world.calls.recover++;
      return route.fulfill({ json: {} });
    }
    if (url.includes('/user')) return route.fulfill({ json: world.user });
    return route.fulfill({ json: makeSession(world.user) });
  });

  await page.route('**/rest/v1/rpc/**', async (route: Route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/').pop()!;
    const body = (req.method() === 'POST' ? (req.postDataJSON() ?? {}) : {}) as Record<string, unknown>;
    switch (name) {
      case 'wholesale_min':
        return route.fulfill({ json: world.min });
      case 'catalog_wholesale': {
        world.calls.wholesale.push(body);
        if (world.status !== 'approved') return route.fulfill({ json: [] });
        let list = WPRODUCTS.filter((p) => world.published.has(p.id));
        if (body.p_id) list = list.filter((p) => p.id === body.p_id);
        if (body.p_category) list = list.filter((p) => p.category_id === body.p_category);
        if (body.p_search) list = list.filter((p) => p.name.toLowerCase().includes(String(body.p_search).toLowerCase()));
        if (body.p_in_stock) list = list.filter((p) => p.stock > 0);
        return route.fulfill({ json: list.map((p) => wholesaleRow(p, list.length)) });
      }
      case 'catalog_retail': {
        world.calls.retail.push(body);
        let list = WPRODUCTS;
        if (body.p_id) list = list.filter((p) => p.id === body.p_id);
        return route.fulfill({ json: list.map((p) => retailRow(p, list.length)) });
      }
      case 'collection_covers_wholesale': {
        world.calls.covers.push('wholesale');
        if (world.status !== 'approved') return route.fulfill({ json: [] });
        // solo "Cadenas" y "Candongas" tienen productos publicados
        return route.fulfill({ json: [{ category_id: uuid(1), image: svg('#d4af37'), product_count: 2 }, { category_id: uuid(2), image: svg('#7a8fa6'), product_count: 1 }] });
      }
      case 'collection_covers':
        world.calls.covers.push('retail');
        return route.fulfill({ json: CATS.map((c) => ({ category_id: c.id, image: svg('#999999') })) });
      case 'promo_cover':
        world.calls.promoCover++;
        return route.fulfill({ json: world.promo ? [{ image: svg('#b76e79'), product_name: 'Oferta', max_discount_pct: 30, promo_count: 3, valid_until: null }] : [] });
      case 'create_order': {
        world.calls.createOrder.push(body);
        if (world.createOrder === 'ok') {
          const lines = (body.p_lines as { product_id: string; variant: string | null; qty: number }[]).map((l) => {
            const p = WPRODUCTS.find((x) => x.id === l.product_id)!;
            const unit = l.variant ? p.variants.find((v) => v.name === l.variant)!.wholesale : (p.wholesale as number);
            return { product_id: l.product_id, name: p.name, variant: l.variant, qty: l.qty, unit_price: unit, line_total: unit * l.qty };
          });
          return route.fulfill({ json: { order_id: 'o1', total: lines.reduce((s, l) => s + l.line_total, 0), lines } });
        }
        return route.fulfill({ status: 400, json: { message: world.createOrder === 'MIN_WHOLESALE' ? `MIN_WHOLESALE:${world.min}` : world.createOrder, code: 'P0001' } });
      }
      case 'request_wholesale_access':
        world.calls.requestAccess.push(body);
        world.status = 'pending';
        return route.fulfill({ json: { status: 'pending', created: true } });
      default:
        return route.fulfill({ json: [] });
    }
  });

  await page.route('**/rest/v1/*', async (route: Route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop()!;
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      world.calls.mutations.push(`${req.method()} ${table}`);
      return route.fulfill({ status: 200, json: [] });
    }
    const single = (req.headers()['accept'] ?? '').includes('object+json');
    let rows: unknown[] = [];
    if (table === 'categories') rows = CATS;
    if (table === 'wholesalers') {
      const w = wholesalerRow(world);
      rows = w ? [w] : [];
    }
    return route.fulfill({ status: 200, json: single ? (rows[0] ?? null) : rows });
  });
  await page.route('**/storage/v1/**', (route) => route.fulfill({ json: {} }));
  await page.routeWebSocket(/realtime/, () => undefined);
}

/** window.open falso: evita ventanas reales y deja ver a qué URL se mandó el pedido. */
export async function captureWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = (() => {
      const fake = { opener: null as unknown, close() {}, location: { set href(v: string) { (window as unknown as { __opened: string[] }).__opened.push(v); } } };
      return fake as unknown as Window;
    }) as typeof window.open;
  });
}
