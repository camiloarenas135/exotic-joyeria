-- 060: cierra el INSERT directo a `orders` (hallazgo 1.1 de PLAN-REVISION-2026-11.md).
-- Hoy cualquier visitante puede hacer POST a /rest/v1/orders con total, ítems y user_id arbitrarios, saltándose create_order
-- (precios, stock, mínimo mayorista, límite de pedidos). confirm_order caería al JSON `items` y descontaría stock de un pedido falso.
-- Los pedidos legítimos entran por create_order / create_kit_order, que son SECURITY DEFINER y no dependen de esta política.
--
-- PRERREQUISITOS (no aplicar sin ellos):
--   1. Respaldo de la base hecho.
--   2. supabase/checks/phase0_precheck.sql, consulta A3 = 0 filas y A4 con todos los pedidos de 2-3 días por RPC.
--   3. Frontend actual desplegado (Cart.tsx y WholesaleCartDrawer.tsx ya usan rpc('create_order'); AdminOrders solo hace select/delete).
-- Verificación posterior: node scripts/verify-phase0.mjs   (un POST anon a /orders debe dar 401/403).
-- Rollback: 060_close_orders_insert.rollback.sql (reabre el INSERT directo; usar solo si los pedidos dejan de llegar).
set local lock_timeout = '3s';

drop policy if exists orders_insert_public on public.orders;
revoke insert on public.orders from anon, authenticated;
