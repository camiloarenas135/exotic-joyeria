# Plan de implementación posterior a la revisión (3-nov-2026)

Origen: cinco revisiones de solo lectura (seguridad, código, accesibilidad, rendimiento/SEO y cotejo contra `PLAN-IMPLEMENTACION.md`).
Estado de partida: producción desplegada con Mis pedidos, Turnstile en login/registro/recuperación y migración 057; e2e 263/263; `tsc` limpio.
Decisiones cerradas que no se reabren: mayorista simple, categorías de un nivel, promos manuales, stock se descuenta al confirmar.

Convención: **[TÚ]** = acción que solo puedes hacer tú (paneles, cliente). **[Agente]** = lo ejecuta Claude con ese agente.

---

## Fase 0 — Antes de entregar al cliente (hoy y mañana)

| # | Tarea | Quién | Detalle |
|---|---|---|---|
| 0.1 | Revocar el token personal de Supabase (`sbp_…`) | [TÚ] | Supabase → Account → Access Tokens. Está en texto plano en `scratch/execute_test_sql.ts` y `scratch/fetch_api_keys.ts` (OneDrive). No está en el historial de Git. |
| 0.2 | ✅ HECHO (3-nov) Reescribir los scripts de `scratch/` para leer el token por variable de entorno |
| 0.3 | ✅ DECIDIDO: el Kit Emprendedor se compra con el botón “Pedir por WhatsApp”; no se crea producto. El mensaje ahora dice “quiero comprar el Kit Emprendedor ($500.000)” |
| 0.4 | Confirmar redirecciones de Auth | [TÚ] | Supabase → Auth → URL Configuration: `https://exoticjoyeria.lat` y `https://www.exoticjoyeria.lat`, con `/admin` y `/mayoristas` (sin comodines). |
| 0.5 | ✅ DECIDIDO: las 5 categorías (Exclusivo, Pulseras Tejidas, Tobilleras, Plata Ley 925, Bebés) se quitan. Ya no salen en la lista pública y se retiraron de `src/lib/categories.ts` |
| 0.6 | ✅ DECIDIDO: solo el correo de **aprobación**. No se implementan aviso al dueño, acuse al cliente ni correo de rechazo (se avisa por WhatsApp) |
| 0.7 | ✅ HECHO Bug: un fallo de red convertía al mayorista en cliente detal (`ChannelContext.tsx`: una relectura fallida ya no cambia el estado) |
| 0.8 | ✅ VERIFICADO `wholesale-mail` desplegada y `RESEND_API_KEY` configurada (acción `health`: `resend_key_configured: true`) |

**Criterio de salida:** guion de prueba completo con una cuenta de prueba (registro → aprobación + correo → login → pedido ≥ $3.5M → confirmar → Mis pedidos), sin errores.

---

## Fase 1 — Integridad de pedidos (entrega + 2 o 3 días)

| # | Tarea | Agente |
|---|---|---|
| 1.1 | **Cerrar el INSERT directo a `orders`** (`drop policy orders_insert_public` y revocar INSERT a `anon`). Hacerlo tras 2–3 días observando pedidos reales por `create_order`. Dejar el comando de reapertura a mano. Antes, revisar que `AdminOrders.tsx:112,163,252` no haga inserts/updates directos (si hay updates, dejar UPDATE al admin). Prueba de regresión: un POST anon a `/orders` devuelve 401/403. | Backend Architect + Database Reliability Engineer |
| 1.2 | Tope global de pedidos al detal por hora en `create_order` (el límite por teléfono se evade cambiando el número). | Backend Architect |
| 1.3 | Idempotencia de pedidos: guarda con `useRef` contra doble clic y `client_request_id` opcional en el RPC. | Backend Architect + Frontend Developer |
| 1.4 | `checkRateLimit` del carrito gasta cupo aunque el pedido falle (`Cart.tsx:35`): registrar solo si el RPC tuvo éxito. | Frontend Developer |
| 1.5 | `AdminCatalog.tsx:325`: editar un producto puede reponer stock ya descontado. Enviar `stock` solo si el admin lo cambió. | Frontend Developer |
| 1.6 | `AdminOrders`: realtime que vuelve a página 0 y respuestas desordenadas (usar `reqId` como en `AdminWholesalePrices`). Botón "Confirmar Pago" → "Confirmar pedido". | Frontend Developer |
| 1.7 | `AdminStats`: contar solo pedidos `confirmed`, revisar `error`, quitar límites silenciosos. | Frontend Developer + Data Engineer |

---

## Fase 2 — Seguridad media y baja

| # | Tarea | Agente |
|---|---|---|
| 2.1 | `wholesalers`: que el mayorista no lea `notes`, `reviewed_by`, `last_status_notified` (revocar SELECT por columna + RPC o vista para el admin; ajustar `ChannelContext`). | Application Security Engineer |
| 2.2 | VIP: límite de longitud en la política, mismo mensaje exista o no el registro, y Turnstile (mover el alta a un RPC). Arreglar `includes('violates')` → `error.code === '23505'`. | Application Security Engineer + Frontend Developer |
| 2.3 | Enumeración de cuentas en el registro (mensaje genérico). Decisión tuya: pierde algo de UX. | Identity & Access Engineer |
| 2.4 | `wholesale-mail`: mover `health` detrás del chequeo de admin; evitar doble correo por carrera; confirmar `verify_jwt`. | Backend Architect |
| 2.5 | CSP: limitar `img-src`/`connect-src` al proyecto `bimkpnteulwsqxxdfopx` en vez de `*.supabase.co`; añadir `form-action 'self'`; quitar `X-XSS-Protection`. | Senior SecOps Engineer |
| 2.6 | Mover `supabase_setup.sql` a `docs/legacy/` sin parte ejecutable (pisa `is_admin()` y recrea políticas viejas). | Database Reliability Engineer |
| 2.7 | 2FA en las dos cuentas de Google admin. | [TÚ] |
| 2.8 | Pruebas de RLS por rol con el cliente real (anon, pendiente, aprobado, suspendido, admin) como suite automatizada. | Test Automation Engineer + API Tester |

---

## Fase 3 — Accesibilidad

| # | Tarea | Agente |
|---|---|---|
| 3.1 ✅ | Hook común `useDialog` (inert en `#root`, trampa de Tab, Escape, retorno de foco) copiando `MobileDrawer.tsx:33-71`. Aplicarlo a `ProductModal`, `Cart`, `WholesaleCartDrawer`, `Search`, filtros de `CatalogPage` y los 8 modales legales (con `role="dialog"`, `aria-modal`, `aria-labelledby`). | Accessibility Auditor + Frontend Developer |
| 3.2 ✅ | Contraste: dorado `#D4AF37` solo sobre fondos oscuros; texto dorado sobre claro → `gold-ink`; verde WhatsApp `#1f8f4a` → `#187a3e`; subir `black/50`, `/45`, `/40` a `black/65` o más (unos 78 usos). | UI Designer + Frontend Developer |
| 3.3 | Admin: pestañas con `role="tablist"`/`tab` y `aria-selected`; botón cerrar sesión con `aria-label` y tamaño táctil; iconos de AdminBanners/Categories a 44 px. | Frontend Developer |
| 3.4 | Formularios mayoristas: errores asociados al campo (`aria-invalid`, `aria-describedby`), foco al primer error, `autoComplete="username"`, distinguir errores de login (captcha, límite, credenciales). | Frontend Developer |
| 3.5 | Hero: puntos de 44 px, `role="group"`/"n de N", pausa con foco. `MisPedidos`: `role="status"` en "Cargando…", anunciar "Ver más". | Frontend Developer |
| 3.6 | Prueba con lector de pantalla real (VoiceOver iOS, TalkBack, NVDA): menú móvil, Turnstile, registro de 3 pasos, drawer mayorista. | [TÚ] + Accessibility Auditor (guion) |

---

## Fase 4 — SEO y rendimiento

✅ Hechos el 3-nov: 4.1 (`robots.txt` + `sitemap.xml` generado en cada build), 4.4 (8 modales y `ProductModal` con carga diferida, vendors en archivos propios: el aviso de 500 kB desapareció). Pendiente del resto.

| # | Tarea | Agente |
|---|---|---|
| 4.1 | `public/robots.txt` (Disallow `/admin`, `/mayoristas`) y `public/sitemap.xml`. Hoy ambos devuelven HTML con 200. | SEO Specialist |
| 4.2 ✅ | `index.html`: `meta description`, canonical, Open Graph (`og:image`, `es_CO`), JSON-LD `Organization`/`WebSite`. Quitar los `<meta http-equiv>` redundantes. | SEO Specialist |
| 4.3 ✅ | Fuentes: `preconnect` a Google Fonts y a Supabase, sacar el `@import` del CSS, reducir pesos (ideal: autoalojar los woff2). | Frontend Developer |
| 4.4 | Bundle de 749 kB: `React.lazy` para 8 modales, `ProductModal`, `VIPClubForm`, `Cart`, drawer mayorista; `manualChunks` para separar vendors. | Frontend Developer + WordPress/Web Performance (Performance Benchmarker para medir antes/después) |
| 4.5 | Caché larga para `logo.png`/SVG (o WebP de ~15 kB). Caché de slides del Hero en `sessionStorage`. | Frontend Developer |
| 4.6 | Worker con `HTMLRewriter`: título, Open Graph y JSON-LD `Product` por producto y colección, y 404 reales. Después, URLs `/producto/:id-slug` (hoy `?producto=<uuid>`). Previews de WhatsApp/Instagram con imagen y título. | Backend Architect + SEO Specialist |
| 4.7 | Miniaturas de 400 px / `srcset` en tarjetas. Consolidar las 3 llamadas a `catalog_retail` del inicio y no pedir `wholesale_min` en el detal. | Frontend Developer |
| 4.8 | `/categoria/*` → `/coleccion/*` como 301 real. `noindex` en `/admin`, `/mayoristas*`, 404. | SEO Specialist |

---

## Fase 5 — Cierre

| # | Tarea | Agente |
|---|---|---|
| 5.1 | README al día: rutas, migraciones, función de correos, secretos, Turnstile, mínimo mayorista, los dos admins, cómo desplegar (con `wrangler whoami` antes de cada deploy: este equipo tiene dos cuentas de Cloudflare). | Technical Writer |
| 5.2 | Código limpio: borrar `sanitizeOrderItems`/`sanitizeTotalAmount`/`sanitizePrice` sin uso, parámetro `quiet` sin efecto, tipar los 14 `any` (empezar por `user` de `AdminPanel:37`). | Frontend Developer |
| 5.3 | Resto de bugs medios: `ProductDeepLink` con precio del canal anterior, `CategoriesContext` mostrando 404 cuando falla la carga, listas que se vacían al fallar en Admin*, mensajes de error de `pricing.ts`, carreras de `validate()` y de cerrar sesión. | Code Reviewer + Frontend Developer |
| 5.4 | **Fase "contract"** (F7.4): `NOT NULL` en columnas nuevas y retiro de `price`/`category` en texto. Migración numerada con respaldo previo, después de 1.1. | Database Optimizer + Database Reliability Engineer |
| 5.5 | Revisión final antes de la entrega formal: Reality Checker vuelve a cotejar contra el plan; Code Reviewer sobre el diff completo. | Reality Checker + Code Reviewer |

---

## Orden sugerido

1. **Fase 0** completa (1 día, casi todo tuyo).
2. **Fase 3.1 y 3.2** y **Fase 4.1 a 4.3** en paralelo (baratas y de alto impacto): 1 a 2 días.
3. **Fase 1** (con 1.1 al cumplirse la ventana de 2 a 3 días de observación).
4. **Fase 2**, luego **4.4 a 4.8**, luego **Fase 5**.

## Lo que ya estaba bien (no tocar)

- Sin fuga de precios mayoristas: como anon, `wholesale_prices` y `admins` dan 401 y todos los RPC mayoristas están denegados.
- Funciones `SECURITY DEFINER` con `search_path=''`; precio e identidad del mayorista salen del servidor; no hay escalada a admin por metadata.
- Sin `dangerouslySetInnerHTML`; enlaces de WhatsApp solo con dígitos; CSP sin `unsafe-inline` en scripts; no hay `service_role` ni claves de Resend en `src/` ni `dist/`.
- Orden por precio ascendente verificado en servidor (0 descensos en 100 filas).
- Estadísticas, panel mayorista, Turnstile, recuperación de contraseña y descuento de stock al confirmar: hechos.
