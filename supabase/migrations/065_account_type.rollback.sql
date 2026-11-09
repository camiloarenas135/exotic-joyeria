-- Rollback de 065. Aplicar después de revertir 071, 068 y 066 (dependen de my_account_type / account_type).
set local lock_timeout = '3s';

drop function if exists public.admin_set_account_type(uuid, text);
drop function if exists public.admin_list_wholesalers(text);
create function public.admin_list_wholesalers(p_status text default null)
returns table (
  user_id uuid, email text, business_name text, phone text, city text, tax_id text,
  status text, notes text, reviewed_at timestamptz, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_status is not null and p_status not in ('pending','approved','rejected','suspended') then
    raise exception 'INVALID_STATUS';
  end if;
  return query
    select w.user_id, w.email, w.business_name, w.phone, w.city, w.tax_id,
           w.status, w.notes, w.reviewed_at, w.created_at
    from public.wholesalers w
    where p_status is null or w.status = p_status
    order by w.created_at desc;
end $$;
revoke execute on function public.admin_list_wholesalers(text) from public, anon;
grant execute on function public.admin_list_wholesalers(text) to authenticated;

drop function if exists public.request_wholesale_access(text, text, text, text, text);
create function public.request_wholesale_access(p_business_name text, p_phone text, p_city text, p_tax_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_name text; v_phone text; v_city text; v_tax text; v_digits text; v_status text; v_email text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_name := left(regexp_replace(btrim(coalesce(p_business_name, '')), '[<>]', '', 'g'), 120);
  v_phone := left(regexp_replace(coalesce(p_phone, ''), '[^0-9+ -]', '', 'g'), 30);
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  v_city := left(regexp_replace(btrim(coalesce(p_city, '')), '[<>]', '', 'g'), 80);
  v_tax := nullif(left(regexp_replace(btrim(coalesce(p_tax_id, '')), '[<>]', '', 'g'), 30), '');
  if length(v_name) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(v_digits) < 7 or length(v_digits) > 15 then raise exception 'INVALID_PHONE'; end if;
  if length(v_city) < 2 then raise exception 'INVALID_CITY'; end if;
  select status into v_status from public.wholesalers where user_id = v_uid;
  if found then return jsonb_build_object('status', v_status, 'created', false); end if;
  select email into v_email from auth.users where id = v_uid;
  insert into public.wholesalers (user_id, email, business_name, phone, city, tax_id)
  values (v_uid, v_email, v_name, v_phone, v_city, v_tax) on conflict (user_id) do nothing;
  return jsonb_build_object('status', 'pending', 'created', true);
end $$;
revoke execute on function public.request_wholesale_access(text, text, text, text) from public, anon;
grant execute on function public.request_wholesale_access(text, text, text, text) to authenticated;

create or replace function public.handle_new_wholesaler() returns trigger
language plpgsql security definer set search_path = '' as $$
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

drop function if exists public.my_account_type();
alter table public.wholesalers
  drop constraint if exists wholesalers_account_type_chk,
  drop constraint if exists wholesalers_requested_type_chk,
  drop column if exists account_type,
  drop column if exists requested_account_type;
