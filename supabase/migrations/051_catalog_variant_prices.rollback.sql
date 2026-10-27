-- Rollback de 051: vuelve a catalog_retail de 021 (sin p_id ni precios por variante).
drop function if exists public.catalog_retail(uuid,text,text,boolean,boolean,integer,integer,integer,integer,uuid);

create or replace function public.catalog_retail(
  p_category uuid default null, p_search text default null, p_sort text default 'price_asc',
  p_in_stock boolean default false, p_promo_only boolean default false,
  p_min integer default null, p_max integer default null,
  p_limit integer default 24, p_offset integer default 0)
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
    where (p_category is null or p.category_id = p_category)
      and (p_search is null or p.name ilike '%' || replace(replace(p_search,'%',''),'_','') || '%')
      and (not p_in_stock or coalesce(p.stock,0) > 0)
  )
  select b.id, b.name, b.price, b.price_cop, b.eff, b.promo_kind, b.promo_value, b.category, b.category_id,
         b.stock, b.description, b.variants, b.images, b.created_at, count(*) over () as total_count
  from base b
  where (not p_promo_only or b.promo_kind is not null)
    and (p_min is null or b.eff >= p_min) and (p_max is null or b.eff <= p_max)
  order by
    case when p_sort = 'price_desc' then b.eff end desc,
    case when p_sort = 'newest' then b.created_at end desc,
    case when p_sort = 'name' then b.name end asc,
    case when p_sort not in ('price_desc','newest','name') then b.eff end asc,
    b.eff asc, b.id asc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
$$;
grant execute on function public.catalog_retail(uuid,text,text,boolean,boolean,integer,integer,integer,integer) to anon, authenticated;
