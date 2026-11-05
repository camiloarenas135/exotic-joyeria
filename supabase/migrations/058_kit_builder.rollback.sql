-- Rollback 058: elimina el Kit Emprendedor armable.
-- Los pedidos de kit ya creados siguen existiendo como pedidos normales: sus order_lines conservan el precio
-- y no tienen clave foránea hacia kit_pieces, así que no se pierde nada.
set local lock_timeout = '3s';

drop function if exists public.create_kit_order(jsonb, jsonb);
drop function if exists public.admin_kit_set_cap(integer);
drop function if exists public.admin_kit_remove(uuid);
drop function if exists public.admin_kit_upsert(uuid, integer, boolean, integer);
drop function if exists public.admin_kit_list();
drop function if exists public.kit_catalog();
drop function if exists private.kit_cap();
drop table if exists public.kit_pieces;
delete from public.settings where key = 'kit_max_cop';
