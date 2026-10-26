-- 003_settings_orders
create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);
alter table public.settings enable row level security;
create policy settings_select_public on public.settings for select using (key in ('wholesale_min_cop'));
create policy settings_admin_all on public.settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.settings (key, value) values ('wholesale_min_cop', '3500000') on conflict do nothing;

alter table public.orders
  add column if not exists channel text not null default 'retail' check (channel in ('retail','wholesale')),
  add column if not exists user_id uuid null,
  add column if not exists subtotal_cop integer,
  add column if not exists total_cop integer;

create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_name text,
  name_snapshot text not null,
  unit_price_cop integer not null check (unit_price_cop >= 0),
  qty integer not null check (qty > 0),
  line_total_cop integer not null
);
create index if not exists order_lines_order_idx on public.order_lines (order_id);
create index if not exists order_lines_product_idx on public.order_lines (product_id);
alter table public.order_lines enable row level security;
create policy order_lines_admin_select on public.order_lines for select to authenticated
  using ((select public.is_admin()));
