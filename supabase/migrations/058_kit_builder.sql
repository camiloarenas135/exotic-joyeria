-- 058: Kit Emprendedor armable.
--  * El comprador arma su kit con piezas que la dueña habilita en el admin, cada una con un precio especial
--    (por producto, sin variantes). El total del kit es la suma de esos precios y nunca puede superar el tope
--    (settings.kit_max_cop, 500000 por defecto). Sin mínimo, sin cantidad máxima por pieza; el envío no entra.
--  * kit_pieces: RLS activa y sin políticas; todo pasa por RPC SECURITY DEFINER.
--  * kit_catalog(): lectura pública (tope + piezas habilitadas con stock). No expone product_id de piezas ocultas.
--  * create_kit_order(): solo detal. El precio sale SIEMPRE de kit_pieces; el cliente solo manda {product_id, qty}.
--    Una fila de order_lines por pieza, así confirm_order/cancel_order (055) descuentan y devuelven stock sin cambios.
--    orders.items lleva un único ítem visual SIN `id` (order_lines tiene prioridad sobre items en private.order_stock_lines).
--  * El kit no aplica promociones y las promociones no alteran el kit.
-- Rollback: 058_kit_builder.rollback.sql
set local lock_timeout = '3s';

create table if not exists public.kit_pieces (
  product_id uuid primary key references public.products(id) on delete cascade,
  special_price_cop integer not null check (special_price_cop > 0),
  enabled boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kit_pieces enable row level security;
revoke all on public.kit_pieces from anon, authenticated;
create index if not exists kit_pieces_enabled_sort_idx on public.kit_pieces (sort) where enabled;

insert into public.settings (key, value) values ('kit_max_cop', '500000'::jsonb) on conflict (key) do nothing;

-- Tope del kit: única fuente. Si falta o es inválido, 500000.
create or replace function private.kit_cap()
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'number' and (s.value #>> '{}')::numeric between 1 and 2000000000
                 then (s.value #>> '{}')::integer end
       from public.settings s where s.key = 'kit_max_cop'),
    500000);
$$;
revoke all on function private.kit_cap() from public;

-- Lectura pública: tope + piezas habilitadas, con stock, precio normal y sin variantes.
create or replace function public.kit_catalog()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'cap_cop', private.kit_cap(),
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', p.id,
               'name', p.name,
               'category', c.name,
               'image', p.images[1],
               'normal_price_cop', p.price_cop,
               'special_price_cop', k.special_price_cop,
               'stock', p.stock)
             order by k.sort, p.name)
        from public.kit_pieces k
        join public.products p on p.id = k.product_id
        left join public.categories c on c.id = p.category_id
       where k.enabled
         and p.price_cop is not null
         and coalesce(p.stock, 0) > 0
         and coalesce(jsonb_array_length(p.variants), 0) = 0
    ), '[]'::jsonb));
$$;
revoke execute on function public.kit_catalog() from public;
grant execute on function public.kit_catalog() to anon, authenticated;

-- ADMIN ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_kit_list()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'cap_cop', private.kit_cap(),
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', p.id,
               'name', p.name,
               'category', c.name,
               'image', p.images[1],
               'normal_price_cop', p.price_cop,
               'special_price_cop', k.special_price_cop,
               'enabled', k.enabled,
               'sort', k.sort,
               'stock', p.stock,
               'has_variants', coalesce(jsonb_array_length(p.variants), 0) > 0)
             order by k.sort, p.name)
        from public.kit_pieces k
        join public.products p on p.id = k.product_id
        left join public.categories c on c.id = p.category_id
    ), '[]'::jsonb));
end $$;

create or replace function public.admin_kit_upsert(p_product_id uuid, p_special_price integer, p_enabled boolean default true, p_sort integer default 0)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_prod record;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  select id, name, price_cop, variants into v_prod from public.products where id = p_product_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if coalesce(jsonb_array_length(v_prod.variants), 0) > 0 then raise exception 'VARIANT_PRODUCT:%', v_prod.name; end if;
  if v_prod.price_cop is null then raise exception 'NO_PRICE:%', v_prod.name; end if;
  if p_special_price is null or p_special_price < 1 then raise exception 'INVALID_PRICE'; end if;
  if p_special_price > v_prod.price_cop then raise exception 'PRICE_ABOVE_NORMAL:%', v_prod.name; end if;
  if p_special_price > private.kit_cap() then raise exception 'PRICE_ABOVE_CAP:%', v_prod.name; end if;

  insert into public.kit_pieces (product_id, special_price_cop, enabled, sort)
  values (p_product_id, p_special_price, coalesce(p_enabled, true), coalesce(p_sort, 0))
  on conflict (product_id) do update
    set special_price_cop = excluded.special_price_cop,
        enabled = excluded.enabled,
        sort = excluded.sort,
        updated_at = now();
end $$;

create or replace function public.admin_kit_remove(p_product_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  delete from public.kit_pieces where product_id = p_product_id;
end $$;

create or replace function public.admin_kit_set_cap(p_cap integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_cap is null or p_cap < 1 or p_cap > 2000000000 then raise exception 'INVALID_CAP'; end if;
  insert into public.settings (key, value) values ('kit_max_cop', to_jsonb(p_cap))
  on conflict (key) do update set value = excluded.value;
end $$;

revoke execute on function public.admin_kit_list() from public;
revoke execute on function public.admin_kit_upsert(uuid, integer, boolean, integer) from public;
revoke execute on function public.admin_kit_remove(uuid) from public;
revoke execute on function public.admin_kit_set_cap(integer) from public;
grant execute on function public.admin_kit_list() to authenticated;
grant execute on function public.admin_kit_upsert(uuid, integer, boolean, integer) to authenticated;
grant execute on function public.admin_kit_remove(uuid) to authenticated;
grant execute on function public.admin_kit_set_cap(integer) to authenticated;

-- PEDIDO --------------------------------------------------------------------------------------------------------
create or replace function public.create_kit_order(p_customer jsonb, p_pieces jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_digits text;
  v_piece jsonb;
  v_qty integer;
  v_pid uuid;
  v_prod record;
  v_special integer;
  v_cap integer := private.kit_cap();
  v_total bigint := 0;
  v_line_total bigint;
  v_order_id uuid;
  v_out jsonb := '[]'::jsonb;
  v_detail jsonb := '[]'::jsonb;
  v_use jsonb := '{}'::jsonb;
  v_used integer;
  v_price_txt text;
begin
  -- Solo detal: el mayorista tiene su propia tienda, mínimo y precios.
  if (select public.is_approved_wholesaler()) then raise exception 'NOT_RETAIL'; end if;

  v_name := left(regexp_replace(btrim(coalesce(p_customer->>'name','')), '[<>]', '', 'g'), 100);
  v_phone := left(regexp_replace(coalesce(p_customer->>'phone',''), '[^0-9+ -]', '', 'g'), 20);
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if length(v_name) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(v_digits) < 7 or length(v_digits) > 15 then raise exception 'INVALID_PHONE'; end if;

  if jsonb_typeof(p_pieces) <> 'array' then raise exception 'INVALID_LINES'; end if;
  if jsonb_array_length(p_pieces) < 1 then raise exception 'KIT_EMPTY'; end if;
  if jsonb_array_length(p_pieces) > 100 then raise exception 'INVALID_LINES'; end if;

  -- anti-spam: máx. 5 pedidos por hora por teléfono (igual que create_order)
  if (select count(*) from public.orders o
      where o.created_at > now() - interval '1 hour'
        and regexp_replace(o.customer_phone, '\D', '', 'g') = v_digits) >= 5 then
    raise exception 'RATE_LIMIT';
  end if;

  for v_piece in select * from jsonb_array_elements(p_pieces) loop
    begin
      v_qty := (v_piece->>'qty')::integer;
      v_pid := (v_piece->>'product_id')::uuid;
    exception when others then raise exception 'INVALID_LINES';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'INVALID_QTY'; end if;

    select p.id, p.name, p.price_cop, p.stock, p.variants, k.special_price_cop
      into v_prod
      from public.products p
      join public.kit_pieces k on k.product_id = p.id and k.enabled
     where p.id = v_pid;
    if not found then raise exception 'NOT_IN_KIT'; end if;
    if v_prod.price_cop is null or coalesce(jsonb_array_length(v_prod.variants), 0) > 0 then
      raise exception 'NOT_IN_KIT:%', v_prod.name;
    end if;

    -- el mismo producto repetido se acumula para validar stock una sola vez
    v_used := coalesce((v_use ->> v_prod.id::text)::integer, 0) + v_qty;
    if v_prod.stock is null or v_used > v_prod.stock then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
    v_use := v_use || jsonb_build_object(v_prod.id::text, v_used);

    v_special := least(v_prod.special_price_cop, v_prod.price_cop);  -- nunca más caro que el precio normal
    v_line_total := v_special::bigint * v_qty;
    v_total := v_total + v_line_total;
    if v_total > v_cap then raise exception 'KIT_OVER_CAP:%:%', v_total, v_cap; end if;

    v_out := v_out || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name,
                                         'qty', v_qty, 'unit_price', v_special, 'line_total', v_line_total);
    v_price_txt := '$' || replace(to_char(v_special, 'FM999,999,999'), ',', '.');
    v_detail := v_detail || jsonb_build_object('name', v_prod.name, 'qty', v_qty, 'price', v_price_txt);
  end loop;

  if v_total < 1 then raise exception 'KIT_EMPTY'; end if;

  insert into public.orders (customer_name, customer_phone, items, total_amount, status, channel, user_id, subtotal_cop, total_cop)
  values (v_name, v_phone,
          jsonb_build_array(jsonb_build_object(
            'name', 'Kit Emprendedor (armado)',
            'quantity', 1,
            'price', '$' || replace(to_char(v_total, 'FM999,999,999'), ',', '.'),
            'kit', v_detail)),
          v_total, 'pending', 'retail', null, v_total::integer, v_total::integer)
  returning id into v_order_id;

  insert into public.order_lines (order_id, product_id, variant_name, name_snapshot, unit_price_cop, qty, line_total_cop)
  select v_order_id, (l->>'product_id')::uuid, null, l->>'name',
         (l->>'unit_price')::integer, (l->>'qty')::integer, (l->>'line_total')::integer
  from jsonb_array_elements(v_out) l;

  return jsonb_build_object('order_id', v_order_id, 'total', v_total, 'cap', v_cap, 'lines', v_out);
end $$;
revoke execute on function public.create_kit_order(jsonb, jsonb) from public;
grant execute on function public.create_kit_order(jsonb, jsonb) to anon, authenticated;
