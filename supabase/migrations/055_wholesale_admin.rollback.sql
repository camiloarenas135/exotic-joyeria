-- Rollback 055. ADVERTENCIA: orders.stock_deducted se elimina; el stock ya descontado NO se devuelve automáticamente
-- (cancele antes los pedidos confirmados con cancel_order si necesita devolver inventario).
drop function if exists public.wholesale_pending_count();
drop function if exists public.request_wholesale_access(text, text, text, text);
drop function if exists public.cancel_order(uuid);
drop function if exists public.confirm_order(uuid);
drop function if exists private.order_stock_lines(uuid);
drop function if exists public.admin_set_wholesale_min(integer);
drop function if exists public.wholesale_min();
drop function if exists public.admin_wholesale_products(text, uuid, text, integer, integer);
drop function if exists public.admin_remove_wholesale_prices(uuid[]);
drop function if exists public.admin_set_wholesale_visibility(uuid[], boolean);
drop function if exists public.admin_upsert_wholesale_prices(jsonb);
alter table public.orders drop column if exists stock_deducted;
drop trigger if exists wholesale_prices_touch_trg on public.wholesale_prices;
drop function if exists private.wholesale_prices_touch();
alter table public.wholesale_prices drop column if exists updated_by;
alter table public.wholesale_prices drop column if exists updated_at;
-- set_wholesaler_status vuelve a la versión de 030
create or replace function public.set_wholesaler_status(p_user uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('pending','approved','rejected','suspended') then raise exception 'INVALID_STATUS'; end if;
  update public.wholesalers
  set status = p_status, notes = left(p_notes, 500), reviewed_by = (select auth.uid()), reviewed_at = now()
  where user_id = p_user;
end $$;
