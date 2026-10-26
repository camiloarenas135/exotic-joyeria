-- 030: zona mayorista. Rollback: drop trigger on auth.users, functions, tables wholesale_prices y wholesalers.
create table if not exists public.wholesalers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  business_name text,
  phone text,
  city text,
  tax_id text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.wholesalers enable row level security;
revoke insert, update, delete on public.wholesalers from anon, authenticated;
create policy wholesalers_select_own on public.wholesalers for select to authenticated
  using (user_id = (select auth.uid()));
create policy wholesalers_select_admin on public.wholesalers for select to authenticated
  using ((select public.is_admin()));

-- crea la fila pendiente al registrarse como mayorista
create or replace function public.handle_new_wholesaler()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data ->> 'signup_type' = 'wholesale' then
    insert into public.wholesalers (user_id, email, business_name, phone, city, tax_id)
    values (
      new.id, new.email,
      left(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 120),
      left(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 30),
      left(btrim(coalesce(new.raw_user_meta_data ->> 'city', '')), 80),
      nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'tax_id', '')), 30), ''))
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_wholesaler() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_wholesaler on auth.users;
create trigger on_auth_user_created_wholesaler after insert on auth.users
  for each row execute function public.handle_new_wholesaler();

create or replace function public.is_approved_wholesaler()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wholesalers w
                 where w.user_id = (select auth.uid()) and w.status = 'approved');
$$;
grant execute on function public.is_approved_wholesaler() to anon, authenticated;

create table if not exists public.wholesale_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text null,
  price_cop integer not null check (price_cop > 0),
  is_visible boolean not null default true
);
create unique index if not exists wholesale_prices_uniq on public.wholesale_prices (product_id, coalesce(variant_name, ''));
alter table public.wholesale_prices enable row level security;
revoke all on public.wholesale_prices from anon;
create policy wholesale_prices_select_approved on public.wholesale_prices for select to authenticated
  using (is_visible and (select public.is_approved_wholesaler()));
create policy wholesale_prices_admin_all on public.wholesale_prices for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- catálogo mayorista: solo aprobados (las políticas RLS se aplican al invocador)
create or replace function public.wholesale_catalog()
returns table (id uuid, name text, category text, category_id uuid, stock integer, description text,
               images text[], wholesale_price_cop integer, wholesale_variants jsonb)
language sql stable set search_path = '' as $$
  select p.id, p.name, p.category, p.category_id, p.stock, p.description, p.images,
         (select w.price_cop from public.wholesale_prices w where w.product_id = p.id and w.variant_name is null),
         coalesce((select jsonb_agg(jsonb_build_object('name', w.variant_name, 'price_cop', w.price_cop) order by w.price_cop)
                   from public.wholesale_prices w where w.product_id = p.id and w.variant_name is not null), '[]'::jsonb)
  from public.products p
  where exists (select 1 from public.wholesale_prices w where w.product_id = p.id)
  order by coalesce((select min(w.price_cop) from public.wholesale_prices w where w.product_id = p.id), 0) asc, p.id asc;
$$;
revoke execute on function public.wholesale_catalog() from public, anon;
grant execute on function public.wholesale_catalog() to authenticated;

create or replace function public.set_wholesaler_status(p_user uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('pending','approved','rejected','suspended') then raise exception 'INVALID_STATUS'; end if;
  update public.wholesalers
  set status = p_status, notes = left(p_notes, 500), reviewed_by = (select auth.uid()), reviewed_at = now()
  where user_id = p_user;
end $$;
revoke execute on function public.set_wholesaler_status(uuid,text,text) from public, anon;
grant execute on function public.set_wholesaler_status(uuid,text,text) to authenticated;
