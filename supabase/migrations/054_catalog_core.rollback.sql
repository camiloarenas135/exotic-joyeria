-- Rollback 054: restaura catalog_retail a la definición de la 051 y elimina lo nuevo.
-- (Ejecutar solo después de revertir 055/056, que dependen de private.*)
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
  with base as (
    select p.*, bp.kind as promo_kind, bp.value as promo_value,
           coalesce(bp.final_price, p.price_cop) as eff
    from public.products p
    left join lateral public.best_promo(p.id, p.price_cop) bp on true
    where (p_id is null or p.id = p_id)
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
    where (not p_promo_only or b.promo_kind is not null)
      and (p_min is null or b.eff >= p_min) and (p_max is null or b.eff <= p_max)
    order by rn
    limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0)
  )
  select pg.id, pg.name, pg.price, pg.price_cop, pg.eff, pg.promo_kind, pg.promo_value, pg.category, pg.category_id,
         pg.stock, pg.description,
         case when jsonb_typeof(pg.variants) = 'array' then (
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
         ) else pg.variants end as variants,
         pg.images, pg.created_at, pg.total_count
  from page pg
  order by pg.rn;
$$;

drop function if exists public.collection_covers_wholesale();
drop function if exists public.catalog_wholesale(uuid,text,text,boolean,integer,integer,integer,integer,uuid);
drop function if exists private.catalog_core(text,uuid,text,text,boolean,boolean,integer,integer,integer,integer,uuid);
drop function if exists private.wholesale_eligible(uuid);
drop function if exists private.wholesale_product_price(uuid);
drop function if exists private.wholesale_unit_price(uuid, text);
drop schema if exists private; -- falla si aún contiene objetos de 055/056 (a propósito)
