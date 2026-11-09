-- Rollback de 064. `variant_name` nunca dejó de ser válido, así que basta quitar triggers, índice y columna.
set local lock_timeout = '3s';

drop trigger if exists product_variants_rename_trg on public.product_variants;
drop trigger if exists wholesale_prices_link_trg on public.wholesale_prices;
drop function if exists private.product_variants_rename();
drop function if exists private.wholesale_prices_link();
drop index if exists public.wholesale_prices_variant_uq;
alter table public.wholesale_prices drop column if exists variant_id;
