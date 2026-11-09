-- 063: variantes con id estable y stock propio (Fase 1 del PLAN-EMPRENDEDOR-MAYORISTA). ADITIVA: con `variant_stock_mode` apagado
-- (valor inicial) el sitio se comporta igual: `products.stock` sigue mandando y el front viejo no nota nada.
--
-- Qué hace
--   · Tabla `product_variants` (id, nombre, precio, stock, posición). Solo el admin la lee; nadie escribe directo (RPC / triggers SECURITY DEFINER).
--   · `products.variants` (jsonb) pasa a ser una CACHÉ DE LECTURA con {id, name, price, price_cop, stock}. La regenera `private.variants_cache_rebuild`.
--   · Trigger AFTER sobre `products`: cuando el admin guarda un producto (AdminCatalog reenvía las variantes SIN id, solo {name, price}) se
--     reconcilia con la tabla casando por id y, si no hay, por nombre; un único renombre se detecta (1 variante nueva + 1 desaparecida) y
--     conserva stock y precio. Así guardar un producto NUNCA pisa el stock por variante.
--   · Reparto inicial del stock: la primera vez que un producto tiene variantes, floor(stock/n) a cada una y el resto a las primeras por posición.
--     La suma conserva `products.stock`. Es solo un punto de partida: el cliente lo revisa antes de encender el modo (067).
--   · `products.stock_legacy_snapshot`: foto del stock de cada producto con variantes en el momento del backfill.
--   · `order_lines.variant_id`, interruptor `settings.variant_stock_mode` = 'off'.
-- Rollback: 063_product_variants.rollback.sql
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------------------------------------------- tabla
create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  price_text  text,
  price_cop   integer,
  stock       integer not null default 0,
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint product_variants_name_chk  check (name <> '' and name = btrim(name)),
  constraint product_variants_price_chk check (price_cop is null or price_cop > 0),
  constraint product_variants_stock_chk check (stock >= 0)
);
create unique index product_variants_product_name_uq on public.product_variants (product_id, lower(name));
create index product_variants_product_idx on public.product_variants (product_id, position);

alter table public.product_variants enable row level security;
revoke all on public.product_variants from anon, authenticated;
grant select on public.product_variants to authenticated;
create policy product_variants_admin_select on public.product_variants
  for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------------------------------------------ columnas e interruptor
alter table public.products    add column stock_legacy_snapshot integer;
alter table public.order_lines add column variant_id uuid references public.product_variants(id) on delete set null;
create index order_lines_variant_idx on public.order_lines (variant_id) where variant_id is not null;

insert into public.settings (key, value) values ('variant_stock_mode', '"off"'::jsonb) on conflict (key) do nothing;

create or replace function private.variant_stock_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.settings where key = 'variant_stock_mode'), 'off') = 'on';
$$;
revoke all on function private.variant_stock_on() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ caché de lectura
-- Reescribe products.variants desde la tabla (con id y stock) y, si el modo está encendido, products.stock = suma de variantes.
-- La bandera `app.variants_rebuild` evita que el trigger de reconciliación se dispare con esta misma escritura.
create or replace function private.variants_cache_rebuild(p_product uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cache jsonb; v_sum integer; v_n integer; v_on boolean := private.variant_stock_on();
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'name', v.name, 'price', coalesce(v.price_text, v.price_cop::text, ''),
           'price_cop', v.price_cop, 'stock', v.stock) order by v.position, v.created_at, v.id), '[]'::jsonb),
         coalesce(sum(v.stock), 0)::integer, count(*)::integer
    into v_cache, v_sum, v_n
    from public.product_variants v where v.product_id = p_product and v.active;
  if v_n = 0 then return; end if;
  perform set_config('app.variants_rebuild', '1', true);
  update public.products p
     set variants = v_cache, stock = case when v_on then v_sum else p.stock end
   where p.id = p_product and (p.variants is distinct from v_cache or (v_on and p.stock is distinct from v_sum));
  perform set_config('app.variants_rebuild', '', true);
end $$;
revoke all on function private.variants_cache_rebuild(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ reconciliación
create or replace function private.variants_reconcile_product(p_product uuid, p_variants jsonb, p_stock integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb := '[]'::jsonb; v_claimed uuid[] := '{}'; v_existing uuid[]; v_left uuid[]; v_names text[] := '{}';
  e jsonb; it jsonb; n integer := 0; v_name text; v_ptxt text; v_pcop integer; v_id uuid; v_raw_id text;
  v_first boolean; v_unmatched integer; v_new_count integer; v_new_i integer := 0; v_stock integer := greatest(coalesce(p_stock, 0), 0);
begin
  select coalesce(array_agg(pv.id), '{}') into v_existing from public.product_variants pv where pv.product_id = p_product;
  v_first := coalesce(array_length(v_existing, 1), 0) = 0;

  if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) = 0 then
    delete from public.product_variants where product_id = p_product;
    return;
  end if;

  -- 1) lee las variantes que llegan y las casa con las existentes: por id y, si no, por nombre
  for e in select * from jsonb_array_elements(p_variants) loop
    v_name := btrim(coalesce(e ->> 'name', ''));
    if v_name = '' then continue; end if;
    if lower(v_name) = any (v_names) then raise exception 'DUPLICATE_VARIANT:%', v_name; end if;
    v_names := v_names || lower(v_name);
    n := n + 1;
    v_ptxt := nullif(btrim(coalesce(e ->> 'price', '')), '');
    v_pcop := case when (e ->> 'price_cop') ~ '^[0-9]{1,9}$' and (e ->> 'price_cop')::bigint between 1 and 2147483647
                   then (e ->> 'price_cop')::integer end;
    v_id := null;
    v_raw_id := e ->> 'id';
    if v_raw_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select pv.id into v_id from public.product_variants pv
       where pv.id = v_raw_id::uuid and pv.product_id = p_product and not (pv.id = any (v_claimed));
    end if;
    if v_id is null then
      select pv.id into v_id from public.product_variants pv
       where pv.product_id = p_product and lower(pv.name) = lower(v_name) and not (pv.id = any (v_claimed));
    end if;
    if v_id is not null then v_claimed := v_claimed || v_id; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('pos', n, 'name', v_name, 'ptxt', v_ptxt, 'pcop', v_pcop, 'id', v_id));
  end loop;

  -- 2) renombre: exactamente 1 variante nueva y exactamente 1 existente que desapareció = es la misma (conserva stock y precio mayorista)
  select coalesce(array_agg(x), '{}') into v_left from unnest(v_existing) x where not (x = any (v_claimed));
  select count(*)::integer into v_unmatched from jsonb_array_elements(v_items) t where (t ->> 'id') is null;
  if coalesce(array_length(v_left, 1), 0) = 1 and v_unmatched = 1 then
    select jsonb_agg(case when (t.it ->> 'id') is null then t.it || jsonb_build_object('id', v_left[1]) else t.it end order by t.ord)
      into v_items from jsonb_array_elements(v_items) with ordinality t(it, ord);
    v_left := '{}';
  end if;

  -- 3) borra las que ya no están, actualiza las casadas, inserta las nuevas
  delete from public.product_variants where product_id = p_product and id = any (v_left);
  select count(*)::integer into v_new_count from jsonb_array_elements(v_items) t where (t ->> 'id') is null;
  for it in select value from jsonb_array_elements(v_items) loop
    if (it ->> 'id') is not null then
      update public.product_variants
         set name = it ->> 'name', price_text = it ->> 'ptxt', price_cop = (it ->> 'pcop')::integer, position = (it ->> 'pos')::integer
       where id = (it ->> 'id')::uuid;
    else
      insert into public.product_variants (product_id, name, price_text, price_cop, position, stock)
      values (p_product, it ->> 'name', it ->> 'ptxt', (it ->> 'pcop')::integer, (it ->> 'pos')::integer,
              case when v_first then v_stock / v_new_count + case when v_new_i < v_stock % v_new_count then 1 else 0 end else 0 end);
      v_new_i := v_new_i + 1;
    end if;
  end loop;

  perform private.variants_cache_rebuild(p_product);
end $$;
revoke all on function private.variants_reconcile_product(uuid, jsonb, integer) from public, anon, authenticated;

create or replace function private.products_variants_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.variants_rebuild', true), '') = '1' then return null; end if;
  if tg_op = 'UPDATE' and new.variants is not distinct from old.variants then return null; end if;
  perform private.variants_reconcile_product(new.id, new.variants, new.stock);
  return null;
end $$;
revoke all on function private.products_variants_trg() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------- backfill
do $$
declare r record;
begin
  for r in select id, variants, stock from public.products where jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) > 0 loop
    perform private.variants_reconcile_product(r.id, r.variants, r.stock);
  end loop;
end $$;

update public.products p set stock_legacy_snapshot = p.stock
 where exists (select 1 from public.product_variants pv where pv.product_id = p.id);

update public.order_lines l set variant_id = pv.id
  from public.product_variants pv
 where l.variant_id is null and l.variant_name is not null and pv.product_id = l.product_id and lower(pv.name) = lower(l.variant_name);

-- el trigger se crea al final: el backfill ya reconcilió todo
create trigger products_variants_reconcile_trg
  after insert or update of variants on public.products
  for each row execute function private.products_variants_trg();
