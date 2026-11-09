-- Rollback de 066. ATENCIÓN: borra los precios de la lista 'entrepreneur' (la clave única vieja no admite dos listas). Revertir antes 071 y 068.
set local lock_timeout = '3s';

delete from public.wholesale_prices where price_list <> 'wholesale';

create unique index wholesale_prices_uniq on public.wholesale_prices (product_id, (coalesce(variant_name, '')));
create unique index wholesale_prices_variant_uq on public.wholesale_prices (variant_id) where variant_id is not null;

drop policy if exists wholesale_prices_select_own_list on public.wholesale_prices;
create policy wholesale_prices_select_approved on public.wholesale_prices
  for select to authenticated using (is_visible and (select public.is_approved_wholesaler()));

drop function if exists public.admin_wholesale_products(text, uuid, text, integer, integer, text);
create function public.admin_wholesale_products(p_search text default null, p_category uuid default null, p_status text default 'all', p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, name text, category text, category_id uuid, image text, stock integer, price_cop integer, variants jsonb,
               wholesale_price_cop integer, wholesale_status text, total_count bigint)
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
revoke execute on function public.admin_wholesale_products(text, uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_wholesale_products(text, uuid, text, integer, integer) to authenticated;

drop function if exists public.admin_set_wholesale_visibility(uuid[], boolean, text);
create function public.admin_set_wholesale_visibility(p_product_ids uuid[], p_visible boolean) returns integer
language plpgsql security definer set search_path = '' as $$
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
revoke execute on function public.admin_set_wholesale_visibility(uuid[], boolean) from public, anon;
grant execute on function public.admin_set_wholesale_visibility(uuid[], boolean) to authenticated;

drop function if exists public.admin_remove_wholesale_prices(uuid[], text);
create function public.admin_remove_wholesale_prices(p_product_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
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
revoke execute on function public.admin_remove_wholesale_prices(uuid[]) from public, anon;
grant execute on function public.admin_remove_wholesale_prices(uuid[]) to authenticated;

drop function if exists public.admin_upsert_wholesale_prices(jsonb, text);
create function public.admin_upsert_wholesale_prices(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
revoke execute on function public.admin_upsert_wholesale_prices(jsonb) from public, anon;
grant execute on function public.admin_upsert_wholesale_prices(jsonb) to authenticated;

drop function if exists public.admin_set_entrepreneur_min(integer);
drop function if exists public.my_min_order();
drop function if exists private.list_min(text);
delete from public.settings where key = 'entrepreneur_min_cop';

create or replace function private.wholesale_unit_price(p_product uuid, p_variant text) returns integer
language sql stable security definer set search_path = '' as $$
  select w.price_cop
  from public.wholesale_prices w
  join public.products p on p.id = w.product_id
  where w.product_id = p_product and w.is_visible
    and (
      (nullif(btrim(coalesce(p_variant, '')), '') is null
        and w.variant_name is null
        and not (jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0))
      or
      (w.variant_name is not null and w.variant_name = btrim(p_variant)
        and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p.variants) = 'array' then p.variants else '[]'::jsonb end) e
                    where e ->> 'name' = w.variant_name))
    );
$$;
create or replace function private.wholesale_eligible(p_product uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.wholesale_product_price(p_product) is not null; $$;
create or replace function private.wholesale_product_price(p_product uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0 then
      (select min(w.price_cop)
       from jsonb_array_elements(p.variants) e
       join public.wholesale_prices w on w.product_id = p.id and w.variant_name = e ->> 'name' and w.is_visible)
    else
      (select w.price_cop from public.wholesale_prices w
       where w.product_id = p.id and w.variant_name is null and w.is_visible)
  end
  from public.products p where p.id = p_product;
$$;
drop function if exists private.wholesale_unit_price(uuid, text, text);
drop function if exists private.wholesale_eligible(uuid, text);
drop function if exists private.wholesale_product_price(uuid, text);

drop index if exists public.wholesale_prices_list_variant_uq;
drop index if exists public.wholesale_prices_list_uniq;
alter table public.orders drop constraint if exists orders_price_list_chk, drop column if exists price_list;
alter table public.wholesale_prices drop constraint if exists wholesale_prices_list_chk, drop column if exists price_list;
