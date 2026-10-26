# Plan de implementación — Exotic Joyería

Documento de trabajo para la sesión que ejecuta los cambios. Léelo completo antes de tocar nada.

## 0. Contexto del proyecto

- **Stack:** Vite 6 + React 19 + TypeScript + Tailwind v4 + react-router-dom 7. SPA que habla directo con Supabase (proyecto `bimkpnteulwsqxxdfopx`). Sin backend propio.
- **Hosting:** Cloudflare Workers (assets estáticos). Repo `camiloarenas135/exotic-joyeria`, rama `main`. Cada `git push` a `main` despliega solo. Dominio `exoticjoyeria.lat` y `www`. Variables de build en Cloudflare: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Archivos de despliegue:** `wrangler.jsonc` (SPA fallback) y `public/_headers` (CSP, HSTS, caché). Si se agregan dominios externos (Turnstile, Resend, etc.), hay que ampliar la CSP en `public/_headers` y en el `<meta>` de `index.html`.
- **Admin:** entra con Google en `/admin`. Admins: `camiloarenas135@gmail.com` y `kevinlgomez058@gmail.com`. Hoy `is_admin()` los tiene escritos a mano en SQL y `ADMIN_EMAILS` en `AdminPanel.tsx:8`.
- **Hallazgos del código actual:**
  - `price` es texto (`"1.200.000"`), también en variantes (`{name, price}` dentro del JSON del producto).
  - `Cart.tsx` calcula el total en el navegador, abre WhatsApp primero y luego hace un insert "fire-and-forget" en `orders` (política `orders_insert_public`, solo valida `total_amount >= 0`). Hoy cualquiera puede mandar el total que quiera.
  - Categorías: array fijo de 15 en `src/lib/categories.ts`, sin URLs por categoría ni por producto; el filtro vive en `AppContext` (`activeFilter`).
  - `Header.tsx`: bloque negro de 150px con el logo y un solo botón hamburguesa. Íconos de buscar y carrito sin `aria-label`.
  - `Hero.tsx` es un slide fijo que ni siquiera se monta en `App.tsx`.
  - `Catalog.tsx` (706 líneas) ya pagina y ordena en cliente; `AdminCatalog.tsx` (1072 líneas), `AdminStats.tsx` (386), `AdminOrders.tsx` descuenta stock por `order.items`.
  - `supabase_setup.sql` contiene muchos `DROP POLICY`.

## 1. Decisiones cerradas (no se reabren)

1. **Mayorista simple, sin niveles ni "oficial".** Un mayorista es un usuario registrado y aprobado por el admin.
2. **Login del mayorista: correo + contraseña con Supabase Auth** (NO Google), con "olvidé mi contraseña". El admin sigue con Google.
3. El **admin elige qué productos hay en el panel mayorista y escribe el precio mayorista** de cada uno. Van en una **tabla aparte** (`wholesale_prices`), no en columnas de `products` (RLS es por fila, no por columna).
4. **Pedido mínimo mayorista: $3.500.000 COP por un solo pedido**, validado en el servidor. La cifra vive en una tabla `settings`.
5. **Kit Emprendedor:** producto normal de **$500.000**, fijo, en el detal. Bloque propio en la home.
6. **Slides del Hero y promociones manuales**, administradas por el cliente. Promociones: porcentaje o valor fijo, por producto, con fechas de inicio y fin, **sin códigos**, **solo al detal**.
7. **Categorías creadas por el admin, UN solo nivel** (sin subcategorías). Alimentan menú, footer y filtros.
8. **Cada lista de productos va de menor a mayor precio por defecto**, ordenada en el servidor. Con promoción se ordena por el precio efectivo (con descuento).
9. **Un carrito es de un solo canal** (detal o mayorista). `create_order` rechaza mezclas.
10. **El admin descuenta el stock al confirmar el pedido** (no automático al crear).
11. **Correos con Resend. Turnstile** (Cloudflare) en el registro de mayoristas y en los pedidos.
12. **Dos admins siempre.**
13. Rediseño: barra de menú moderna. Estadísticas avanzadas quedan fuera; solo lo básico.

## 2. Reglas de trabajo para la sesión

- **Respaldo primero.** Antes de cualquier migración, el usuario debe tener un respaldo (Supabase → Database → Backups, o CSV de `products` y `orders`). Pídeselo y espera confirmación.
- **Solo existe producción.** Migraciones **solo aditivas** (tablas/columnas nuevas, nada de `DROP` ni `NOT NULL` inmediato). Cada una en un archivo numerado dentro de `supabase/migrations/` con su script de rollback. **Nunca re-ejecutar `supabase_setup.sql` completo.**
- **Muestra el SQL al usuario y espera su OK antes de ejecutarlo** en la base real. Después de cada migración, verifica con consultas.
- No leer ni subir `.env`. No poner claves en el código. `.env`, `scratch/` y `dist/` ya están en `.gitignore`.
- Cada fase termina con `npm run build` y `npm run lint` (`tsc --noEmit`) sin errores. Haz commits pequeños por fase. **No hagas `git push` sin pedir confirmación**, porque despliega a producción.
- Las pruebas de RLS se hacen con el cliente real de Supabase (rol `anon` / `authenticated`), no solo desde el SQL Editor (que usa el rol `postgres` y se salta RLS).
- Cloudflare no cachea las llamadas a Supabase (van directas del navegador). Mantenerlo así: no poner un Worker que haga proxy a Supabase. Los precios mayoristas **nunca** van en el bundle, en HTML ni en JSON estático.
- Después de cada migración con tablas o funciones nuevas, correr `get_advisors` (seguridad y rendimiento) del MCP de Supabase.

## 3. Fases

### F0 — Base segura (2–3 días)
Es prerrequisito de todo.

1. **Respaldo** confirmado por el usuario.
2. Migración `001_admins.sql`: tabla `admins(user_id uuid pk refs auth.users)`; sembrar los dos admins por `auth.users.email`; reescribir `public.is_admin()` para leer `admins` (mismo nombre y firma, así las políticas actuales no cambian). Dejar siempre al menos dos filas. Nada de roles en `user_metadata`.
3. Migración `002_price_cop.sql`: `products.price_cop integer` nullable + backfill `regexp_replace(price,'\D','','g')::int` con reporte de filas que no convierten (vacías o texto). Lo mismo para variantes (`price_cop` dentro del JSON, o tabla `product_variants` — decidir mirando los datos reales). Reconciliar contando filas. Conservar `price` (texto) hasta F7.
4. Migración `003_settings_orders.sql`: tabla `settings(key text pk, value jsonb)` con `wholesale_min_cop = 3500000`; en `orders` agregar `channel text default 'retail' check in ('retail','wholesale')`, `user_id uuid null`, `subtotal_cop int`, `total_cop int`; tabla `order_lines(id, order_id, product_id, variant_id, name_snapshot, variant_snapshot, unit_price_cop, qty check >0, line_total_cop)`. Los pedidos viejos conservan su `items` jsonb.
5. Migración `004_create_order.sql`: `create_order(p_channel text, p_customer jsonb, p_lines jsonb) returns jsonb`, `security definer`, `set search_path = ''`.
   - `p_lines` = `[{product_id, variant_id, qty}]`, **nunca trae precios**.
   - Valida: nombre y teléfono (mismas reglas de hoy), 1–100 líneas, qty entera 1–999, producto y variante existen y están activos, hay stock.
   - Precio unitario desde la BD: detal = `price_cop` menos promoción vigente; mayorista = `wholesale_prices` (línea debe estar visible).
   - `p_channel='wholesale'` exige `is_approved_wholesaler()`; total < mínimo (`settings`) → error `MIN_WHOLESALE`. Líneas que no pertenecen al canal → error claro.
   - Límite anti-spam simple (mismo teléfono, N pedidos por hora).
   - Inserta `orders` + `order_lines` con snapshot; devuelve `{order_id, total, lines}`.
   - En F0 solo el canal detal está activo (sin promociones todavía); la firma ya deja listo el resto.
6. **Front:** helper único `src/lib/pricing.ts` (formato COP con `Intl.NumberFormat('es-CO')`, sin parseo de strings dispersos: hoy se repite en `Cart.tsx:18`, `Catalog.tsx:261`, `AdminStats.tsx:92`). `Cart.tsx` pasa a llamar `create_order` **primero**, y **luego** abre WhatsApp con el total que devolvió el servidor (en iOS abrir la ventana al tocar y redirigirla al terminar).
7. **No cerrar aún** `orders_insert_public`: los dos caminos conviven hasta F7.

### F1 — Categorías dinámicas (3–4 días)
1. Migración `010_categories.sql`: `categories(id uuid pk, slug text unique not null check (slug ~ '^[a-z0-9-]+$'), name text not null, sort_order int default 0, is_active bool default true, image text null)`. **Un solo nivel.** RLS: anon lee solo activas; solo `is_admin()` escribe.
2. Sembrar las 15 categorías actuales de `src/lib/categories.ts` con slugs estables; `products.category_id` nullable y backfill por nombre; verificar conteos. Conservar el campo texto viejo hasta F7. Productos con categoría no mapeada: reportarlos al usuario.
3. El slug se genera una vez y **no cambia al renombrar** (el admin puede editarlo a mano con validación).
4. No se puede borrar una categoría con productos: ofrecer "Desactivar" o "Mover productos". Categoría sin productos activos no aparece en el menú público.
5. Orden: `order by sort_order, name`; el admin reordena (flechas o arrastrar) y se guarda por RPC en lote.
6. Consulta de productos por categoría: `where is_active and category_id = :id order by <precio efectivo> asc, id asc limit 24 offset :n`. Vista o RPC `catalog_retail` que calcule el precio efectivo (con promoción) para que el orden sea coherente en todas las páginas. Índice `products(category_id, price_cop, id) where is_active`.
7. Front: hook `useCategories()` que reemplaza `categories.ts` (carga una vez, guarda en contexto/sessionStorage, revalida cada pocos minutos; el admin invalida al guardar). Tipo `Category`. Nueva pestaña `AdminCategories`.
8. Rutas: `/categoria/:slug` (slug desconocido → 404 amistoso, no página en blanco). Orden y filtros en la URL (`?orden=precio_asc&page=2`).
9. **Decisión pendiente del cliente:** "Exclusivo", "Rodio", "Plata Ley 925", "Insumos" y "Bebés" parecen materiales/colecciones; el cliente ya dijo que si son categorías van como categorías de un nivel. Cada producto tiene **una categoría principal**.

### F2 — Rediseño con barra de menú (5–7 días)
Antes de programar, entregar al usuario un mockup/contrato de diseño corto y esperar su aprobación (el rediseño crece sin control si no se limita).

- **Visual:** conservar logo, negro + dorado `#D4AF37` y Playfair Display para títulos. Fondo marfil `#FFFDF8`, superficies `#F7F3EC`, tinta `#0C0C0C`. Dorado solo en acentos; para texto pequeño sobre claro usar `#8B6F14` (contraste AA). Esquinas casi rectas (radio máx. 2–4 px), mucho espacio alrededor de las fotos, movimiento suave de 200–300 ms. Tokens en `src/index.css`. Móvil primero (diseñar a 360 px).
- **Header (reescribir):** franja negra fina (mensaje editable; enlaces Mayoristas y Emprendedor); cabecera marfil fija de 72 px → 56 px al hacer scroll, con logo compacto, buscador visible desde 1024 px, cuenta/Mayoristas y carrito con contador y `aria-label`; segunda fila con las categorías en mayúsculas pequeñas. Si no caben, las sobrantes pasan a un botón **"Más"**; nunca hay scroll horizontal en desktop. Como hay **un solo nivel**, no hay mega-menú: es un menú simple.
- **Móvil:** barra superior (menú, logo, buscar, carrito) y drawer a pantalla completa con las categorías, buscador, Mayoristas, Emprendedor y WhatsApp. Áreas táctiles de 44 px.
- **Home, en orden:** 1) carrusel editable (F3), 2) franja de confianza (envío asegurado, garantía, oro laminado, pago seguro), 3) categorías destacadas con imagen, 4) promociones activas, 5) novedades / más vendidos, 6) bloque Emprendedor, 7) acceso mayorista, 8) historia y certificaciones, 9) VIPClubForm y footer.
- **Página de categoría:** breadcrumbs, título, conteo, selector "Ordenar por" (precio menor→mayor por defecto, mayor→menor, novedades, nombre), filtros (rango de precio, en stock, en promoción) y chips con "Limpiar"; 24 productos por página con paginación; tarjeta con imagen 4:5, segunda imagen al pasar el mouse, precio en COP, precio original tachado y etiqueta "−20 %" si hay promoción, insignia "Agotado" (visible, sin botón de compra, con "Avísame por WhatsApp").
- **Componentes:** `Header.tsx` (reescribir), nuevos `MobileDrawer.tsx`, `CategoryPage`, `ProductGrid`, `ProductCard`, `FilterPanel`, `SortSelect`, `Pagination`, `ProductModal`; dividir `Catalog.tsx` y sacar el sort a un solo lugar; `Footer.tsx` con categorías dinámicas y enlaces a Mayoristas/Emprendedor; `Search.tsx` como overlay con sugerencias; `App.tsx` con layout compartido y rutas `/categoria/:slug`, `/emprendedor`, `/mayoristas`.
- **Detalles:** imágenes con `width/height` fijos, `loading="lazy"` salvo el primer banner, WebP; `aria-label` en íconos, skip link, foco visible, `prefers-reduced-motion`; estados vacíos (categoría, búsqueda, carrito); títulos y descripciones por categoría.

### F3 — Slides y promociones (2–3 días, en paralelo con F2)
1. Migración `020_hero_slides.sql`: `hero_slides(id, image_desktop, image_mobile, title, subtitle, button_label, link, sort_order, is_active, starts_at, ends_at)`; carpeta `hero/` en Storage; enlaces validados (solo rutas internas o `https`). Lectura pública de las activas y vigentes; escritura solo admin.
2. Migración `021_promotions.sql`: `promotions(id, product_id, kind check in ('percent','fixed'), value int, starts_at, ends_at, is_active)`; check `percent <= 90` y `ends_at > starts_at`. **No sobrescribe el precio guardado.** Vigencia validada en servidor con hora de Colombia (UTC-5). Si hay varias para un producto, gana la de mayor descuento. Redondeo con enteros y `floor`. Solo detal.
3. `create_order` y `catalog_retail` aplican la promoción vigente.
4. Admin: pestañas `AdminBanners` y `AdminPromos` (CRUD, activar/desactivar, vista previa). Carrusel en la home: autoplay lento, pausa al pasar el mouse, sin autoplay con `prefers-reduced-motion`, hero por defecto si no hay banners activos.

### F4 — Kit Emprendedor (0,5 día)
Producto normal de $500.000 cargado desde el admin, con categoría propia, más un bloque en la home y una ruta `/emprendedor` con qué incluye (asesoría en oro laminado y en páginas, creación de logo, curso de tejidos, tabla para tejer, insumos en oro laminado: balines, herrajes, neoprenos, hilos) y botón de compra o WhatsApp. Sin código especial.

### F5 — Mayorista (5–7 días)
1. Migración `030_wholesalers.sql`:
   - `wholesalers(user_id pk refs auth.users, business_name, phone, city, tax_id null, status text check in ('pending','approved','rejected','suspended') default 'pending', reviewed_by, reviewed_at, notes)`. El usuario solo **lee** su fila; no puede cambiar `status`.
   - Trigger en `auth.users` que crea la fila `pending` al registrarse (nombre, WhatsApp, ciudad, cédula/NIT opcional).
   - `is_approved_wholesaler()`: `security definer`, `search_path=''`, `exists(... status='approved')`. Se evalúa en cada consulta, así que suspender corta el acceso al instante.
   - `wholesale_prices(product_id, variant_id null, price_cop int not null check >0, is_visible bool default true)`; RLS `select` solo si `is_visible and is_approved_wholesaler()`; admin gestiona con `is_admin()`; `anon` sin acceso.
   - RPC `wholesale_catalog()` que une productos y precios mayoristas, solo para aprobados (usar `security_invoker` o RPC, revisar los `grants` de vistas).
   - RPC `approve_wholesaler`, `reject_wholesaler`, `suspend_wholesaler` (validan `is_admin()`).
2. **Registro y login:** pantalla propia (`/mayoristas`), separada del admin. `signUp` con correo y contraseña, `resetPasswordForEmail`. Confirmación de correo con SMTP propio (Resend) antes de lanzar; si los correos llegan mal, el admin ya es el filtro (decisión del cliente). Turnstile en el registro. Un pendiente ve "Tu solicitud está en revisión" y **ningún** precio mayorista; un rechazado ve un mensaje neutro con WhatsApp.
3. **Panel mayorista (`/mayoristas`):** catálogo con los productos que el admin eligió y sus precios, carrito **separado** (clave de `localStorage` distinta), barra "te faltan $X para el mínimo de $3.500.000" y envío bloqueado hasta cumplirlo. El pedido se crea con `create_order('wholesale', …)` y luego se abre WhatsApp con el total que devolvió el servidor.
4. **Admin:** pestaña `AdminWholesalers` (lista por estado, datos del registro, botón para abrir WhatsApp, aprobar / rechazar con motivo / suspender) y gestión de **productos mayoristas** (activar un producto en el panel y escribir su precio). `AdminOrders` muestra el canal y el mayorista, y el admin confirma el pedido y descuenta el stock.
5. **Correos (Resend, Edge Function):** al registrarse (aviso al dueño y acuse al cliente), al aprobar y al rechazar.
6. **Seguridad:** ningún rol en `user_metadata`; un mayorista nunca es admin aunque use el mismo correo; Google solo habilita login, `is_admin()` sigue siendo falso para no-admins.

### F6 — Estadísticas básicas (1–2 días)
Con lo que ya hay en `AdminStats.tsx`: ventas por periodo, productos más vendidos, pedidos por estado y detal vs mayorista. Leer de `order_lines` / `total_cop`.

### F7 — Calidad y cierre (3–4 días)
1. Matriz de pruebas con el cliente real de Supabase:
   - **anon:** lee catálogo detal; no lee `wholesale_prices`, `wholesalers` ni `orders`; `create_order` detal funciona; mayorista falla; insert directo en `orders` falla (tras el paso 3).
   - **pendiente:** no lee precios mayoristas; pedido mayorista falla; no puede cambiar su estado.
   - **aprobado:** solo ve filas visibles; pedido de 3.499.999 falla y de 3.500.000 pasa; carrito mezclado falla; un precio manipulado en el cuerpo se ignora; suspendido pierde acceso sin cerrar sesión.
   - **admin:** gestiona todo; un mayorista aprobado no puede.
   - Extra: promoción vencida o futura no aplica; slug duplicado se rechaza; orden por precio estable con precios iguales; categoría vacía no sale en el menú.
2. Accesibilidad del menú (teclado, contraste, lector de pantalla), E2E (Playwright) de los flujos de compra detal y mayorista, revisión de código y de seguridad.
3. **Cerrar el INSERT directo:** `DROP POLICY orders_insert_public` (y revocar INSERT a `anon`) **solo cuando** el front nuevo lleve desplegado 2–3 días con pedidos reales llegando por `create_order` y ya no lleguen inserts directos. Tener a mano el comando para reabrir la política.
4. Fase "contract": `NOT NULL` en columnas nuevas; retirar `price` (texto) y la categoría en texto.
5. Mantener el README al día con lo que se construya (el hosting ya está documentado como Cloudflare).

## 4. Orden de despliegue (resumen)
1. Respaldo → 2. migraciones aditivas por archivo → 3. backfill de `price_cop` y `category_id` → 4. desplegar `create_order` sin usarlo → 5. desplegar el front que lo usa (el INSERT directo sigue abierto) → 6. observar 2–3 días → 7. cerrar el INSERT directo → 8. retirar campos viejos.

## 5. Entregas al cliente
- **E1 (≈ días 10–14):** pedidos seguros, menú nuevo, categorías administrables, listas de menor a mayor precio, rediseño de home y catálogo, kit cargado.
- **E2 (≈ días 17–21):** slides y promociones editables, estadísticas básicas.
- **E3 (≈ días 24–30):** zona mayorista completa y cierre.

## 6. Agentes sugeridos por fase
- **F0–F1:** Backend Architect, Database Reliability Engineer (respaldos y migraciones), Application Security Engineer, Code Reviewer.
- **F2–F3:** UI Designer, UX Architect, Frontend Developer, Accessibility Auditor, UI Finish-Gate Reviewer.
- **F5:** Identity & Access Engineer, Backend Architect, Application Security Engineer, Test Automation Engineer.
- **F7:** Test Automation Engineer, Reality Checker, Code Reviewer, Technical Writer.
- Skills útiles: `supabase`, `supabase-postgres-best-practices` (en `.agents/skills`), `cloudflare:workers-best-practices`, `cloudflare:turnstile-spin`, `cloudflare:wrangler`.

## 7. Riesgos principales
- Migrar categorías de texto a id puede dejar productos sin categoría → usar slug, respaldo del campo viejo y verificación de conteos.
- El rediseño crece sin control → contrato de diseño aprobado por el cliente y alcance limitado a Header, Footer, Home, categoría y tarjetas (el admin queda como está).
- Fuga del precio mayorista por una vista o `SELECT` público olvidado → revisar `grants`, usar RPC y probar con `anon`.
- Cerrar el INSERT demasiado pronto corta las ventas → esperar, y tener el rollback listo.
- Spam de registros y pedidos → Turnstile y límite por teléfono.
- Si se necesita acelerar, recortar en este orden: estadísticas, rediseño del admin, avisos por correo (aprobar a mano y avisar por WhatsApp).

## 8. Pendientes que no son de código
- El usuario debe sacar el **respaldo** antes de F0.
- En Supabase → Authentication → URL Configuration: Site URL `https://exoticjoyeria.lat` y redirecciones `https://exoticjoyeria.lat/admin`, `https://www.exoticjoyeria.lat/admin` (y las de mayoristas cuando existan), para que el login siga funcionando.
- Crear cuenta de Resend y dominio de envío (F5).
- (Hecho) Firebase Hosting apagado y sus archivos retirados del proyecto.
