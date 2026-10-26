-- 010: categorías de un solo nivel, administrables.
-- Rollback: drop function reorder_categories; drop trigger products_sync_category_trg; alter table products drop column category_id; drop table categories;
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  image text null,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy categories_select_public on public.categories for select using (is_active);
create policy categories_admin_all on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.categories (slug, name, sort_order) values
 ('anillos','Anillos',1),('cadenas','Cadenas',2),('candongas','Candongas',3),('exclusivo','Exclusivo',4),
 ('pulseras','Pulseras',5),('pulseras-tejidas','Pulseras Tejidas',6),('relojes','Relojes',7),('tobilleras','Tobilleras',8),
 ('topos-broche','Topos Broche',9),('topos-rosca','Topos Rosca',10),('dijes','Dijes',11),('insumos','Insumos',12),
 ('rodio','Rodio',13),('plata-ley-925','Plata Ley 925',14),('bebes','Bebés',15)
on conflict (slug) do nothing;

alter table public.products add column if not exists category_id uuid references public.categories(id) on delete restrict;
update public.products p set category_id = c.id from public.categories c where p.category_id is null and c.name = p.category;
create index if not exists products_category_price_idx on public.products (category_id, price_cop, id);

-- mientras el admin escriba `category` (texto), se deriva category_id; si viene category_id, manda este
create or replace function public.products_sync_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.category is distinct from old.category
     and new.category_id is not distinct from old.category_id then
    new.category_id := null;  -- cambió solo el texto: se re-deriva
  end if;
  if new.category_id is null and new.category is not null then
    select id into new.category_id from public.categories where name = new.category;
  elsif new.category_id is not null then
    select name into new.category from public.categories where id = new.category_id;
  end if;
  return new;
end $$;
drop trigger if exists products_sync_category_trg on public.products;
create trigger products_sync_category_trg before insert or update of category, category_id on public.products
  for each row execute function public.products_sync_category();

create or replace function public.reorder_categories(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  update public.categories c set sort_order = t.ord
  from unnest(p_ids) with ordinality as t(id, ord) where c.id = t.id;
end $$;
revoke execute on function public.reorder_categories(uuid[]) from public, anon;
grant execute on function public.reorder_categories(uuid[]) to authenticated;
