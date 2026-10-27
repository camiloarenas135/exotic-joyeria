-- 052: portada de cada colección. Si el admin puso `categories.image` se respeta; si no, se usa la primera
-- foto del producto más reciente de la colección (con stock si hay, si no cualquiera con foto).
-- Rollback: drop function public.collection_covers();
create or replace function public.collection_covers()
returns table (category_id uuid, image text)
language sql stable set search_path = '' as $$
  select c.id, coalesce(nullif(btrim(c.image), ''), p.images[1])
  from public.categories c
  left join lateral (
    select pr.images
    from public.products pr
    where pr.category_id = c.id and coalesce(array_length(pr.images, 1), 0) > 0
    order by (coalesce(pr.stock, 0) > 0) desc, pr.created_at desc, pr.id
    limit 1
  ) p on true
  where c.is_active;
$$;
grant execute on function public.collection_covers() to anon, authenticated;
