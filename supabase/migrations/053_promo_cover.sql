-- 053: portada de la burbuja "Promociones". Una fila: foto del producto en promoción con mayor % de descuento
-- (con stock primero, luego el más reciente) + % máximo, cantidad y cuándo vence la primera promo vigente.
-- Sin promociones vigentes devuelve 0 filas. Usa best_promo: mismo criterio que /promociones y create_order.
-- Rollback: 053_promo_cover.rollback.sql
create or replace function public.promo_cover()
returns table (image text, product_name text, max_discount_pct integer, promo_count integer, valid_until timestamptz)
language sql stable set search_path = '' as $$
  with act as (
    select pr.ends_at from public.promotions pr
    where pr.is_active and pr.starts_at <= now() and pr.ends_at > now()
  ),
  cand as (
    select p.id, p.name, p.images[1] as image, p.created_at, (coalesce(p.stock,0) > 0) as in_stock,
           round(100.0 * (p.price_cop - bp.final_price) / p.price_cop)::int as pct
    from public.products p
    cross join lateral public.best_promo(p.id, p.price_cop) bp
    where exists (select 1 from act) and p.price_cop > 0 and nullif(btrim(p.images[1]), '') is not null
  ),
  top as (select * from cand order by in_stock desc, pct desc, created_at desc, id limit 1)
  select t.image, t.name, (select max(c.pct) from cand c), (select count(*)::int from cand c), (select min(a.ends_at) from act a)
  from top t;
$$;
grant execute on function public.promo_cover() to anon, authenticated;
