-- Rollback 062: devuelve el SELECT de tabla completa a authenticated (las políticas RLS siguen filtrando por dueño/admin).
set local lock_timeout = '3s';

grant select on public.wholesalers to authenticated;
