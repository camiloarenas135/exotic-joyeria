-- Rollback de 067. Antes de aplicarlo, apagar el modo: select public.admin_disable_variant_stock();  (o update de settings.variant_stock_mode = '"off"').
set local lock_timeout = '3s';

drop function if exists public.admin_disable_variant_stock();
drop function if exists public.admin_enable_variant_stock(boolean);
drop function if exists private.legacy_variant_orders();
drop function if exists public.admin_variant_stock_list(text, boolean);
drop function if exists public.admin_set_stock(uuid, integer, integer);
