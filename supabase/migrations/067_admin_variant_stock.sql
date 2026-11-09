-- 067: RPC de stock por variante e interruptor (Fase 1). ADITIVA: ninguna función existente cambia; el modo sigue 'off'.
--   · admin_set_stock(variante, nuevo, esperado): única vía para escribir stock por variante. Control optimista: si `p_expected` no coincide
--     con el stock actual falla con STOCK_CHANGED:<actual> (otro admin o un pedido confirmado lo cambió). Orden de bloqueo: producto → variante.
--   · admin_variant_stock_list(...): productos con variantes, su stock por variante, la suma y si hay que revisar el reparto.
--   · admin_enable_variant_stock(force): informa diferencias (suma ≠ products.stock, pedidos pendientes sin variante) y NO enciende si las hay,
--     salvo force=true. Al encender, products.stock pasa a ser la suma de sus variantes.
--   · admin_disable_variant_stock(): rollback instantáneo; products.stock conserva la suma y vuelve a mandar.
-- Rollback: 067_admin_variant_stock.rollback.sql
set local lock_timeout = '3s';

create or replace function public.admin_set_stock(p_variant uuid, p_stock integer, p_expected integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pid uuid; v_var record; v_total integer;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_stock is null or p_stock < 0 or p_stock > 1000000 then raise exception 'INVALID_STOCK'; end if;
  select pv.product_id into v_pid from public.product_variants pv where pv.id = p_variant;
  if v_pid is null then raise exception 'VARIANT_NOT_FOUND'; end if;
  perform 1 from public.products where id = v_pid for update;                       -- 1º producto
  select pv.id, pv.name, pv.stock into v_var from public.product_variants pv where pv.id = p_variant for update;  -- 2º variante
  if not found then raise exception 'VARIANT_NOT_FOUND'; end if;
  if p_expected is not null and v_var.stock <> p_expected then raise exception 'STOCK_CHANGED:%', v_var.stock; end if;
  update public.product_variants set stock = p_stock where id = p_variant;
  perform private.variants_cache_rebuild(v_pid);
  select p.stock into v_total from public.products p where p.id = v_pid;
  return jsonb_build_object('variant_id', p_variant, 'name', v_var.name, 'previous', v_var.stock, 'stock', p_stock, 'product_stock', v_total);
end $$;

create or replace function public.admin_variant_stock_list(p_search text default null, p_only_review boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(t.rec order by t.name), '[]'::jsonb) into v_out from (
    select p.name,
           jsonb_build_object(
             'product_id', p.id, 'name', p.name, 'product_stock', coalesce(p.stock, 0),
             'snapshot', p.stock_legacy_snapshot, 'variants_sum', s.total,
             'needs_review', s.total <> coalesce(p.stock, 0),
             'variants', s.vars) as rec
      from public.products p
      join lateral (
        select coalesce(sum(pv.stock), 0)::integer as total,
               jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'stock', pv.stock, 'price_cop', pv.price_cop) order by pv.position, pv.id) as vars
          from public.product_variants pv where pv.product_id = p.id and pv.active
      ) s on s.vars is not null
     where (p_search is null or btrim(p_search) = '' or p.name ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%')
       and (not p_only_review or s.total <> coalesce(p.stock, 0))
  ) t;
  return v_out;
end $$;

-- pedidos pendientes con líneas sin variante en productos con variantes (fallarían al confirmar con stock por variante)
create or replace function private.legacy_variant_orders() returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct o.id)::integer
    from public.orders o
    join lateral private.order_stock_lines(o.id) s on true
   where o.status = 'pending'
     and exists (select 1 from public.product_variants pv where pv.product_id = s.product_id)
     and not exists (select 1 from public.order_lines l where l.order_id = o.id and l.product_id = s.product_id and l.variant_name is not null)
     and not exists (select 1 from public.orders o2, jsonb_array_elements(case when jsonb_typeof(o2.items) = 'array' then o2.items else '[]'::jsonb end) i
                      where o2.id = o.id and (i ->> 'id') = s.product_id::text and nullif(i -> 'selectedVariant' ->> 'name', '') is not null);
$$;
revoke all on function private.legacy_variant_orders() from public, anon, authenticated;

create or replace function public.admin_enable_variant_stock(p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_diffs jsonb; v_legacy integer;
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.settings where key = 'variant_stock_mode' for update;
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'product_stock', coalesce(p.stock, 0), 'variants_sum', s.total) order by p.name), '[]'::jsonb)
    into v_diffs
    from public.products p
    join lateral (select coalesce(sum(pv.stock), 0)::integer as total from public.product_variants pv where pv.product_id = p.id and pv.active) s on true
   where exists (select 1 from public.product_variants pv where pv.product_id = p.id) and s.total <> coalesce(p.stock, 0);
  v_legacy := private.legacy_variant_orders();

  if (jsonb_array_length(v_diffs) > 0 or v_legacy > 0) and not coalesce(p_force, false) then
    return jsonb_build_object('enabled', false, 'differences', v_diffs, 'legacy_pending_orders', v_legacy);
  end if;

  insert into public.settings (key, value) values ('variant_stock_mode', '"on"'::jsonb)
    on conflict (key) do update set value = excluded.value;
  -- products.stock = suma de variantes (la reconstrucción lo hace ahora que el modo está encendido)
  perform private.variants_cache_rebuild(x.product_id) from (select distinct product_id from public.product_variants) x;
  return jsonb_build_object('enabled', true, 'differences', v_diffs, 'legacy_pending_orders', v_legacy);
end $$;

create or replace function public.admin_disable_variant_stock() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  insert into public.settings (key, value) values ('variant_stock_mode', '"off"'::jsonb)
    on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('enabled', false);
end $$;

revoke execute on function public.admin_set_stock(uuid, integer, integer) from public, anon;
revoke execute on function public.admin_variant_stock_list(text, boolean) from public, anon;
revoke execute on function public.admin_enable_variant_stock(boolean) from public, anon;
revoke execute on function public.admin_disable_variant_stock() from public, anon;
grant execute on function public.admin_set_stock(uuid, integer, integer) to authenticated;
grant execute on function public.admin_variant_stock_list(text, boolean) to authenticated;
grant execute on function public.admin_enable_variant_stock(boolean) to authenticated;
grant execute on function public.admin_disable_variant_stock() to authenticated;
