drop table if exists public.order_lines;
alter table public.orders drop column if exists channel, drop column if exists user_id, drop column if exists subtotal_cop, drop column if exists total_cop;
drop table if exists public.settings;
