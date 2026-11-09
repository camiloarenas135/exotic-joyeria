-- 065: tipo de cuenta Mayorista / Emprendedor (Fase 2 del PLAN-EMPRENDEDOR-MAYORISTA). ADITIVA: las 4 cuentas actuales quedan como 'wholesale'.
--   · wholesalers.account_type: lo que DECIDE precios y mínimo. Solo lo cambia el admin (admin_set_account_type); ningún rol tiene UPDATE sobre la tabla.
--   · wholesalers.requested_account_type: lo que la persona PIDIÓ al registrarse; nunca autoriza nada. El servidor lo valida contra la lista permitida.
--   · public.my_account_type(): tipo de la cuenta APROBADA del usuario actual (null si no hay sesión, no es cuenta de negocio o no está aprobada).
--     Va en `public` (no `private`) porque la política RLS de wholesale_prices la invoca con el rol del usuario.
--   · handle_new_wholesaler / request_wholesale_access aceptan el tipo pedido (por defecto 'wholesale': el front actual no cambia).
--   · admin_list_wholesalers devuelve además account_type y requested_account_type (el front actual ignora las columnas nuevas).
-- Rollback: 065_account_type.rollback.sql
set local lock_timeout = '3s';

alter table public.wholesalers
  add column account_type text not null default 'wholesale',
  add column requested_account_type text not null default 'wholesale',
  add constraint wholesalers_account_type_chk check (account_type in ('wholesale', 'entrepreneur')),
  add constraint wholesalers_requested_type_chk check (requested_account_type in ('wholesale', 'entrepreneur'));

-- el dueño puede leer SU tipo (ChannelContext lo usará); requested_account_type solo lo ve el admin
grant select (account_type) on public.wholesalers to authenticated;

create or replace function public.my_account_type() returns text
language sql stable security definer set search_path = '' as $$
  select w.account_type from public.wholesalers w where w.user_id = (select auth.uid()) and w.status = 'approved';
$$;
revoke execute on function public.my_account_type() from public, anon;
grant execute on function public.my_account_type() to authenticated;

create or replace function public.handle_new_wholesaler() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_req text;
begin
  if new.raw_user_meta_data ->> 'signup_type' = 'wholesale' then
    v_req := case when new.raw_user_meta_data ->> 'requested_account_type' in ('wholesale', 'entrepreneur')
                  then new.raw_user_meta_data ->> 'requested_account_type' else 'wholesale' end;
    insert into public.wholesalers (user_id, email, business_name, phone, city, tax_id, account_type, requested_account_type)
    values (
      new.id, new.email,
      left(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 120),
      left(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 30),
      left(btrim(coalesce(new.raw_user_meta_data ->> 'city', '')), 80),
      nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'tax_id', '')), 30), ''),
      v_req, v_req)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- la firma de 4 parámetros se reemplaza por una de 5 con valor por defecto: dejar las dos haría ambiguas las llamadas con 4 argumentos
drop function public.request_wholesale_access(text, text, text, text);
create function public.request_wholesale_access(
  p_business_name text, p_phone text, p_city text, p_tax_id text default null, p_account_type text default 'wholesale')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_name text; v_phone text; v_city text; v_tax text; v_digits text; v_status text; v_email text; v_type text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_type := coalesce(nullif(btrim(p_account_type), ''), 'wholesale');
  if v_type not in ('wholesale', 'entrepreneur') then raise exception 'INVALID_ACCOUNT_TYPE'; end if;
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
  insert into public.wholesalers (user_id, email, business_name, phone, city, tax_id, account_type, requested_account_type)
  values (v_uid, v_email, v_name, v_phone, v_city, v_tax, v_type, v_type) on conflict (user_id) do nothing;
  return jsonb_build_object('status', 'pending', 'created', true);
end $$;
revoke execute on function public.request_wholesale_access(text, text, text, text, text) from public, anon;
grant execute on function public.request_wholesale_access(text, text, text, text, text) to authenticated;

create or replace function public.admin_set_account_type(p_user uuid, p_type text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_type is null or p_type not in ('wholesale', 'entrepreneur') then raise exception 'INVALID_ACCOUNT_TYPE'; end if;
  update public.wholesalers set account_type = p_type where user_id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke execute on function public.admin_set_account_type(uuid, text) from public, anon;
grant execute on function public.admin_set_account_type(uuid, text) to authenticated;

drop function public.admin_list_wholesalers(text);
create function public.admin_list_wholesalers(p_status text default null)
returns table (
  user_id uuid, email text, business_name text, phone text, city text, tax_id text,
  status text, notes text, reviewed_at timestamptz, created_at timestamptz,
  account_type text, requested_account_type text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected', 'suspended') then
    raise exception 'INVALID_STATUS';
  end if;
  return query
    select w.user_id, w.email, w.business_name, w.phone, w.city, w.tax_id,
           w.status, w.notes, w.reviewed_at, w.created_at, w.account_type, w.requested_account_type
    from public.wholesalers w
    where p_status is null or w.status = p_status
    order by w.created_at desc;
end $$;
revoke execute on function public.admin_list_wholesalers(text) from public, anon;
grant execute on function public.admin_list_wholesalers(text) to authenticated;
