-- 001_admins: admins en tabla (antes escritos a mano en is_admin()).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

insert into public.admins (user_id)
select id from auth.users
where lower(email) in ('kevinlgomez058@gmail.com','camiloarenas135@gmail.com')
on conflict do nothing;

do $$
begin
  if (select count(*) from public.admins) < 2 then
    raise exception 'Se esperaban 2 admins sembrados; abortando para no dejar el panel sin acceso';
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
