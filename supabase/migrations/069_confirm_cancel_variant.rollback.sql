-- Rollback de 069: restaura confirm_order / cancel_order a su versión anterior (por producto) y borra order_stock_lines_v2.
set local lock_timeout = '3s';

create or replace function public.confirm_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o record; v_l record; v_prod record; v_out jsonb := '[]'::jsonb;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.stock_deducted then
    if v_o.status is distinct from 'confirmed' then update public.orders set status = 'confirmed' where id = p_order_id; end if;
    return jsonb_build_object('order_id', p_order_id, 'status', 'confirmed', 'already', true, 'stock_deducted', true, 'lines', '[]'::jsonb);
  end if;
  if v_o.status = 'confirmed' then
    return jsonb_build_object('order_id', p_order_id, 'status', 'confirmed', 'already', true, 'stock_deducted', false, 'lines', '[]'::jsonb);
  end if;
  if v_o.status not in ('pending', 'cancelled') then raise exception 'INVALID_STATE:%', v_o.status; end if;

  for v_l in select s.product_id, s.qty from private.order_stock_lines(p_order_id) s order by s.product_id loop
    select id, name, stock into v_prod from public.products where id = v_l.product_id for update;
    if not found then continue; end if;
    if coalesce(v_prod.stock, 0) < v_l.qty then
      raise exception 'INSUFFICIENT_STOCK:%:%:%', v_prod.name, coalesce(v_prod.stock, 0), v_l.qty;
    end if;
  end loop;
  for v_l in select s.product_id, s.qty from private.order_stock_lines(p_order_id) s order by s.product_id loop
    update public.products set stock = stock - v_l.qty where id = v_l.product_id returning id, name, stock into v_prod;
    if found then
      v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'deducted', v_l.qty, 'stock_after', v_prod.stock);
    end if;
  end loop;
  update public.orders set status = 'confirmed', stock_deducted = true where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', 'confirmed', 'already', false, 'stock_deducted', true, 'lines', v_out);
end $$;

create or replace function public.cancel_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o record; v_l record; v_prod record; v_out jsonb := '[]'::jsonb; v_restored boolean := false;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.stock_deducted then
    for v_l in select s.product_id, s.qty from private.order_stock_lines(p_order_id) s order by s.product_id loop
      update public.products set stock = coalesce(stock, 0) + v_l.qty where id = v_l.product_id returning id, name, stock into v_prod;
      if found then
        v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'returned', v_l.qty, 'stock_after', v_prod.stock);
      end if;
    end loop;
    v_restored := true;
  end if;
  if v_o.status is distinct from 'cancelled' or v_restored then
    update public.orders set status = 'cancelled', stock_deducted = false where id = p_order_id;
  end if;
  return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled',
                            'already', (v_o.status = 'cancelled' and not v_restored), 'stock_restored', v_restored, 'lines', v_out);
end $$;

drop function if exists private.order_stock_lines_v2(uuid);
