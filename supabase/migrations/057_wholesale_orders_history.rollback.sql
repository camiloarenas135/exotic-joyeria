-- Rollback 057. ADVERTENCIA: quitar last_status_notified rompe set_wholesaler_status (055) y wholesale-mail;
-- hágalo solo si también revierte la 055.
drop function if exists public.my_wholesale_orders(integer, integer);
-- alter table public.wholesalers drop column if exists last_status_notified;
