create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.jwt() ->> 'email') in ('kevinlgomez058@gmail.com','camiloarenas135@gmail.com');
$$;
drop table if exists public.admins;
