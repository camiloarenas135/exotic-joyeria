-- 020: slides del hero administrables. Rollback: drop table public.hero_slides;
create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  image_desktop text not null,
  image_mobile text,
  title text check (length(title) <= 120),
  subtitle text check (length(subtitle) <= 240),
  button_label text check (length(button_label) <= 40),
  link text check (link is null or link ~ '^(/[A-Za-z0-9/_?=&#.%-]*|https://[^[:space:]]+)$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hero_slides enable row level security;
create policy hero_slides_select_public on public.hero_slides for select
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy hero_slides_admin_all on public.hero_slides for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
