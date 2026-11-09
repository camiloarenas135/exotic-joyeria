-- Rollback 060: reabre el INSERT directo a `orders` (mismo criterio que supabase_setup.sql). Usar solo si los pedidos dejan de llegar.
set local lock_timeout = '3s';

grant insert on public.orders to anon, authenticated;
drop policy if exists orders_insert_public on public.orders;
create policy orders_insert_public on public.orders
  for insert to anon, authenticated
  with check (
    customer_name is not null and length(trim(customer_name)) >= 2 and
    customer_phone is not null and length(trim(customer_phone)) >= 8 and
    items is not null and
    total_amount is not null and total_amount >= 0 and
    status = 'pending'
  );
