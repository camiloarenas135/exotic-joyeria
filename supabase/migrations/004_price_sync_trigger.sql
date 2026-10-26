-- 004: mantiene price_cop sincronizado mientras el admin siga escribiendo `price` en texto.
-- Rollback: drop trigger products_sync_price_trg on public.products; drop function public.products_sync_price();
create or replace function public.products_sync_price()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.price is not null then
    new.price_cop := nullif(regexp_replace(new.price, '\D', '', 'g'), '')::integer;
  end if;
  if jsonb_typeof(new.variants) = 'array' and jsonb_array_length(new.variants) > 0 then
    new.variants := (
      select coalesce(jsonb_agg(
        v || jsonb_build_object('price_cop', nullif(regexp_replace(coalesce(v->>'price',''), '\D', '', 'g'), '')::integer)
      ), '[]'::jsonb) from jsonb_array_elements(new.variants) v);
  end if;
  return new;
end $$;
drop trigger if exists products_sync_price_trg on public.products;
create trigger products_sync_price_trg before insert or update of price, variants on public.products
  for each row execute function public.products_sync_price();
