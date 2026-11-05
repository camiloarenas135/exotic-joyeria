-- Rollback 059: devuelve EXECUTE a anon (no recomendado).
grant execute on function public.admin_kit_list() to anon;
grant execute on function public.admin_kit_upsert(uuid, integer, boolean, integer) to anon;
grant execute on function public.admin_kit_remove(uuid) to anon;
grant execute on function public.admin_kit_set_cap(integer) to anon;
