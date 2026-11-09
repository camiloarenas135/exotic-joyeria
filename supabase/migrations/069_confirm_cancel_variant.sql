-- 069: confirm_order / cancel_order descuentan y devuelven stock POR VARIANTE cuando `variant_stock_mode` = 'on' (Fase 1).
-- Con el modo APAGADO ambas funciones ejecutan exactamente la misma lógica de antes (por producto): el sitio actual no nota nada.
--   · private.order_stock_lines_v2(pedido): (producto, variante, nombre de variante, cantidad). Resuelve la variante por variant_id, por nombre
--     de la línea o, en pedidos viejos sin líneas, por items[].selectedVariant.name. order_stock_lines (v1) NO se toca.
--   · Orden de bloqueo canónico: pedido → productos (id asc) → variantes (id asc).
--   · Modo encendido, confirmar: línea sin variante en un producto con variantes => LEGACY_VARIANT_LINE (cancelar y rehacer el pedido);
--     variante sin stock suficiente => INSUFFICIENT_STOCK:<Producto (Variante)>:<stock>:<pedido>.
--   · Modo encendido, cancelar: devuelve a la variante. Una línea ya descontada sin variante identificable no bloquea la cancelación: se informa en `unassigned`.
-- Rollback: 069_confirm_cancel_variant.rollback.sql
set local lock_timeout = '3s';

create or replace function private.order_stock_lines_v2(p_order uuid)
returns table (product_id uuid, variant_id uuid, variant_name text, qty integer)
language sql stable security definer set search_path = '' as $$
  select x.product_id, x.variant_id, x.variant_name, sum(x.qty)::integer
  from (
    select l.product_id,
           coalesce(l.variant_id, (select pv.id from public.product_variants pv where pv.product_id = l.product_id and lower(pv.name) = lower(btrim(l.variant_name)))) as variant_id,
           nullif(btrim(l.variant_name), '') as variant_name, l.qty
      from public.order_lines l where l.order_id = p_order and l.product_id is not null
    union all
    select (i ->> 'id')::uuid,
           (select pv.id from public.product_variants pv where pv.product_id = (i ->> 'id')::uuid and lower(pv.name) = lower(btrim(i -> 'selectedVariant' ->> 'name'))),
           nullif(btrim(i -> 'selectedVariant' ->> 'name'), ''),
           case when (i ->> 'quantity') ~ '^[0-9]+$' then (i ->> 'quantity')::integer else 0 end
      from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) i
     where o.id = p_order and (i ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from public.order_lines z where z.order_id = p_order)
  ) x
  group by x.product_id, x.variant_id, x.variant_name;
$$;
revoke all on function private.order_stock_lines_v2(uuid) from public, anon, authenticated;

create or replace function public.confirm_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o record; v_l record; v_prod record; v_var record; v_out jsonb := '[]'::jsonb; v_on boolean := private.variant_stock_on(); v_has boolean; v_pstock integer;
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

  if not v_on then
    -- ---- modo apagado: lógica original por producto
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
  else
    -- ---- modo encendido: por variante. 1º productos (id asc), 2º variantes (id asc)
    for v_prod in select p.id from public.products p where p.id in (select s.product_id from private.order_stock_lines_v2(p_order_id) s) order by p.id loop
      perform 1 from public.products where id = v_prod.id for update;
    end loop;
    for v_l in select s.* from private.order_stock_lines_v2(p_order_id) s order by s.product_id, s.variant_id loop
      select id, name, stock into v_prod from public.products where id = v_l.product_id;
      if not found then continue; end if;
      v_has := exists (select 1 from public.product_variants pv where pv.product_id = v_l.product_id);
      if v_has then
        if v_l.variant_id is null then raise exception 'LEGACY_VARIANT_LINE:%', v_prod.name; end if;
        select pv.id, pv.name, pv.stock into v_var from public.product_variants pv where pv.id = v_l.variant_id for update;
        if not found then raise exception 'LEGACY_VARIANT_LINE:%', v_prod.name; end if;
        if v_var.stock < v_l.qty then
          raise exception 'INSUFFICIENT_STOCK:%:%:%', v_prod.name || ' (' || v_var.name || ')', v_var.stock, v_l.qty;
        end if;
      elsif coalesce(v_prod.stock, 0) < v_l.qty then
        raise exception 'INSUFFICIENT_STOCK:%:%:%', v_prod.name, coalesce(v_prod.stock, 0), v_l.qty;
      end if;
    end loop;
    for v_l in select s.* from private.order_stock_lines_v2(p_order_id) s order by s.product_id, s.variant_id loop
      select id, name, stock into v_prod from public.products where id = v_l.product_id;
      if not found then continue; end if;
      if v_l.variant_id is not null then
        update public.product_variants set stock = stock - v_l.qty where id = v_l.variant_id returning id, name, stock into v_var;
        perform private.variants_cache_rebuild(v_l.product_id);
        select p.stock into v_pstock from public.products p where p.id = v_l.product_id;
        v_out := v_out || jsonb_build_object('product_id', v_l.product_id, 'variant_id', v_var.id, 'name', v_prod.name || ' (' || v_var.name || ')',
                                             'deducted', v_l.qty, 'stock_after', v_var.stock, 'product_stock_after', v_pstock);
      else
        update public.products set stock = stock - v_l.qty where id = v_l.product_id returning id, name, stock into v_prod;
        v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'deducted', v_l.qty, 'stock_after', v_prod.stock);
      end if;
    end loop;
  end if;

  update public.orders set status = 'confirmed', stock_deducted = true where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', 'confirmed', 'already', false, 'stock_deducted', true, 'lines', v_out);
end $$;

create or replace function public.cancel_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o record; v_l record; v_prod record; v_var record; v_out jsonb := '[]'::jsonb; v_unassigned jsonb := '[]'::jsonb;
  v_restored boolean := false; v_on boolean := private.variant_stock_on();
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.stock_deducted then
    if not v_on then
      for v_l in select s.product_id, s.qty from private.order_stock_lines(p_order_id) s order by s.product_id loop
        update public.products set stock = coalesce(stock, 0) + v_l.qty where id = v_l.product_id returning id, name, stock into v_prod;
        if found then
          v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'returned', v_l.qty, 'stock_after', v_prod.stock);
        end if;
      end loop;
    else
      for v_prod in select p.id from public.products p where p.id in (select s.product_id from private.order_stock_lines_v2(p_order_id) s) order by p.id loop
        perform 1 from public.products where id = v_prod.id for update;
      end loop;
      for v_l in select s.* from private.order_stock_lines_v2(p_order_id) s order by s.product_id, s.variant_id loop
        select id, name, stock into v_prod from public.products where id = v_l.product_id;
        if not found then continue; end if;
        if v_l.variant_id is not null then
          update public.product_variants set stock = stock + v_l.qty where id = v_l.variant_id returning id, name, stock into v_var;
          perform private.variants_cache_rebuild(v_l.product_id);
          v_out := v_out || jsonb_build_object('product_id', v_l.product_id, 'variant_id', v_var.id, 'name', v_prod.name || ' (' || v_var.name || ')',
                                               'returned', v_l.qty, 'stock_after', v_var.stock);
        elsif exists (select 1 from public.product_variants pv where pv.product_id = v_l.product_id) then
          -- línea ya descontada sin variante identificable: no se puede devolver a una variante; no bloquea la cancelación
          v_unassigned := v_unassigned || jsonb_build_object('product_id', v_l.product_id, 'name', v_prod.name, 'qty', v_l.qty);
        else
          update public.products set stock = coalesce(stock, 0) + v_l.qty where id = v_l.product_id returning id, name, stock into v_prod;
          v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'returned', v_l.qty, 'stock_after', v_prod.stock);
        end if;
      end loop;
    end if;
    v_restored := true;
  end if;
  if v_o.status is distinct from 'cancelled' or v_restored then
    update public.orders set status = 'cancelled', stock_deducted = false where id = p_order_id;
  end if;
  return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled',
                            'already', (v_o.status = 'cancelled' and not v_restored), 'stock_restored', v_restored, 'lines', v_out,
                            'unassigned', v_unassigned);
end $$;
