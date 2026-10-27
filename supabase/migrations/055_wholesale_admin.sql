-- 055: administración mayorista + inventario al confirmar + solicitud de acceso.
--  * wholesale_prices.updated_at / updated_by (trigger).
--  * admin_upsert_wholesale_prices, admin_set_wholesale_visibility, admin_remove_wholesale_prices: escrituras atómicas (solo admin).
--  * admin_wholesale_products: lista paginada de TODOS los productos con su estado mayorista (solo admin).
--  * wholesale_min() (lectura segura del mínimo) y admin_set_wholesale_min().
--  * orders.stock_deducted + confirm_order / cancel_order (el stock se descuenta al CONFIRMAR, nunca al crear).
--  * request_wholesale_access (usuario autenticado sin fila crea solicitud pending) y wholesale_pending_count (admin).
--  * set_wholesaler_status: valida existencia y reinicia last_status_notified al salir de 'approved' (permite reenviar el correo).
-- Estados de pedido (los que usa AdminOrders): pending | confirmed | cancelled.
-- Rollback: 055_wholesale_admin.rollback.sql
set local lock_timeout = '3s';

-- ---------- wholesale_prices: auditoría ligera ----------
alter table public.wholesale_prices add column if not exists updated_at timestamptz not null default now();
alter table public.wholesale_prices add column if not exists updated_by uuid;

create or replace function private.wholesale_prices_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
revoke all on function private.wholesale_prices_touch() from public, anon, authenticated;
drop trigger if exists wholesale_prices_touch_trg on public.wholesale_prices;
create trigger wholesale_prices_touch_trg before insert or update on public.wholesale_prices
  for each row execute function private.wholesale_prices_touch();

-- ---------- escrituras admin atómicas ----------
-- p_rows = [{product_id, variant_name|null, price_cop, is_visible?}]. Si is_visible no viene: conserva el actual (true si es nueva).
-- Producto CON variantes: solo filas de variante existentes en products.variants (la base se rechaza).
create or replace function public.admin_upsert_wholesale_prices(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_pid uuid; v_var text; v_price integer; v_vis boolean; v_prod record; v_n integer := 0; v_has_var boolean;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'INVALID_ROWS';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_pid := (r ->> 'product_id')::uuid;
      v_price := (r ->> 'price_cop')::integer;
      v_vis := (r ->> 'is_visible')::boolean;
    exception when others then raise exception 'INVALID_ROWS';
    end;
    v_var := nullif(btrim(coalesce(r ->> 'variant_name', '')), '');
    if v_price is null or v_price < 1 then raise exception 'INVALID_PRICE'; end if;
    select id, name, variants into v_prod from public.products where id = v_pid;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    v_has_var := jsonb_typeof(v_prod.variants) = 'array' and jsonb_array_length(v_prod.variants) > 0;
    if v_var is null and v_has_var then raise exception 'VARIANT_REQUIRED:%', v_prod.name; end if;
    if v_var is not null and not exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(v_prod.variants) = 'array' then v_prod.variants else '[]'::jsonb end) e
         where e ->> 'name' = v_var) then
      raise exception 'VARIANT_NOT_FOUND:%', v_prod.name;
    end if;
    insert into public.wholesale_prices as w (product_id, variant_name, price_cop, is_visible)
    values (v_pid, v_var, v_price, coalesce(v_vis, true))
    on conflict (product_id, (coalesce(variant_name, '')))
    do update set price_cop = excluded.price_cop, is_visible = coalesce(v_vis, w.is_visible);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('upserted', v_n);
end $$;

create or replace function public.admin_set_wholesale_visibility(p_product_ids uuid[], p_visible boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_product_ids is null or coalesce(array_length(p_product_ids, 1), 0) < 1 or array_length(p_product_ids, 1) > 500 or p_visible is null then
    raise exception 'INVALID_ROWS';
  end if;
  update public.wholesale_prices set is_visible = p_visible where product_id = any (p_product_ids) and is_visible is distinct from p_visible;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- quita TODOS los precios mayoristas de los productos indicados (despublica y borra)
create or replace function public.admin_remove_wholesale_prices(p_product_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_product_ids is null or coalesce(array_length(p_product_ids, 1), 0) < 1 or array_length(p_product_ids, 1) > 500 then
    raise exception 'INVALID_ROWS';
  end if;
  delete from public.wholesale_prices where product_id = any (p_product_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- lista admin: p_status in (all | published | hidden | none | no_stock)
--   published = vendible a mayoristas (precio visible) · hidden = tiene precio pero oculto · none = sin precio mayorista · no_stock = stock <= 0
create or replace function public.admin_wholesale_products(
  p_search text default null, p_category uuid default null, p_status text default 'all',
  p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, name text, category text, category_id uuid, image text, stock integer, price_cop integer,
  variants jsonb, wholesale_price_cop integer, wholesale_status text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  return query
  with base as (
    select p.id, p.name, p.category, p.category_id, p.images[1] as image, p.stock, p.price_cop, p.variants, p.created_at,
           private.wholesale_product_price(p.id) as wprice,
           exists (select 1 from public.wholesale_prices w where w.product_id = p.id) as has_rows
    from public.products p
    where (p_category is null or p.category_id = p_category)
      and (p_search is null or p.name ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
  ),
  st as (
    select b.*, case when b.wprice is not null then 'published' when b.has_rows then 'hidden' else 'none' end as wstatus from base b
  ),
  page as (
    select s.*, count(*) over () as total_count from st s
    where case coalesce(p_status, 'all')
            when 'published' then s.wstatus = 'published'
            when 'hidden' then s.wstatus = 'hidden'
            when 'none' then s.wstatus = 'none'
            when 'no_stock' then coalesce(s.stock, 0) <= 0
            else true end
    order by s.created_at desc, s.id
    limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0)
  )
  select g.id, g.name, g.category, g.category_id, g.image, g.stock, g.price_cop,
         jsonb_build_object(
           'base', (select jsonb_build_object('wholesale_price_cop', w.price_cop, 'is_visible', w.is_visible)
                    from public.wholesale_prices w where w.product_id = g.id and w.variant_name is null),
           'items', case when jsonb_typeof(g.variants) = 'array' then (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'name', e.e ->> 'name',
                        'retail_price_cop', case when (e.e ->> 'price_cop') ~ '^[0-9]+$' then (e.e ->> 'price_cop')::integer end,
                        'wholesale_price_cop', w.price_cop, 'is_visible', w.is_visible) order by e.ord), '[]'::jsonb)
               from jsonb_array_elements(g.variants) with ordinality as e(e, ord)
               left join public.wholesale_prices w on w.product_id = g.id and w.variant_name = e.e ->> 'name')
             else '[]'::jsonb end),
         g.wprice, g.wstatus, g.total_count
  from page g
  order by g.created_at desc, g.id;
end $$;

-- ---------- mínimo mayorista ----------
create or replace function public.wholesale_min()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::bigint from public.settings s where s.key = 'wholesale_min_cop'
                   and (s.value #>> '{}') ~ '^[0-9]+$'), 3500000);
$$;

create or replace function public.admin_set_wholesale_min(p_cop integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_cop is null or p_cop < 0 or p_cop > 1000000000 then raise exception 'INVALID_MIN'; end if;
  insert into public.settings (key, value) values ('wholesale_min_cop', to_jsonb(p_cop))
  on conflict (key) do update set value = excluded.value;
end $$;

-- ---------- inventario: se descuenta al confirmar ----------
alter table public.orders add column if not exists stock_deducted boolean not null default false;

-- líneas del pedido: order_lines si existen; si no (pedidos antiguos) items jsonb {id, quantity}
create or replace function private.order_stock_lines(p_order uuid)
returns table (product_id uuid, qty integer)
language sql stable security definer set search_path = '' as $$
  select l.product_id, sum(l.qty)::integer from public.order_lines l
  where l.order_id = p_order and l.product_id is not null group by l.product_id
  union all
  select (i ->> 'id')::uuid, sum(case when (i ->> 'quantity') ~ '^[0-9]+$' then (i ->> 'quantity')::integer else 0 end)::integer
  from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) i
  where o.id = p_order and (i ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (select 1 from public.order_lines x where x.order_id = p_order)
  group by (i ->> 'id')::uuid;
$$;
revoke all on function private.order_stock_lines(uuid) from public, anon, authenticated;

create or replace function public.confirm_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o record; v_l record; v_prod record; v_out jsonb := '[]'::jsonb;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  -- idempotente: ya confirmado o ya descontado => no vuelve a descontar
  if v_o.stock_deducted then
    if v_o.status is distinct from 'confirmed' then update public.orders set status = 'confirmed' where id = p_order_id; end if;
    return jsonb_build_object('order_id', p_order_id, 'status', 'confirmed', 'already', true, 'stock_deducted', true, 'lines', '[]'::jsonb);
  end if;
  if v_o.status = 'confirmed' then
    return jsonb_build_object('order_id', p_order_id, 'status', 'confirmed', 'already', true, 'stock_deducted', false, 'lines', '[]'::jsonb);
  end if;
  if v_o.status not in ('pending', 'cancelled') then raise exception 'INVALID_STATE:%', v_o.status; end if;

  -- bloquea productos en orden de id (evita interbloqueos) y valida TODO antes de descontar
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

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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

-- ---------- solicitud de acceso mayorista (cuentas ya existentes) ----------
create or replace function public.request_wholesale_access(
  p_business_name text, p_phone text, p_city text, p_tax_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_name text; v_phone text; v_city text; v_tax text; v_digits text; v_status text; v_email text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_name := left(regexp_replace(btrim(coalesce(p_business_name, '')), '[<>]', '', 'g'), 120);
  v_phone := left(regexp_replace(coalesce(p_phone, ''), '[^0-9+ -]', '', 'g'), 30);
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  v_city := left(regexp_replace(btrim(coalesce(p_city, '')), '[<>]', '', 'g'), 80);
  v_tax := nullif(left(regexp_replace(btrim(coalesce(p_tax_id, '')), '[<>]', '', 'g'), 30), '');
  if length(v_name) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(v_digits) < 7 or length(v_digits) > 15 then raise exception 'INVALID_PHONE'; end if;
  if length(v_city) < 2 then raise exception 'INVALID_CITY'; end if;
  select status into v_status from public.wholesalers where user_id = v_uid;
  if found then return jsonb_build_object('status', v_status, 'created', false); end if;
  select email into v_email from auth.users where id = v_uid;
  insert into public.wholesalers (user_id, email, business_name, phone, city, tax_id)
  values (v_uid, v_email, v_name, v_phone, v_city, v_tax) on conflict (user_id) do nothing;
  return jsonb_build_object('status', 'pending', 'created', true);
end $$;

create or replace function public.wholesale_pending_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  return (select count(*)::integer from public.wholesalers where status = 'pending');
end $$;

-- ---------- set_wholesaler_status: existe + permite reenviar correo al re-aprobar ----------
create or replace function public.set_wholesaler_status(p_user uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('pending','approved','rejected','suspended') then raise exception 'INVALID_STATUS'; end if;
  update public.wholesalers
  set status = p_status, notes = left(p_notes, 500), reviewed_by = (select auth.uid()), reviewed_at = now(),
      last_status_notified = case when p_status = 'approved' then last_status_notified else null end
  where user_id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ---------- permisos ----------
revoke all on function public.admin_upsert_wholesale_prices(jsonb) from public, anon;
revoke all on function public.admin_set_wholesale_visibility(uuid[], boolean) from public, anon;
revoke all on function public.admin_remove_wholesale_prices(uuid[]) from public, anon;
revoke all on function public.admin_wholesale_products(text, uuid, text, integer, integer) from public, anon;
revoke all on function public.admin_set_wholesale_min(integer) from public, anon;
revoke all on function public.confirm_order(uuid) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
revoke all on function public.request_wholesale_access(text, text, text, text) from public, anon;
revoke all on function public.wholesale_pending_count() from public, anon;
revoke all on function public.wholesale_min() from public;
grant execute on function public.admin_upsert_wholesale_prices(jsonb) to authenticated;
grant execute on function public.admin_set_wholesale_visibility(uuid[], boolean) to authenticated;
grant execute on function public.admin_remove_wholesale_prices(uuid[]) to authenticated;
grant execute on function public.admin_wholesale_products(text, uuid, text, integer, integer) to authenticated;
grant execute on function public.admin_set_wholesale_min(integer) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.request_wholesale_access(text, text, text, text) to authenticated;
grant execute on function public.wholesale_pending_count() to authenticated;
grant execute on function public.wholesale_min() to anon, authenticated;
