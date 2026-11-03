-- 057: historial de pedidos del mayorista + columna que faltaba para el correo de aprobación.
--  * wholesalers.last_status_notified: la usan set_wholesaler_status (055) y la función wholesale-mail.
--    Ninguna migración anterior la creaba; sin ella aprobar/rechazar/suspender falla.
--  * my_wholesale_orders(): SOLO los pedidos del propio usuario (canal wholesale), con campos acotados.
--    No se abre ninguna política SELECT en `orders`: así no se exponen columnas internas (stock_deducted, etc.).
-- Aditiva e idempotente. Rollback: 057_wholesale_orders_history.rollback.sql
set local lock_timeout = '3s';

alter table public.wholesalers add column if not exists last_status_notified text;

create or replace function public.my_wholesale_orders(p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, created_at timestamptz, status text, total_cop integer, lines jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
  select o.id, o.created_at, o.status, o.total_cop,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'name', l.name_snapshot, 'variant', l.variant_name, 'qty', l.qty,
                     'unit_price', l.unit_price_cop, 'line_total', l.line_total_cop) order by l.id)
                   from public.order_lines l where l.order_id = o.id), '[]'::jsonb),
         count(*) over ()
  from public.orders o
  where o.user_id = v_uid and o.channel = 'wholesale'
  order by o.created_at desc, o.id
  limit greatest(least(p_limit, 50), 1) offset greatest(p_offset, 0);
end $$;

revoke all on function public.my_wholesale_orders(integer, integer) from public, anon;
grant execute on function public.my_wholesale_orders(integer, integer) to authenticated;
