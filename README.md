# Exotic Joyería

Tienda en línea de joyería en oro laminado 18k, con zona mayorista. Sitio: https://exoticjoyeria.lat

## Stack

| Tecnología | Uso |
|---|---|
| React 19 + TypeScript | Interfaz |
| Vite 6 | Compilación |
| Tailwind CSS v4 | Estilos |
| react-router-dom | Rutas |
| Motion | Animaciones |
| Supabase | Base de datos (Postgres con RLS), autenticación, Storage y Edge Function |
| Cloudflare Workers (assets) | Hosting y CDN |
| Cloudflare Turnstile | Anti-bots en registro, login y recuperación |
| Resend | Correo de cuenta mayorista aprobada (desde la Edge Function) |
| Playwright | Pruebas e2e |

## Cómo funciona

- **Detal:** catálogo por colecciones (un solo nivel), ordenado de menor a mayor precio por defecto (el orden lo hace el servidor), promociones manuales, carrito, y pedido que se envía por WhatsApp.
- **Pedidos:** el navegador nunca fija precios. Todo pedido se crea con la función `create_order` de Supabase, que calcula precios y totales en el servidor y devuelve el total que se manda por WhatsApp. El stock **no** se descuenta al crear: lo descuenta el admin al **confirmar** el pedido (`confirm_order`; `cancel_order` lo devuelve).
- **Mayorista:** cuenta con correo y contraseña (no Google), aprobada a mano por el admin. Una vez aprobada, la tienda muestra los precios mayoristas (tabla `wholesale_prices`, que elige el admin) con carrito separado. Pedido mínimo de **$3.500.000 en un solo pedido**, validado en el servidor (`settings.wholesale_min_cop`). El mayorista ve su historial en `/mayoristas/pedidos`.
- **Kit Emprendedor:** página `/emprendedor`. La compra se hace con el botón “Pedir por WhatsApp”, que abre la conversación con el pedido del kit.
- **Correos:** solo se envía el correo de **cuenta aprobada** (Edge Function `wholesale-mail`). La recuperación de contraseña la manda Supabase Auth. Los rechazos y avisos de registro se manejan por WhatsApp.

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Inicio |
| `/catalogo`, `/coleccion/:slug`, `/promociones`, `/buscar` | Catálogo, colección, promociones, búsqueda |
| `/?producto=<id>` | Enlace directo a un producto (abre el modal) |
| `/emprendedor` | Kit Emprendedor (solo detal) |
| `/mayoristas` | Presentación de la zona mayorista y estado de la solicitud |
| `/mayoristas/acceso` | Ingresar, registrarse, olvidé mi contraseña |
| `/mayoristas/pedidos` | Historial de pedidos del mayorista aprobado |
| `/admin` | Panel de administración (Google) |
| `/categoria/:slug` | Antigua; redirige a `/coleccion/:slug` |

## Configuración local

Requisitos: Node.js 18+.

```bash
npm install
cp .env.example .env     # y rellena los valores
npm run dev              # http://localhost:3000
```

Variables (`.env`; nunca se sube al repositorio):

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (anon) de Supabase |
| `VITE_TURNSTILE_SITE_KEY` | Clave pública de Turnstile. Sin ella el widget no aparece; con el CAPTCHA activo en Supabase, **sin la clave nadie puede ingresar ni registrarse** |

Comandos útiles: `npm run lint` (tsc), `npm run build`, `npm run test:e2e`.

## Base de datos (Supabase)

Proyecto `bimkpnteulwsqxxdfopx`. Los cambios se hacen **solo con migraciones numeradas** en `supabase/migrations/` (cada una con su `.rollback.sql` cuando aplica). Son aditivas e idempotentes.

- Antes de aplicar una migración, saca un respaldo.
- **No ejecutes `supabase_setup.sql` en producción:** es el script inicial antiguo; vuelve a definir `is_admin()` por correo y recrea políticas viejas. Se conserva solo como referencia.
- Resumen: `001` admins · `002` precios numéricos · `003` settings, pedidos y `order_lines` · `010` colecciones · `020` slides del Hero · `021`/`050` promociones · `022` Storage · `030` mayoristas · `040`/`056` `create_order` · `051` precio por variante · `052`/`053` portadas · `054` catálogo por canal · `055` administración mayorista, `confirm_order`/`cancel_order` · `057` historial del mayorista y columna `last_status_notified`.

### Seguridad

- Dos administradores, en la tabla `admins` (la verificación real es `is_admin()` en el servidor; la lista de correos del front es solo visual).
- Los precios mayoristas no son legibles por `anon`; el catálogo mayorista solo responde a cuentas aprobadas.
- El INSERT directo a `orders` (política `orders_insert_public`) sigue abierto por compatibilidad; está previsto cerrarlo tras observar pedidos reales por `create_order` (ver `PLAN-REVISION-2026-11.md`).
- Cabeceras y CSP en `public/_headers`.

## Edge Function `wholesale-mail`

`supabase/functions/wholesale-mail/index.ts`. Envía el correo de “cuenta aprobada”. Solo la puede disparar un admin autenticado; el destinatario sale de la base. Requiere el secreto `RESEND_API_KEY` (la acción `health` indica si está configurado). Se despliega con la CLI de Supabase.

## Turnstile y CAPTCHA

El widget se muestra en Ingresar, Registrarme (paso 3) y Olvidé mi contraseña. Supabase → Authentication → Attack Protection tiene el CAPTCHA activo con la clave secreta de Turnstile (la secreta vive solo en Supabase). Si cambias de widget, actualiza `VITE_TURNSTILE_SITE_KEY` y la secreta en Supabase **al mismo tiempo** y vuelve a desplegar.

## Despliegue (Cloudflare)

El Worker `exotic-joyeria` de la cuenta **kevinlgomez058@gmail.com** sirve `exoticjoyeria.lat` y `www.exoticjoyeria.lat`.

```bash
npx wrangler whoami                      # confirma que la cuenta sea kevinlgomez058@gmail.com
npm run build                            # genera public/sitemap.xml y dist/
CLOUDFLARE_ACCOUNT_ID=1b722a210a4700b77ec9e8c998f70473 npx wrangler deploy
```

> Este equipo tiene más de una cuenta de Cloudflare. Si `whoami` muestra otra, un deploy crearía el sitio en la cuenta equivocada. Cierra sesión con `npx wrangler logout` y entra con la correcta (`npx wrangler login`).

`npm run build` regenera `public/sitemap.xml` (rutas fijas + colecciones activas). `public/robots.txt` bloquea `/admin`, `/mayoristas/acceso` y `/mayoristas/pedidos`. El fallback de SPA está en `wrangler.jsonc`.

## Pruebas

```bash
npm run test:e2e
```

Playwright con Supabase simulado (`e2e/helpers/wholesale.ts`): compra al detal, flujo mayorista completo, Mis pedidos, Turnstile, navegación, catálogo y admin en móvil, y que no haya scroll horizontal. No prueban la base real: la configuración de Supabase (CAPTCHA, registro habilitado, migraciones) se verifica a mano tras cada despliegue.

## Estructura

```
src/
├── components/   # Interfaz: tienda (Header, ProductCard, Cart…), mayorista (WholesaleAuth, WholesaleCartDrawer…), admin (Admin*.tsx)
├── context/      # AppContext (carrito detal), ChannelContext (sesión y canal), WholesaleCartContext, CategoriesContext
├── lib/          # catalog, pricing, wholesale, supabase, sanitize, kit
├── pages/        # Home, CatalogPage, Mayoristas, MayoristasAcceso, MisPedidos, Emprendedor…
supabase/
├── migrations/   # SQL numerado + rollbacks
└── functions/    # wholesale-mail
e2e/              # Pruebas Playwright
scripts/          # gen-sitemap.mjs (se ejecuta antes del build)
public/           # _headers, robots.txt, logos
```

## Documentos del proyecto

- `PLAN-IMPLEMENTACION.md`: plan por fases y decisiones cerradas con el cliente.
- `PLAN-REVISION-2026-11.md`: pendientes surgidos de la revisión del 3-nov-2026.
