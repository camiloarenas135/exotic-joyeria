-- FASE 0 · Consultas PREVIAS (solo lectura, no modifican nada).
-- Dónde correrlas: Supabase → SQL Editor del proyecto bimkpnteulwsqxxdfopx. Se pueden correr en bloque; cada una devuelve su tabla.
-- Guardar el resultado de cada una (captura o copia) ANTES de aplicar las migraciones 060 y 061.

-- ============================================================================
-- A. Estado actual de seguridad de `orders` (tarea 0.2)
-- ============================================================================
-- A1. Políticas vigentes. Esperado hoy: orders_insert_public (INSERT, anon+authenticated) además de select/update/delete admin.
select policyname, cmd, roles, with_check is not null as tiene_with_check
from pg_policies
where schemaname = 'public' and tablename = 'orders'
order by cmd, policyname;

-- A2. Privilegios de tabla de anon y authenticated sobre `orders`.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'orders' and grantee in ('anon', 'authenticated')
group by grantee;

-- A3. ¿Hay pedidos recientes hechos por INSERT directo? Un pedido hecho por create_order SIEMPRE tiene filas en order_lines.
--     Esperado: 0 filas. Si salen pedidos de los últimos días, alguien (o algún cliente viejo en caché) sigue insertando directo:
--     NO aplicar 060 todavía; revisar origen.
select o.id, o.created_at, o.channel, o.status, o.customer_name
from public.orders o
where o.created_at >= now() - interval '7 days'
  and not exists (select 1 from public.order_lines l where l.order_id = o.id)
order by o.created_at desc;

-- A4. Ventana de observación: pedidos por día, cuántos entraron por RPC (con líneas). Criterio del plan: 2-3 días con todos por RPC.
select (o.created_at at time zone 'America/Bogota')::date as dia,
       count(*) as pedidos,
       count(*) filter (where exists (select 1 from public.order_lines l where l.order_id = o.id)) as por_rpc
from public.orders o
where o.created_at >= now() - interval '14 days'
group by 1
order by 1 desc;

-- ============================================================================
-- B. Estado actual de `wholesalers` (tarea 0.3)
-- ============================================================================
-- B1. Privilegios de tabla/columna de anon y authenticated. Esperado hoy: SELECT de tabla completa a authenticated.
select grantee, privilege_type, 'tabla' as nivel, null::text as columna
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'wholesalers' and grantee in ('anon', 'authenticated')
union all
select grantee, privilege_type, 'columna', column_name
from information_schema.role_column_grants
where table_schema = 'public' and table_name = 'wholesalers' and grantee in ('anon', 'authenticated')
order by 3, 1, 2, 4;

-- B2. ¿Cuántas cuentas tienen una nota interna (lo que hoy podría leer su dueño)?
select status, count(*) as cuentas, count(notes) as con_nota
from public.wholesalers
group by status
order by status;

-- ============================================================================
-- C. Datos que bloquean la migración a variantes con id (tarea 0.5; se usan en la Fase 1)
-- ============================================================================
-- C1. Productos con variantes (para dimensionar el reparto de stock que hará el cliente).
select count(*) as productos_con_variantes,
       coalesce(sum(jsonb_array_length(variants)), 0) as variantes_totales,
       coalesce(sum(stock), 0) as stock_actual_en_esos_productos
from public.products
where jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) > 0;

-- C2. Nombres de variante duplicados dentro de un mismo producto (impiden el índice único). Esperado: 0 filas.
select p.id, p.name, lower(btrim(v ->> 'name')) as nombre_normalizado, count(*) as veces
from public.products p
cross join lateral jsonb_array_elements(p.variants) v
where jsonb_typeof(p.variants) = 'array'
group by p.id, p.name, lower(btrim(v ->> 'name'))
having count(*) > 1;

-- C3. Variantes con espacios al inicio/fin o nombre vacío (no casan por nombre exacto). Esperado: 0 filas.
select p.id, p.name, v ->> 'name' as nombre_variante
from public.products p
cross join lateral jsonb_array_elements(p.variants) v
where jsonb_typeof(p.variants) = 'array'
  and (coalesce(btrim(v ->> 'name'), '') = '' or (v ->> 'name') <> btrim(v ->> 'name'));

-- C4. Variantes sin precio numérico (price_cop nulo o <= 0). Hoy caen en silencio al precio base. Para corregir a mano.
select p.id, p.name, v ->> 'name' as variante, v ->> 'price' as precio_texto, v ->> 'price_cop' as price_cop
from public.products p
cross join lateral jsonb_array_elements(p.variants) v
where jsonb_typeof(p.variants) = 'array'
  and (v ->> 'price_cop' is null or (v ->> 'price_cop') !~ '^[0-9]+$' or (v ->> 'price_cop')::numeric <= 0);

-- C5. Precios mayoristas que NO casan con ninguna variante existente (quedarían huérfanos en el backfill). Esperado: 0 filas.
select w.id, w.product_id, w.variant_name
from public.wholesale_prices w
where w.variant_name is not null
  and not exists (
    select 1 from public.products p, jsonb_array_elements(coalesce(p.variants, '[]'::jsonb)) v
    where p.id = w.product_id and (v ->> 'name') = w.variant_name
  );

-- C6. Pedidos PENDIENTES con líneas sin variante en productos que sí tienen variantes (fallarían al confirmar con stock por variante). Esperado: 0 filas.
select o.id, o.created_at, l.name_snapshot, l.qty
from public.orders o
join public.order_lines l on l.order_id = o.id
join public.products p on p.id = l.product_id
where o.status = 'pending'
  and l.variant_name is null
  and jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0;

-- C7. Pedidos pendientes SIN order_lines (confirm_order caería al JSON `items`, que no lleva variante).
select o.id, o.created_at, o.channel
from public.orders o
where o.status = 'pending'
  and not exists (select 1 from public.order_lines l where l.order_id = o.id);
