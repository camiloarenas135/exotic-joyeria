-- Rollback de 068: restaura catalog_core y collection_covers_wholesale (versión previa, una sola lista, sin tipo de cuenta).
-- Requiere que las funciones de 1 argumento (wholesale_product_price / wholesale_eligible) existan: aplicarlo ANTES de revertir 066.
set local lock_timeout = '3s';

create or replace function private.catalog_core(
  p_channel text, p_category uuid, p_search text, p_sort text, p_in_stock boolean, p_promo_only boolean,
  p_min integer, p_max integer, p_limit integer, p_offset integer, p_id uuid)
returns table (id uuid, name text, price text, price_cop integer, effective_price_cop integer, promo_kind text, promo_value integer,
               category text, category_id uuid, stock integer, description text, variants jsonb, images text[], created_at timestamptz,
               total_count bigint, retail_price_cop integer, retail_effective_price_cop integer)
language sql stable security definer set search_path = '' as $function$
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
$function$;

create or replace function public.collection_covers_wholesale() returns table (category_id uuid, image text, product_count integer)
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
