-- 056: create_order endurecido (misma firma pública: create_order(text, jsonb, jsonb)).
--  * Canal wholesale: nombre y teléfono salen de `wholesalers` (el cliente ya no elige a nombre de quién pide);
--    si el perfil está incompleto se usan los del cliente validados.
--  * Rate limit: wholesale = 5 pedidos/hora por auth.uid(); retail = 5/hora por teléfono (como antes).
--  * Precio mayorista único vía private.wholesale_unit_price (la misma regla del catálogo); sin promociones.
--  * VARIANT_REQUIRED (solo wholesale): producto con variantes y línea sin variante.
--  * Total en bigint; TOTAL_TOO_LARGE si excede el rango de integer de total_cop/line_total_cop.
--  * Mínimo mayorista vía public.wholesale_min() (requiere 055).
--  * Retail: comportamiento idéntico a la 040/051. El stock NO se descuenta al crear (se descuenta en confirm_order, 055).
-- Rollback: 056_create_order_hardening.rollback.sql
set local lock_timeout = '3s';

create or replace function public.create_order(p_channel text, p_customer jsonb, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_digits text;
  v_uid uuid := (select auth.uid());
  v_w record;
  v_line jsonb;
  v_prod record;
  v_variant jsonb;
  v_vname text;
  v_qty integer;
  v_base integer;
  v_unit integer;
  v_promo record;
  v_total bigint := 0;
  v_line_total bigint;
  v_min bigint;
  v_order_id uuid;
  v_out jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_stock_use jsonb := '{}'::jsonb;
  v_used integer;
begin
  if p_channel not in ('retail','wholesale') then raise exception 'INVALID_CHANNEL'; end if;

  v_name := left(regexp_replace(btrim(coalesce(p_customer->>'name','')), '[<>]', '', 'g'), 100);
  v_phone := left(regexp_replace(coalesce(p_customer->>'phone',''), '[^0-9+ -]', '', 'g'), 20);

  if p_channel = 'wholesale' then
    if not (select public.is_approved_wholesaler()) then raise exception 'NOT_WHOLESALER'; end if;
    -- identidad desde el registro del mayorista, no desde el navegador
    select left(regexp_replace(btrim(coalesce(w.business_name,'')), '[<>]', '', 'g'), 100) as bn,
           left(regexp_replace(coalesce(w.phone,''), '[^0-9+ -]', '', 'g'), 20) as ph
      into v_w from public.wholesalers w where w.user_id = v_uid;
    if length(coalesce(v_w.bn,'')) >= 2 then v_name := v_w.bn; end if;
    if length(regexp_replace(coalesce(v_w.ph,''), '\D', '', 'g')) between 7 and 15 then v_phone := v_w.ph; end if;
  end if;

  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if length(v_name) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(v_digits) < 7 or length(v_digits) > 15 then raise exception 'INVALID_PHONE'; end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 100 then
    raise exception 'INVALID_LINES';
  end if;

  -- anti-spam: máx. 5 pedidos por hora (mayorista: por cuenta; detal: por teléfono)
  if p_channel = 'wholesale' then
    if (select count(*) from public.orders o
        where o.created_at > now() - interval '1 hour' and o.channel = 'wholesale' and o.user_id = v_uid) >= 5 then
      raise exception 'RATE_LIMIT';
    end if;
  elsif (select count(*) from public.orders o
         where o.created_at > now() - interval '1 hour'
           and regexp_replace(o.customer_phone, '\D', '', 'g') = v_digits) >= 5 then
    raise exception 'RATE_LIMIT';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_qty := (v_line->>'qty')::integer;
    exception when others then raise exception 'INVALID_QTY';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'INVALID_QTY'; end if;

    select * into v_prod from public.products where id = (v_line->>'product_id')::uuid;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    v_used := coalesce((v_stock_use ->> v_prod.id::text)::integer, 0) + v_qty;
    if v_prod.stock is null or v_used > v_prod.stock then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
    v_stock_use := v_stock_use || jsonb_build_object(v_prod.id::text, v_used);

    v_vname := nullif(btrim(coalesce(v_line->>'variant','')), '');
    v_variant := null;
    if v_vname is not null then
      select v into v_variant from jsonb_array_elements(coalesce(v_prod.variants,'[]'::jsonb)) v
        where v->>'name' = v_vname limit 1;
      if v_variant is null then raise exception 'VARIANT_NOT_FOUND:%', v_prod.name; end if;
    end if;

    if p_channel = 'retail' then
      v_base := coalesce((v_variant->>'price_cop')::integer, v_prod.price_cop);
      if v_base is null then raise exception 'NO_PRICE:%', v_prod.name; end if;
      select * into v_promo from public.best_promo(v_prod.id, v_base);
      v_unit := coalesce(v_promo.final_price, v_base);
    else
      if v_vname is null and jsonb_typeof(v_prod.variants) = 'array' and jsonb_array_length(v_prod.variants) > 0 then
        raise exception 'VARIANT_REQUIRED:%', v_prod.name;
      end if;
      v_unit := private.wholesale_unit_price(v_prod.id, v_vname);
      if v_unit is null then raise exception 'NOT_IN_CHANNEL:%', v_prod.name; end if;
    end if;

    v_line_total := v_unit::bigint * v_qty;
    v_total := v_total + v_line_total;
    if v_line_total > 2000000000 or v_total > 2000000000 then raise exception 'TOTAL_TOO_LARGE'; end if;
    v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'variant', v_vname,
                                         'qty', v_qty, 'unit_price', v_unit, 'line_total', v_line_total);
    -- mismo formato que usa hoy AdminOrders (items)
    v_items := v_items || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'quantity', v_qty,
                 'price', '$' || replace(to_char(v_unit, 'FM999,999,999'), ',', '.'),
                 'selectedVariant', case when v_vname is null then null
                   else jsonb_build_object('name', v_vname, 'price', '$' || replace(to_char(v_unit, 'FM999,999,999'), ',', '.')) end);
  end loop;

  if p_channel = 'wholesale' then
    v_min := public.wholesale_min();
    if v_total < v_min then raise exception 'MIN_WHOLESALE:%', v_min; end if;
  end if;

  insert into public.orders (customer_name, customer_phone, items, total_amount, status, channel, user_id, subtotal_cop, total_cop)
  values (v_name, v_phone, v_items, v_total, 'pending', p_channel,
          case when p_channel = 'wholesale' then v_uid end, v_total::integer, v_total::integer)
  returning id into v_order_id;

  insert into public.order_lines (order_id, product_id, variant_name, name_snapshot, unit_price_cop, qty, line_total_cop)
  select v_order_id, (l->>'product_id')::uuid, l->>'variant', l->>'name',
         (l->>'unit_price')::integer, (l->>'qty')::integer, (l->>'line_total')::integer
  from jsonb_array_elements(v_out) l;

  return jsonb_build_object('order_id', v_order_id, 'total', v_total, 'lines', v_out);
end $$;
revoke execute on function public.create_order(text, jsonb, jsonb) from public;
grant execute on function public.create_order(text, jsonb, jsonb) to anon, authenticated;
