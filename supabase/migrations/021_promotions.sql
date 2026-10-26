-- 021: promociones manuales (solo detal, sin códigos). No tocan el precio guardado.
-- Rollback: drop function catalog_retail, best_promo, apply_discount; drop table promotions;
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('percent','fixed')),
  value integer not null check (value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'percent' or value <= 90)
);
create index if not exists promotions_product_idx on public.promotions (product_id);
alter table public.promotions enable row level security;
create policy promotions_select_public on public.promotions for select
  using (is_active and starts_at <= now() and ends_at > now());
create policy promotions_admin_all on public.promotions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.apply_discount(p_base integer, p_kind text, p_value integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_kind
    when 'percent' then p_base - floor(p_base::numeric * p_value / 100)::integer
    when 'fixed' then greatest(p_base - p_value, 0)
    else p_base end;
$$;

-- mejor promoción vigente de un producto para un precio base
create or replace function public.best_promo(p_product uuid, p_base integer)
returns table (kind text, value integer, final_price integer)
language sql stable set search_path = '' as $$
  select pr.kind, pr.value, public.apply_discount(p_base, pr.kind, pr.value) as final_price
  from public.promotions pr
  where pr.product_id = p_product and pr.is_active and pr.starts_at <= now() and pr.ends_at > now()
  order by public.apply_discount(p_base, pr.kind, pr.value) asc
  limit 1;
$$;

-- catálogo al detal, ordenado y paginado en el servidor por precio efectivo
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
