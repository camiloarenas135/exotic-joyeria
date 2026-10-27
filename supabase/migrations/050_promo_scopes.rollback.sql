-- Rollback de 050. ADVERTENCIA: borra las promociones de colección y de tienda.
-- Primero restaurar best_promo (los cuerpos SQL no registran dependencias de columnas).
create or replace function public.best_promo(p_product uuid, p_base integer)
returns table (kind text, value integer, final_price integer)
language sql stable set search_path = '' as $$
  select pr.kind, pr.value, public.apply_discount(p_base, pr.kind, pr.value) as final_price
  from public.promotions pr
  where pr.product_id = p_product and pr.is_active and pr.starts_at <= now() and pr.ends_at > now()
  order by public.apply_discount(p_base, pr.kind, pr.value) asc
  limit 1;
$$;

delete from public.promotions where scope <> 'product';
alter table public.promotions drop constraint if exists promotions_scope_chk;
alter table public.promotions drop constraint if exists promotions_scope_values;
drop index if exists public.promotions_category_idx;
alter table public.promotions alter column product_id set not null;
alter table public.promotions drop column if exists category_id;
alter table public.promotions drop column if exists scope;

alter table public.hero_slides drop constraint if exists hero_slides_link_ref_chk;
alter table public.hero_slides drop constraint if exists hero_slides_link_type_values;
alter table public.hero_slides drop column if exists link_ref;
alter table public.hero_slides drop column if exists link_type;
alter table public.hero_slides drop constraint if exists hero_slides_link_check;
alter table public.hero_slides add constraint hero_slides_link_check
  check (link is null or link ~ '^(/[A-Za-z0-9/_?=&#.%-]*|https://[^[:space:]]+)$');
