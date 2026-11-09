# Plan v2: Módulo Emprendedor como Mayorista + precio y stock por variante (9-nov-2026)

Análisis de solo lectura por Backend Architect, Frontend Developer, Application Security Engineer y UX Architect sobre el código real. Esta versión incorpora las 4 respuestas del cliente.

## 1. Decisiones cerradas del cliente

| # | Decisión |
|---|---|
| 1 | **Ya no es kit.** Emprendedor es un módulo con cuenta aprobada por el admin, igual que el mayorista. Se retira "Armar kit". |
| 2 | **Pedido mínimo de Emprendedor: $500.000** por pedido (mayorista: $3.500.000). Ajuste editable en `settings`. |
| 3 | **Lista de precios propia** para Emprendedor. Cualquier producto puede estar en ella; el cliente cargará los precios después. |
| 4 | **El usuario elige el tipo de cuenta**, viendo claramente qué beneficios y condiciones tiene cada uno (Emprendedor vs Mayorista). |
| 5 | **Cada variante tiene su propio precio** (detal, mayorista y emprendedor) **y su propio stock**. |
| — | Sin niveles ni progresión: son dos segmentos de cliente. Un correo, un tipo de cuenta (recomendado). |

## 2. Diseño técnico (resumen)

**Cuenta y precios**
- `wholesalers.account_type` (`'wholesale'`/`'entrepreneur'`): lo que **decide** precios y mínimo. Solo lo cambia el admin.
- `wholesalers.requested_account_type`: lo que la persona **pidió** al registrarse. El servidor lo valida contra lista permitida; nunca se usa para autorizar.
- `wholesale_prices.price_list` (mismos dos valores). El servidor deduce la lista desde la cuenta; el navegador no la elige.
- `orders.price_list` para reportes. `orders.channel` sigue siendo `retail`/`wholesale` (no se toca su CHECK).
- Mínimo por lista: `wholesale_min_cop` y `entrepreneur_min_cop`, entregados por RPC solo a autenticados del tipo correcto.
- Frontend: **no** se amplía `Channel`. Se añade `tier` en `useChannel()` y el helper `tierCopy(tier)` para los textos.

**Variantes con id estable y stock propio (cambio mayor)**
- Nueva tabla `product_variants(id, product_id, name, price_cop, stock ≥ 0, position, active)`.
- `products.variants` (jsonb) queda como **caché de lectura** con `id` y `stock` por variante; la regenera un trigger. Así el frontend actual sigue leyendo el mismo formato.
- Descartado guardar el stock dentro del jsonb: cada edición del admin en `AdminCatalog` reemplaza el arreglo completo y pisaría el stock (o deshacería descuentos de `confirm_order`).
- `wholesale_prices` pasa de `variant_name` a `variant_id` (con espejo del nombre). Esto resuelve de raíz el problema de "renombrar una variante deja huérfano su precio".
- `products.stock`: en productos **con** variantes es la **suma derivada** (trigger); en productos **sin** variantes sigue igual.
- El stock se comparte entre detal, mayorista y emprendedor (quien confirma primero se lo lleva).
- Escritura de stock solo por RPC `admin_set_stock` con control optimista (`expected`), nunca por el `update` directo del formulario.
- Orden de bloqueo canónico para evitar deadlocks: pedido → producto → variantes, siempre por id ascendente.

**Interruptor de despliegue:** `settings.variant_stock_mode` (apagado al inicio). Con él apagado el frontend viejo no nota nada; se enciende solo cuando el cliente terminó de repartir el stock. Rollback instantáneo: apagarlo.

## 3. Elección de tipo de cuenta (UX)

- Página pública e indexable **`/cuentas`**: "¿Cuál cuenta es para ti?" con dos tarjetas lado a lado (apiladas en móvil), tabla comparativa y 5 preguntas frecuentes. Cada CTA lleva al registro del tipo: `/mayoristas/acceso?tab=registro` o `/emprendedor/acceso?tab=registro`.
- Header y menú móvil: un solo ítem **"Para negocios"** → `/cuentas` (hoy hay dos etiquetas que el visitante no distingue). Footer: "Mayoristas", "Cuenta Emprendedor", "Comparar cuentas". Home: una sola sección con las dos mini-tarjetas.
- Las landings `/mayoristas` y `/emprendedor` se conservan como detalle, con aviso "¿Dudas? Compara" y bloque "¿No es tu caso?". **Se elimina** el bloque actual que presenta Mayorista como "siguiente nivel" del emprendedor.
- Registro: si no hay tipo en la ruta, **paso 0** con selector (radios en forma de tarjeta, accesibles). En los pasos 1-3, chip "Cuenta Emprendedora · pedido mínimo $500.000 · Cambiar". Antes de enviar, resumen con el mínimo y el botón dice "Solicitar cuenta emprendedora/mayorista".
- Admin ve "Solicitó: X" al aprobar; si no encaja, corrige con `admin_set_account_type` y avisa por WhatsApp.
- Pendiente y correo de aprobación con texto según el tipo real (el tipo se lee de la base de datos, no del payload).

**Copy base (a completar con el cliente; `[DESCUENTO]` = dato que debe dar el cliente)**
- **Emprendedor** — "Para empezar o hacer crecer tu negocio". Pedido mínimo $500.000. Precios de emprendedor, [DESCUENTO]. Para ti si estás iniciando en oro laminado o ya vendes y quieres surtirte con un pedido más pequeño. Incluye precios propios por variante, el mismo catálogo, pedido por WhatsApp con seguimiento en "Mis pedidos" y envío asegurado.
- **Mayorista** — "Para negocios que compran en volumen". Pedido mínimo $3.500.000. Precio mayorista, [DESCUENTO]. Para ti si tienes tienda o ventas constantes y necesitas reponer inventario en cantidad.
- Aclaración visible: "Son tipos de cuenta distintos: no hay niveles ni se sube por comprar más." El mínimo es **por pedido**, no acumulado.
- Botón del Emprendedor `primaryBtn` y del Mayorista `secondaryBtn`, para no sugerir que uno es mejor.

## 4. Migraciones (ninguna aplicada; todas aditivas, con `.rollback.sql` y `lock_timeout 3s`)

| Nº | Contenido |
|---|---|
| **063_product_variants** | Tabla, backfill con id estable, foto del stock actual (`stock_legacy_snapshot`), reparto inicial (`floor(stock/n)`, resto a las primeras por posición), trigger reconciliador (casa por id y, si no hay, por nombre: un admin con pestaña vieja sigue funcionando), `order_lines.variant_id`. Valida nombres duplicados/con espacios y protege el cast del precio detal. |
| **064_wholesale_prices_variant_id** | `variant_id` con FK, backfill por (producto, nombre), trigger de renombre, índice nuevo. |
| **065_account_type** | `account_type`, `requested_account_type`, `private.my_account_type()`, ajuste de `handle_new_wholesaler` / `request_wholesale_access`, `admin_set_account_type`. |
| **066_price_lists** | `price_list`, clave `(price_list, product_id, variant_id)`, **política SELECT filtrada por lista** (riesgo crítico), RPC admin con `p_price_list` (borrar firma vieja en la misma migración), mínimos por lista. |
| **067_admin_variant_stock** | `admin_set_stock`, `admin_variant_stock_list`, interruptor `variant_stock_mode`, `admin_enable_variant_stock()` (compara suma vs foto y avisa diferencias). |
| **068_catalog_by_account** | `catalog_core` y portadas por cuenta; cada variante expone `id` y `stock`; `in_stock` = alguna variante con stock en ese canal; stock de producto en mayorista/emprendedor = suma de variantes con precio visible en esa lista. |
| **069_confirm_cancel_variant** | `order_stock_lines_v2`; `confirm_order` y `cancel_order` por variante (rama según el modo). Pedidos viejos sin variante en productos con variantes: `LEGACY_VARIANT_LINE` (cancelar y rehacer; antes de activar el modo se cuentan, lo esperable es 0). |
| **070_create_order_lists** | Única reescritura de `create_order`: resuelve variante antes del stock, acumula por producto+variante, `VARIANT_REQUIRED` también en detal, canal derivado de la cuenta (`NOT_IN_CHANNEL` si no coincide), identidad y límite por `auth.uid()` para ambos tipos, mínimo por lista, `orders.price_list`, tope global por hora e idempotencia. Firma intacta; formato `OUT_OF_STOCK:Producto (Variante)` que el frontend viejo ya entiende. |
| **071_seed** (opcional) | Sembrar `price_list='entrepreneur'` desde `kit_pieces` (productos sin variantes). Reversible por lista. |
| **072_retire_kit** | Revocar `create_kit_order` y `kit_catalog`. Al final. |

## 5. Fases de trabajo

### Fase 0 — Prerrequisitos (antes de tocar el esquema)
| # | Tarea | Agente |
|---|---|---|
| 0.1 | Respaldo de la base | [TÚ] |
| 0.2 | Cerrar el INSERT directo a `orders` (1.1 del plan anterior). Con un canal nuevo, un POST directo fabricaría pedidos y `confirm_order` descontaría stock de uno falso. | Backend Architect + Database Reliability Engineer |
| 0.3 | Ocultar `notes`, `reviewed_by`, `last_status_notified` al dueño de la cuenta (2.1); tocar `ChannelContext.tsx:31`, `AdminWholesalers.tsx:46`, `AdminOrders.tsx:147`. | Application Security Engineer |
| 0.4 | Decidir política de enumeración de cuentas (2.3) y "un correo, un tipo". | [TÚ] + Identity & Access Engineer |
| 0.5 | Consulta previa: duplicados o espacios en nombres de variantes, pedidos pendientes con variante vacía en productos con variantes, y confirmar en logs/e2e que el carrito detal siempre manda variante. | Database Optimizer |

**Estado de la Fase 0 (9-nov-2026)** — preparada en archivos locales; **nada aplicado a la base de producción**.

| # | Estado | Entregables |
|---|---|---|
| 0.1 | ⏳ [TÚ] | Respaldo (Supabase → Database → Backups, o `pg_dump`). Guardar la fecha/hora. |
| 0.2 | ✅ listo, sin aplicar | `migrations/060_close_orders_insert.sql` + rollback. Verificado en código: `AdminOrders` solo hace select/count/delete, no hay INSERT/UPDATE directos; `create_order` y `create_kit_order` son `SECURITY DEFINER` y no dependen de la política. |
| 0.3 | ✅ listo, sin aplicar | `migrations/061_admin_list_wholesalers.sql` (aditiva) y `062_wholesalers_column_privileges.sql` (restrictiva) + rollbacks. Código: `ChannelContext` sin `notes`, `AdminWholesalers` por RPC, `Wholesaler.notes` opcional. e2e nuevo en `admin-wholesale.spec.ts`. |
| 0.4 | ⏳ [TÚ] | Política de enumeración de cuentas y "un correo, un tipo" (ver sección 7). |
| 0.5 | ✅ código / ⏳ datos | Código confirmado: la única llamada a `addToCart` (`ProductModal.tsx:158`) siempre manda la variante. Las consultas de datos están en `checks/phase0_precheck.sql` (bloque C), pendientes de correr. |

Verificación: `npx tsc --noEmit` = 0 errores; e2e `admin-wholesale`, `admin-responsive`, `entrega-b`, `mayoristas-flow` = 107 pasan, 0 fallan. Línea base en producción (`node scripts/verify-phase0.mjs`): 5/7; fallan justo las dos cosas que se van a corregir (INSERT directo abierto y RPC `admin_list_wholesalers` inexistente).

**Orden de aplicación (importa):**
1. **[TÚ]** Respaldo (0.1).
2. **[TÚ]** Correr `supabase/checks/phase0_precheck.sql` (A y B) y guardar resultados. Si A3 devuelve filas, no aplicar 060 todavía.
3. Aplicar **061** (aditiva, segura en cualquier momento).
4. Desplegar el frontend nuevo (`wrangler whoami` antes: hay dos cuentas de Cloudflare). Probar a mano: Admin → Mayoristas lista las solicitudes; un mayorista aprobado entra a su tienda.
5. Aplicar **062** (restrictiva). Si se aplicara antes del paso 4, el panel admin y la sesión mayorista de la tienda publicada se romperían.
6. Aplicar **060** solo tras 2-3 días con todos los pedidos entrando por RPC (consulta A4) y, de preferencia, tras hacer un pedido de prueba.
7. Correr `node scripts/verify-phase0.mjs` (debe dar 7/7) y `supabase/checks/phase0_postcheck.sql` con un UUID de mayorista y uno de admin.

### Fase 1 — Variantes y stock (servidor, modo apagado)
Migraciones 063, 064, 067, 069 y la parte de stock de 070. Todo con `variant_stock_mode` apagado: el sitio actual funciona igual.

### Fase 2 — Cuenta y listas de precios (servidor)
Migraciones 065, 066, 068, 070 completa. Incluye la suite de **pruebas RLS por rol** (aceptación): anon, pendiente, mayorista, emprendedor, suspendido, admin → lectura directa de `wholesale_prices`, `catalog_*`, `create_order` propio y ajeno, mínimo, `my_wholesale_orders`, `notes`, intento de cambiar su propio `account_type`/`status`; un emprendedor no obtiene precio mayorista (ni con variante) y viceversa.

### Fase 3 — Admin
| # | Tarea | Tamaño |
|---|---|---|
| 3.1 | `AdminCatalog`: filas nombre / precio / stock por variante, total derivado, "Asignar N a esta variante" al crear la primera, chips `40cm: 3` (ámbar ≤ `LOW_STOCK`, rojo en 0) con edición rápida por RPC, insignia "Revisar reparto", exigir precio en cada variante, CSV con variante y stock | L |
| 3.2 | Pantalla de **reparto de stock** (productos con variantes pendientes) + botón que llama `admin_enable_variant_stock()` | M |
| 3.3 | `AdminWholesalers`: columna "Solicitó / Tipo", filtro y cambio de tipo | M |
| 3.4 | `AdminWholesalePrices`: selector de lista, stock bajo cada variante, aviso de variantes sin precio o sin stock | M |
| 3.5 | `AdminOrders`, `AdminStats`: stock y "agotado" por variante (`totalStock()` / `isSoldOut()` unificados), valor de inventario Σ precio×stock, modal de variantes agotadas | M |
| 3.6 | `wholesale-mail`: asunto, cuerpo y enlace según el tipo real; marcador `approved:<tipo>`; marcar antes de enviar; `health` tras chequeo de admin; solo con correo confirmado | S |
| 3.7 | Quitar pestaña Kit de `AdminPanel` (conservar histórico de pedidos de kit) | S |

### Fase 4 — Tienda (comprador)
| # | Archivos | Tamaño |
|---|---|---|
| 4.1 | `types.ts`, `catalog.ts`, `AppContext.tsx` (`stockFor`, `isSoldOut`; el carrito detal ya no sobrepasa el total sumando variantes) | S |
| 4.2 | `ProductModal` (variante agotada deshabilitada, tachada y con texto "Agotado"; arranca en la primera con stock; "Quedan N" si ≤ 5), `ProductCard` ("Desde" ignora agotadas) | M |
| 4.3 | `WholesaleProductPanel`, `WholesaleCartContext`, `WholesaleCartDrawer`: tope por fila (no suma por producto), "Disponible: N", fila agotada | M |
| 4.4 | `ChannelContext` (exponer `tier`; limpieza de cachés y aviso de cuenta inactiva en ambos tipos), `lib/tier.ts`, `lib/wholesale.ts` (mínimo y caché por tipo), claves de carrito/portadas/`knownProducts` por tipo | M |
| 4.5 | Página `/cuentas`, paso 0 y chip en `WholesaleAuth`, `RequestAccessForm` con selector, `MayoristasAcceso`, `Mayoristas`, `StatusPanel` y mensajes WhatsApp por tipo | L |
| 4.6 | `Emprendedor.tsx` reescrita como landing; `Header`, `MobileDrawer`, `Footer`, `Home` (ítem "Para negocios"); `App.tsx` (quitar `RetailOnly`, rutas `/cuentas` y `/emprendedor/acceso`, clave `main-${channel}` con el tipo); `worker/index.js` (`NOINDEX` para el área privada nueva; `/emprendedor` y `/cuentas` **sí** indexables) | L |
| 4.7 | Borrar `KitBuilder.tsx`, `AdminKit.tsx`, `lib/kit.ts`; luego migración 072 | S |

### Fase 5 — Pruebas
- **Actualizar:** `helpers/wholesale.ts` (stock por variante, `account_type`, precios por lista), `mayoristas-flow.spec.ts:263-297, 391-396` (de tope compartido a tope por fila), `admin-wholesale.spec.ts`, `store.spec.ts:100-105`, `navigation.spec.ts`, `entrega-b.spec.ts`, `admin-responsive.spec.ts`, `responsive-store.spec.ts:10`, `entrega-d.spec.ts` (bloque Kit). **Borrar** `admin-kit.spec.ts`.
- **Nuevos:** `detal-variant-stock.spec.ts`, `admin-catalog-stock.spec.ts`, `emprendedor-flow.spec.ts` (registro → aprobación → precios propios → mínimo $500.000 → variantes con precio y stock distintos), `/cuentas` y selector de registro, aislamiento de precios entre tipos, aislamiento de carrito entre usuarios, confirmar descuenta de la variante correcta y cancelar la devuelve.

### Fase 6 — Despliegue (en este orden)
1. Respaldo → 2. migraciones con `variant_stock_mode` **apagado** → 3. función de correo → 4. frontend nuevo (`wrangler whoami` antes: hay dos cuentas de Cloudflare) → 5. el cliente reparte el stock y carga los precios de emprendedor → 6. `admin_enable_variant_stock()` → 7. observar 2-3 días y aplicar 072 (retiro del kit).
Rollback: apagar el interruptor (los totales se conservan porque `products.stock` es la suma).

## 6. Riesgos principales
1. **Pisar stock al guardar un producto** (el más grave): mitigado con tabla `product_variants`, RPC con `expected` y trigger reconciliador.
2. **RLS de `wholesale_prices`:** sin filtro por lista, un tipo lee los precios del otro.
3. **Canal elegido por el navegador:** `create_order` debe derivarlo de la cuenta.
4. **Reparto inicial del stock:** el reparto automático (`floor`) puede dejar una variante en 0 que sí tenía. Por eso el cliente debe revisarlo antes de encender el modo.
5. **Sobreventa entre canales:** el stock se descuenta al confirmar y se comparte entre los tres canales.
6. **Pedidos pendientes viejos** sin variante en productos con variantes: contarlos antes; si hay, cancelar y rehacer a mano.
7. **Cachés por tipo:** `knownProducts`, portadas, mínimo y carrito deben llevar el tipo en la clave.
8. **Confusión de usuario:** tomar Emprendedor como "escalón previo" de Mayorista, o elegir mal el tipo. Mitigación: `/cuentas`, chip y resumen en el registro, y medir la tasa de reclasificación (`requested_account_type` ≠ `account_type`).
9. **Selectores de e2e:** los nombres accesibles ("Cuenta mayorista", "Mi pedido mayorista") cambian.

## 7. Qué necesita del cliente (por orden de urgencia)

**Antes de empezar**
1. **Los porcentajes o condiciones de descuento** que van en las tarjetas (`[DESCUENTO]`) para Emprendedor y Mayorista. Se pueden dejar para el final, pero la página `/cuentas` no se publica sin ellos.
2. **¿Cuántos productos tienen variantes?** Y confirmar que puede **repartir el stock** de cada uno entre sus variantes antes del corte (sin eso el stock por variante no se enciende).

**Decisiones de producto** (hay valor recomendado)
3. ¿El stock se **comparte** entre detal, mayorista y emprendedor, o quiere reservar una parte por canal? *Recomendado: compartido* (reservar por canal es otro cambio mayor).
4. ¿Se muestra la **cantidad exacta** o solo "Disponible / Quedan N / Agotado"? ¿Umbral de "últimas"? *Propuesta: "Quedan N" solo si N ≤ 5.*
5. ¿Una variante agotada se **oculta** o se muestra como "Agotado"? *Recomendado: mostrarla como "Agotado".*
6. ¿Un correo puede tener **las dos cuentas**? *Recomendado: no, un correo un tipo.*
7. Si hay **pedidos pendientes viejos** sin variante en productos con variantes, ¿acepta cancelarlos y rehacerlos a mano?

## 8. Tamaño estimado
10 migraciones, ~25 archivos de frontend, 1 función edge y ~15 specs. Estimación gruesa: **14-20 días** de trabajo (antes 8-12: el stock por variante añade unos 6-8 días entre migración, admin de stock, carritos y pruebas). Aproximadamente: Fase 0-2 servidor y seguridad 6-8 días; Fase 3-4 interfaz 6-8 días; Fase 5-6 pruebas y entrega 2-4 días. No incluye el tiempo del cliente para repartir stock y cargar precios.
