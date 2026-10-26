drop index if exists public.products_price_cop_idx;
alter table public.products drop column if exists price_cop;
-- (price_cop dentro del JSON de variants es inocuo; se puede dejar)
