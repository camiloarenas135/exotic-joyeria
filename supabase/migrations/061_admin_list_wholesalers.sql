-- 061: RPC admin_list_wholesalers (ADITIVA, segura de aplicar en cualquier momento).
-- Prepara el hallazgo 2.1: el panel admin dejará de leer `wholesalers` con select('*') y usará esta función,
-- para que la migración 062 pueda ocultar al dueño de la cuenta las columnas internas (notes, reviewed_by, last_status_notified).
-- Orden de despliegue: 061 → desplegar frontend nuevo → 062.
-- Rollback: 061_admin_list_wholesalers.rollback.sql
set local lock_timeout = '3s';

create or replace function public.admin_list_wholesalers(p_status text default null)
returns table (
  user_id uuid, email text, business_name text, phone text, city text, tax_id text,
  status text, notes text, reviewed_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
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
