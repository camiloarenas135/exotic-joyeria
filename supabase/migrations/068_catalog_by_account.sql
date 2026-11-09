-- 068: el catálogo mayorista se entrega según el TIPO de cuenta de quien consulta (Fase 2). Requiere 065 y 066.
-- catalog_core mantiene su firma y sigue recibiendo p_channel = 'retail' | 'wholesale' (el front no amplía `Channel`): 'wholesale' sirve a las
-- cuentas aprobadas de CUALQUIER tipo, pero con la lista de precios de la cuenta (public.my_account_type()). Como la función es SECURITY DEFINER
-- y no pasa por RLS, el filtro por lista se aplica aquí de forma explícita: sin sesión aprobada no hay filas.
-- Con `variant_stock_mode` encendido, en canal mayorista el stock del producto es la suma de sus variantes CON precio visible en esa lista
-- y `p_in_stock` filtra por ese valor; apagado, se usa products.stock como siempre. El detal no cambia (products.stock ya es la suma en modo encendido).
-- Cada variante del canal mayorista conserva sus claves `id` y `stock` de la caché.
-- Rollback: 068_catalog_by_account.rollback.sql
set local lock_timeout = '3s';

create or replace function private.catalog_core(
  p_channel text, p_category uuid, p_search text, p_sort text, p_in_stock boolean, p_promo_only boolean,
  p_min integer, p_max integer, p_limit integer, p_offset integer, p_id uuid)
returns table (id uuid, name text, price text, price_cop integer, effective_price_cop integer, promo_kind text, promo_value integer,
               category text, category_id uuid, stock integer, description text, variants jsonb, images text[], created_at timestamptz,
               total_count bigint, retail_price_cop integer, retail_effective_price_cop integer)
language sql stable security definer set search_path = '' as $function$
  with me as (
    select case when p_channel = 'wholesale' then public.my_account_type() end as lst,
           (p_channel = 'wholesale' and private.variant_stock_on()) as by_variant
  ),
  base as (
    select p.*, bp.kind as bp_kind, bp.value as bp_value, me.lst,
           coalesce(bp.final_price, p.price_cop) as retail_eff,
           case when p_channel = 'wholesale' then wp.wprice else coalesce(bp.final_price, p.price_cop) end as eff,
           case when me.by_variant and jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0 then
             (select coalesce(sum(case when (e ->> 'stock') ~ '^[0-9]+$' then (e ->> 'stock')::integer else 0 end), 0)::integer
                from jsonb_array_elements(p.variants) e
                join public.wholesale_prices w on w.product_id = p.id and w.variant_name = e ->> 'name' and w.is_visible and w.price_list = me.lst)
           else p.stock end as vstock
    from public.products p
    cross join me
    left join lateral public.best_promo(p.id, p.price_cop) bp on true
    left join lateral (select private.wholesale_product_price(p.id, me.lst) as wprice where p_channel = 'wholesale') wp on true
    where p_channel in ('retail', 'wholesale')
      and (p_channel = 'retail' or me.lst is not null)
      and (p_channel = 'retail' or wp.wprice is not null)
      and (p_id is null or p.id = p_id)
      and (p_category is null or p.category_id = p_category)
      and (p_search is null or p.name ilike '%' || replace(replace(p_search,'%',''),'_','') || '%')
      and (not p_in_stock or coalesce(case when me.by_variant and jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0 then
             (select coalesce(sum(case when (e ->> 'stock') ~ '^[0-9]+$' then (e ->> 'stock')::integer else 0 end), 0)::integer
                from jsonb_array_elements(p.variants) e
                join public.wholesale_prices w on w.product_id = p.id and w.variant_name = e ->> 'name' and w.is_visible and w.price_list = me.lst)
           else p.stock end, 0) > 0)
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
         pg.category, pg.category_id, pg.vstock, pg.description,
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
               on w.product_id = pg.id and w.variant_name = v.e ->> 'name' and w.is_visible and w.price_list = pg.lst
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
  with me as (select public.my_account_type() as lst)
  select c.id, coalesce(nullif(btrim(c.image), ''), p.images[1]), n.cnt
  from me
  cross join public.categories c
  cross join lateral (select count(*)::integer as cnt from public.products pr
                      where pr.category_id = c.id and private.wholesale_eligible(pr.id, me.lst)) n
  left join lateral (
    select pr.images from public.products pr
    where pr.category_id = c.id and private.wholesale_eligible(pr.id, me.lst) and coalesce(array_length(pr.images, 1), 0) > 0
    order by (coalesce(pr.stock, 0) > 0) desc, pr.created_at desc, pr.id
    limit 1) p on true
  where c.is_active and n.cnt > 0 and me.lst is not null;
$$;
