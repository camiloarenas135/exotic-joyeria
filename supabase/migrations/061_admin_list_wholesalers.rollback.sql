-- Rollback 061: quita la RPC. ADVERTENCIA: si 062 ya está aplicada, aplicar primero 062_wholesalers_column_privileges.rollback.sql
-- y volver a desplegar el frontend anterior; si no, el panel admin queda sin lista.
set local lock_timeout = '3s';

drop function if exists public.admin_list_wholesalers(text);
