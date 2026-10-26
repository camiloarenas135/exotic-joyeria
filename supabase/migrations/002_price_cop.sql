-- 002_price_cop: precio numérico (COP enteros). Se conserva `price` texto hasta F7.
alter table public.products add column if not exists price_cop integer;

update public.products
set price_cop = nullif(regexp_replace(price, '\D', '', 'g'), '')::integer
where price_cop is null;

-- variantes: agrega price_cop dentro de cada objeto del JSON
update public.products p
set variants = (
  select coalesce(jsonb_agg(
    v || jsonb_build_object('price_cop', nullif(regexp_replace(coalesce(v->>'price',''), '\D', '', 'g'), '')::integer)
  ), '[]'::jsonb)
  from jsonb_array_elements(p.variants) v
)
where jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0;

create index if not exists products_price_cop_idx on public.products (price_cop, id);
