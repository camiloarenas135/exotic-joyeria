-- 054: núcleo de catálogo compartido por canal (detal / mayorista).
--  * private.catalog_core(p_channel, ...): UNA sola implementación de filtros, orden, paginación, total_count y variantes.
--  * catalog_retail: misma firma y mismas 15 columnas que la 051 (envoltorio fino). Resultados idénticos.
--  * catalog_wholesale: solo `authenticated` y solo mayoristas aprobados; mismas columnas + retail_price_cop y
--    retail_effective_price_cop; NUNCA aplica promociones.
--  * collection_covers_wholesale: colecciones con >=1 producto publicado para mayoristas.
--  * private.wholesale_*: reglas de elegibilidad y precio mayorista (las usará create_order en la 056).
-- Reglas: un producto está "publicado" si tiene precio mayorista visible. Si el producto tiene variantes solo cuentan
-- las variantes visibles que existan en products.variants (la fila base se ignora). wholesale_catalog() queda intacta (deprecada).
-- Rollback: 054_catalog_core.rollback.sql
set local lock_timeout = '3s';

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- precio mayorista de una línea (producto + variante). NULL = no vendible en el canal.
create or replace function private.wholesale_unit_price(p_product uuid, p_variant text)
returns integer language sql stable security definer set search_path = '' as $$
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

-- precio "desde" del producto en mayoristas: base si no tiene variantes; mínimo de sus variantes visibles si las tiene.
create or replace function private.wholesale_product_price(p_product uuid)
returns integer language sql stable security definer set search_path = '' as $$
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

create or replace function private.wholesale_eligible(p_product uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.wholesale_product_price(p_product) is not null;
$$;

create or replace function private.catalog_core(
  p_channel text, p_category uuid, p_search text, p_sort text,
  p_in_stock boolean, p_promo_only boolean, p_min integer, p_max integer,
  p_limit integer, p_offset integer, p_id uuid)
returns table (
  id uuid, name text, price text, price_cop integer, effective_price_cop integer,
  promo_kind text, promo_value integer, category text, category_id uuid, stock integer,
  description text, variants jsonb, images text[], created_at timestamptz, total_count bigint,
  retail_price_cop integer, retail_effective_price_cop integer)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.*, bp.kind as bp_kind, bp.value as bp_value,
           coalesce(bp.final_price, p.price_cop) as retail_eff,
           case when p_channel = 'wholesale' then wp.wprice else coalesce(bp.final_price, p.price_cop) end as eff
    from public.products p
    left join lateral public.best_promo(p.id, p.price_cop) bp on true
    left join lateral (select private.wholesale_product_price(p.id) as wprice where p_channel = 'wholesale') wp on true
    where p_channel in ('retail', 'wholesale')
      and (p_channel = 'retail' or (select public.is_approved_wholesaler()))
      and (p_channel = 'retail' or wp.wprice is not null)
      and (p_id is null or p.id = p_id)
      and (p_category is null or p.category_id = p_category)
      and (p_search is null or p.name ilike '%' || replace(replace(p_search,'%',''),'_','') || '%')
      and (not p_in_stock or coalesce(p.stock,0) > 0)
  ),
  page as (
    select b.*, count(*) over () as total_count,
           row_number() over (
             order by
               case when p_sort = 'price_desc' then b.eff end desc,
               case when p_sort = 'newest' then b.created_at end desc,
               case when p_sort = 'name' then b.name end asc,
               case when p_sort not in ('price_desc','newest','name') then b.eff end asc,
               b.eff asc, b.id asc) as rn
    from base b
    where (p_channel <> 'retail' or not p_promo_only or b.bp_kind is not null)
      and (p_min is null or b.eff >= p_min) and (p_max is null or b.eff <= p_max)
    order by rn
    limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0)
  )
  select pg.id, pg.name,
         case when p_channel = 'wholesale' then '$' || replace(to_char(pg.eff, 'FM999,999,999'), ',', '.') else pg.price end,
         case when p_channel = 'wholesale' then pg.eff else pg.price_cop end,
         pg.eff,
         case when p_channel = 'retail' then pg.bp_kind end,
         case when p_channel = 'retail' then pg.bp_value end,
         pg.category, pg.category_id, pg.stock, pg.description,
         case
           when p_channel = 'wholesale' then (
             select coalesce(jsonb_agg(
                      v.e || jsonb_build_object(
                        'price', '$' || replace(to_char(w.price_cop, 'FM999,999,999'), ',', '.'),
                        'price_cop', w.price_cop,
                        'effective_price_cop', w.price_cop,
                        'promo_kind', null::text, 'promo_value', null::integer,
                        'retail_price_cop', r.rp,
                        'retail_effective_price_cop', coalesce(bv.final_price, r.rp))
                      order by v.ord), '[]'::jsonb)
             from jsonb_array_elements(case when jsonb_typeof(pg.variants) = 'array' then pg.variants else '[]'::jsonb end)
                  with ordinality as v(e, ord)
             join public.wholesale_prices w
               on w.product_id = pg.id and w.variant_name = v.e ->> 'name' and w.is_visible
             cross join lateral (select case when (v.e->>'price_cop') ~ '^[0-9]+$' then (v.e->>'price_cop')::integer
                                             else pg.price_cop end as rp) r
             left join lateral public.best_promo(pg.id, r.rp) bv on true)
           when jsonb_typeof(pg.variants) = 'array' then (
             select coalesce(jsonb_agg(
               case when (v.e->>'price_cop') ~ '^[0-9]+$'
                 then v.e || jsonb_build_object(
                        'effective_price_cop', coalesce(bv.final_price, (v.e->>'price_cop')::integer),
                        'promo_kind', bv.kind, 'promo_value', bv.value)
                 else v.e end
               order by v.ord), '[]'::jsonb)
             from jsonb_array_elements(pg.variants) with ordinality as v(e, ord)
             left join lateral public.best_promo(
               pg.id, case when (v.e->>'price_cop') ~ '^[0-9]+$' then (v.e->>'price_cop')::integer end) bv on true
           )
           else pg.variants
         end,
         pg.images, pg.created_at, pg.total_count,
         pg.price_cop, pg.retail_eff
  from page pg
  order by pg.rn;
$$;

-- detal: misma firma y columnas que la 051
create or replace function public.catalog_retail(
  p_category uuid default null, p_search text default null, p_sort text default 'price_asc',
  p_in_stock boolean default false, p_promo_only boolean default false,
  p_min integer default null, p_max integer default null,
  p_limit integer default 24, p_offset integer default 0, p_id uuid default null)
returns table (
  id uuid, name text, price text, price_cop integer, effective_price_cop integer,
  promo_kind text, promo_value integer, category text, category_id uuid, stock integer,
  description text, variants jsonb, images text[], created_at timestamptz, total_count bigint)
language sql stable set search_path = '' as $$
  select c.id, c.name, c.price, c.price_cop, c.effective_price_cop, c.promo_kind, c.promo_value, c.category,
         c.category_id, c.stock, c.description, c.variants, c.images, c.created_at, c.total_count
  from private.catalog_core('retail', p_category, p_search, p_sort, p_in_stock, p_promo_only,
                            p_min, p_max, p_limit, p_offset, p_id) with ordinality as c
  order by c.ordinality;
$$;

-- mayorista: solo aprobados (el núcleo devuelve 0 filas a cualquier otro)
create or replace function public.catalog_wholesale(
  p_category uuid default null, p_search text default null, p_sort text default 'price_asc',
  p_in_stock boolean default false, p_min integer default null, p_max integer default null,
  p_limit integer default 24, p_offset integer default 0, p_id uuid default null)
returns table (
  id uuid, name text, price text, price_cop integer, effective_price_cop integer,
  promo_kind text, promo_value integer, category text, category_id uuid, stock integer,
  description text, variants jsonb, images text[], created_at timestamptz, total_count bigint,
  retail_price_cop integer, retail_effective_price_cop integer)
language sql stable set search_path = '' as $$
  select c.id, c.name, c.price, c.price_cop, c.effective_price_cop, c.promo_kind, c.promo_value, c.category,
         c.category_id, c.stock, c.description, c.variants, c.images, c.created_at, c.total_count,
         c.retail_price_cop, c.retail_effective_price_cop
  from private.catalog_core('wholesale', p_category, p_search, p_sort, p_in_stock, false,
                            p_min, p_max, p_limit, p_offset, p_id) with ordinality as c
  order by c.ordinality;
$$;

-- colecciones con >=1 producto publicado para mayoristas
create or replace function public.collection_covers_wholesale()
returns table (category_id uuid, image text, product_count integer)
language sql stable security definer set search_path = '' as $$
  select c.id, coalesce(nullif(btrim(c.image), ''), p.images[1]), n.cnt
  from public.categories c
  cross join lateral (select count(*)::integer as cnt from public.products pr
                      where pr.category_id = c.id and private.wholesale_eligible(pr.id)) n
  left join lateral (
    select pr.images from public.products pr
    where pr.category_id = c.id and private.wholesale_eligible(pr.id) and coalesce(array_length(pr.images, 1), 0) > 0
    order by (coalesce(pr.stock, 0) > 0) desc, pr.created_at desc, pr.id
    limit 1) p on true
  where c.is_active and n.cnt > 0 and (select public.is_approved_wholesaler());
$$;

-- permisos
revoke all on function private.wholesale_unit_price(uuid, text) from public, anon, authenticated;
revoke all on function private.wholesale_product_price(uuid) from public, anon, authenticated;
revoke all on function private.wholesale_eligible(uuid) from public, anon, authenticated;
revoke all on function private.catalog_core(text,uuid,text,text,boolean,boolean,integer,integer,integer,integer,uuid) from public, anon, authenticated;
grant execute on function private.catalog_core(text,uuid,text,text,boolean,boolean,integer,integer,integer,integer,uuid) to anon, authenticated;
revoke all on function public.catalog_wholesale(uuid,text,text,boolean,integer,integer,integer,integer,uuid) from public, anon;
grant execute on function public.catalog_wholesale(uuid,text,text,boolean,integer,integer,integer,integer,uuid) to authenticated;
revoke all on function public.collection_covers_wholesale() from public, anon;
grant execute on function public.collection_covers_wholesale() to authenticated;
