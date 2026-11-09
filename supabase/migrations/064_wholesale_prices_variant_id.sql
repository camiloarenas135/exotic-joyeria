-- 064: el precio mayorista de una variante se enlaza por id, no solo por nombre (Fase 1). ADITIVA.
-- Antes: renombrar una variante dejaba huérfano su precio mayorista (se casaba por `variant_name`). Ahora `variant_id` lo ata a la variante y
-- un trigger mantiene `variant_name` como ESPEJO del nombre actual, de modo que las funciones existentes (que comparan por nombre) siguen igual.
--   · `wholesale_prices_link` (BEFORE INSERT/UPDATE): completa variant_id desde (producto, nombre) o, si ya hay variant_id, refresca el nombre.
--   · `product_variants_rename` (AFTER UPDATE OF name): propaga el renombre al espejo.
-- admin_upsert_wholesale_prices NO cambia: sigue mandando variant_name y el trigger resuelve el id.
-- Rollback: 064_wholesale_prices_variant_id.rollback.sql
set local lock_timeout = '3s';

alter table public.wholesale_prices add column variant_id uuid references public.product_variants(id) on delete cascade;

update public.wholesale_prices w set variant_id = pv.id
  from public.product_variants pv
 where w.variant_name is not null and w.variant_id is null and pv.product_id = w.product_id and pv.name = w.variant_name;

create unique index wholesale_prices_variant_uq on public.wholesale_prices (variant_id) where variant_id is not null;

create or replace function private.wholesale_prices_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.variant_id is not null then
    select pv.name into v_name from public.product_variants pv where pv.id = new.variant_id and pv.product_id = new.product_id;
    if v_name is null then raise exception 'VARIANT_NOT_FOUND'; end if;
    new.variant_name := v_name;
  elsif new.variant_name is not null then
    select pv.id into new.variant_id from public.product_variants pv where pv.product_id = new.product_id and pv.name = new.variant_name;
  end if;
  return new;
end $$;
revoke all on function private.wholesale_prices_link() from public, anon, authenticated;

create trigger wholesale_prices_link_trg
  before insert or update on public.wholesale_prices
  for each row execute function private.wholesale_prices_link();

create or replace function private.product_variants_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.wholesale_prices set variant_name = new.name where variant_id = new.id and variant_name is distinct from new.name;
  return null;
end $$;
revoke all on function private.product_variants_rename() from public, anon, authenticated;

create trigger product_variants_rename_trg
  after update of name on public.product_variants
  for each row when (old.name is distinct from new.name)
  execute function private.product_variants_rename();
