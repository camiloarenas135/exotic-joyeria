-- 059: las funciones admin del kit no deben ser ejecutables por anon (Supabase otorga EXECUTE por defecto a anon).
-- Siguen protegidas por is_admin(), esto solo cierra la superficie.
set local lock_timeout = '3s';
revoke execute on function public.admin_kit_list() from anon;
revoke execute on function public.admin_kit_upsert(uuid, integer, boolean, integer) from anon;
revoke execute on function public.admin_kit_remove(uuid) from anon;
revoke execute on function public.admin_kit_set_cap(integer) from anon;
