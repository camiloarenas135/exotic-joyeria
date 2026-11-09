-- Rollback de 063. Revierte las variantes a su forma original en products.variants (solo {name, price, price_cop}) y borra la tabla.
-- Aplicar los rollbacks en orden inverso: 070, 069, 067, 064 y por último este.
set local lock_timeout = '3s';

drop trigger if exists products_variants_reconcile_trg on public.products;

-- quita id y stock de la caché; sync_price vuelve a calcular price_cop desde `price`
update public.products
   set variants = (select coalesce(jsonb_agg(v - 'id' - 'stock'), '[]'::jsonb) from jsonb_array_elements(variants) v)
 where jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) > 0;

drop index if exists public.order_lines_variant_idx;
alter table public.order_lines drop column if exists variant_id;
alter table public.products drop column if exists stock_legacy_snapshot;

drop function if exists private.products_variants_trg();
drop function if exists private.variants_reconcile_product(uuid, jsonb, integer);
drop function if exists private.variants_cache_rebuild(uuid);
drop function if exists private.variant_stock_on();
drop table if exists public.product_variants;
delete from public.settings where key = 'variant_stock_mode';
