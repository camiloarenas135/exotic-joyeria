-- 050: promociones por alcance (producto / colección / toda la tienda) y destinos tipados en banners.
-- Aditiva: las filas existentes quedan como scope='product'. Solo detal; el precio mayorista nunca pasa por best_promo.
-- Rollback: 050_promo_scopes.rollback.sql
set local lock_timeout = '3s';

-- 1) promotions: alcance
alter table public.promotions add column if not exists scope text not null default 'product';
alter table public.promotions add column if not exists category_id uuid references public.categories(id) on delete cascade;
alter table public.promotions alter column product_id drop not null;
alter table public.promotions add constraint promotions_scope_values check (scope in ('product','category','store'));
alter table public.promotions add constraint promotions_scope_chk check (
  (scope = 'product'  and product_id is not null and category_id is null) or
  (scope = 'category' and category_id is not null and product_id is null) or
  (scope = 'store'    and product_id is null and category_id is null)
) not valid;
alter table public.promotions validate constraint promotions_scope_chk;
create index if not exists promotions_category_idx on public.promotions (category_id) where category_id is not null;

-- 2) best_promo: misma firma. Mejor de los tres alcances, sin acumular; nunca deja el precio en 0
--    ni muestra una promoción sin descuento real; desempate fijo (producto > colección > tienda > id).
create or replace function public.best_promo(p_product uuid, p_base integer)
returns table (kind text, value integer, final_price integer)
language sql stable set search_path = '' as $$
  select pr.kind, pr.value, public.apply_discount(p_base, pr.kind, pr.value) as final_price
  from public.promotions pr
  where pr.is_active and pr.starts_at <= now() and pr.ends_at > now()
    and (pr.product_id = p_product
         or pr.scope = 'store'
         or pr.category_id = (select p.category_id from public.products p where p.id = p_product))
    and public.apply_discount(p_base, pr.kind, pr.value) > 0
    and public.apply_discount(p_base, pr.kind, pr.value) < p_base
  order by public.apply_discount(p_base, pr.kind, pr.value) asc,
           case pr.scope when 'product' then 0 when 'category' then 1 else 2 end,
           pr.id
  limit 1;
$$;

-- 3) hero_slides: destino tipado. Los banners viejos conservan `link` (link_type nulo).
alter table public.hero_slides add column if not exists link_type text;
alter table public.hero_slides add column if not exists link_ref text;
alter table public.hero_slides add constraint hero_slides_link_type_values check (
  link_type is null or link_type in ('home','catalog','collection','product','promos','wholesale','entrepreneur','external'));
alter table public.hero_slides add constraint hero_slides_link_ref_chk check (
  (link_type is null and link_ref is null) or
  (link_type in ('collection','product') and link_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or
  (link_type = 'external' and link_ref ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]<>"''\\]*)?$') or
  (link_type in ('home','catalog','promos','wholesale','entrepreneur') and link_ref is null));

-- `link` de texto: más estricto (sin // inicial, sin .., sin usuario@ en enlaces externos)
alter table public.hero_slides drop constraint if exists hero_slides_link_check;
alter table public.hero_slides add constraint hero_slides_link_check check (
  link is null or (
    link !~ '\.\.' and (
      link ~ '^/([A-Za-z0-9_%.-][A-Za-z0-9/_?=&#.%-]*)?$' or
      link ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]<>"''\\]*)?$')));
