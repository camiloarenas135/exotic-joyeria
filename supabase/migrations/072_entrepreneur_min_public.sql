-- Fase 4: el mínimo de pedido de emprendedor es información pública (como wholesale_min): lo muestran la landing /emprendedor,
-- el registro y la barra de mínimo. Aditiva; no cambia ningún comportamiento existente.
-- Rollback: 072_entrepreneur_min_public.rollback.sql
create or replace function public.entrepreneur_min() returns bigint
language sql stable security definer set search_path = '' as $$
  select private.list_min('entrepreneur');
$$;
revoke all on function public.entrepreneur_min() from public;
grant execute on function public.entrepreneur_min() to anon, authenticated;
