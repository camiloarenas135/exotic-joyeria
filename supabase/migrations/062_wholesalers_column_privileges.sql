-- 062: el dueño de la cuenta ya no puede leer las columnas internas de `wholesalers` (hallazgo 2.1 de PLAN-REVISION-2026-11.md).
-- Hoy la política wholesalers_select_own deja leer la fila COMPLETA, incluidas `notes` (nota interna del admin, p. ej. el motivo
-- de un rechazo), `reviewed_by` y `last_status_notified`. Se quita el SELECT de tabla y se concede solo por columna.
--
-- PRERREQUISITOS (no aplicar sin ellos, o la tienda publicada se rompe):
--   1. 061_admin_list_wholesalers aplicada.
--   2. Frontend nuevo DESPLEGADO: ChannelContext sin `notes` y AdminWholesalers usando rpc('admin_list_wholesalers').
--      (Con el frontend viejo, select('*') del admin y la columna `notes` de ChannelContext dan "permission denied";
--       un mayorista aprobado pasaría a verse como cliente al detal.)
--   3. Respaldo hecho.
-- Después, todo select sobre `wholesalers` debe nombrar columnas (select('*') falla para authenticated).
-- No afecta: la función wholesale-mail y las RPC SECURITY DEFINER (service_role / dueño de la función).
-- Verificación: node scripts/verify-phase0.mjs   ·   Rollback: 062_wholesalers_column_privileges.rollback.sql
set local lock_timeout = '3s';

revoke select on public.wholesalers from anon, authenticated;
grant select (user_id, email, business_name, phone, city, tax_id, status, created_at)
  on public.wholesalers to authenticated;
