-- FASE 0 · Verificación POSTERIOR por rol (complementa scripts/verify-phase0.mjs, que solo puede probar como anon).
-- Dónde: Supabase → SQL Editor. Cada bloque va por separado (los errores esperados abortan la transacción del bloque).
-- Reemplazar <UUID_...> por el user_id real de una cuenta de prueba. Todos los bloques terminan en ROLLBACK: no dejan cambios.

-- ============================================================================
-- 0.3 · Un MAYORISTA (dueño de cuenta) NO puede leer notes / reviewed_by / last_status_notified
-- ============================================================================
-- Esperado: ERROR 42501 permission denied for table wholesalers (o "for column notes")
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<UUID_MAYORISTA>', 'role', 'authenticated')::text, true);
select notes from public.wholesalers where user_id = '<UUID_MAYORISTA>';
rollback;

-- Esperado: ERROR también con select *
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<UUID_MAYORISTA>', 'role', 'authenticated')::text, true);
select * from public.wholesalers where user_id = '<UUID_MAYORISTA>';
rollback;

-- Esperado: 1 fila con sus datos públicos (lo que lee ChannelContext)
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<UUID_MAYORISTA>', 'role', 'authenticated')::text, true);
select user_id, email, business_name, phone, city, tax_id, status, created_at from public.wholesalers where user_id = '<UUID_MAYORISTA>';
rollback;

-- Esperado: ERROR FORBIDDEN (un mayorista no es admin)
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<UUID_MAYORISTA>', 'role', 'authenticated')::text, true);
select * from public.admin_list_wholesalers(null);
rollback;

-- ============================================================================
-- 0.3 · Un ADMIN sí recibe la lista completa con la nota interna por la RPC
-- ============================================================================
-- Esperado: filas con la columna notes. (<UUID_ADMIN> = user_id de camiloarenas135@gmail.com o kevinlgomez058@gmail.com)
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<UUID_ADMIN>', 'role', 'authenticated')::text, true);
select user_id, business_name, status, notes from public.admin_list_wholesalers(null) limit 5;
rollback;

-- ============================================================================
-- 0.2 · Un usuario AUTENTICADO tampoco puede insertar pedidos directos
-- ============================================================================
-- Esperado: ERROR 42501 permission denied for table orders (el cuerpo es inválido a propósito: nunca inserta)
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<UUID_MAYORISTA>', 'role', 'authenticated')::text, true);
insert into public.orders (customer_name, customer_phone, items, total_amount, status) values ('x', '1', '[]'::jsonb, -1, 'confirmed');
rollback;

-- ============================================================================
-- 0.2 · Regresión: create_order SIGUE funcionando tras cerrar el INSERT (es SECURITY DEFINER)
-- ============================================================================
-- Hacer UN pedido real de prueba desde la tienda (detal) y confirmar que aparece en Admin → Pedidos con sus líneas.
-- Luego, desde el SQL Editor, comprobar y cancelar/eliminar el pedido de prueba desde el panel:
select o.id, o.created_at, o.channel, o.status, count(l.id) as lineas
from public.orders o left join public.order_lines l on l.order_id = o.id
where o.created_at >= now() - interval '1 hour'
group by o.id order by o.created_at desc;
-- Esperado: el pedido de prueba con lineas >= 1.
