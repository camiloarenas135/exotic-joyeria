-- Fase 4: la tienda necesita saber si el stock por variante está encendido para decidir qué tope usa (producto vs variante).
-- Dato no sensible (solo un booleano). Aditiva. Rollback: 073_variant_stock_enabled.rollback.sql
create or replace function public.variant_stock_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.variant_stock_on();
$$;
revoke all on function public.variant_stock_enabled() from public;
grant execute on function public.variant_stock_enabled() to anon, authenticated;
