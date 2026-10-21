-- Thanu Fashion Shop Manager
-- Safe namespaced schema: does not modify existing TailorFlow tables.
-- Run this entire file in Supabase Dashboard > SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.tf_customers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    full_name text not null,
    phone text not null,
    whatsapp text,
    email text,
    address text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tf_orders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    customer_id uuid not null references public.tf_customers(id) on delete cascade,
    order_number text not null,
    garment_type text not null,
    order_date date not null default current_date,
    due_date date not null,
    status text not null default 'pending' check (status in ('pending', 'in_progress', 'ready', 'completed', 'cancelled')),
    total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
    advance_amount numeric(12,2) not null default 0 check (advance_amount >= 0),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, order_number)
);

create table if not exists public.tf_measurements (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    customer_id uuid not null references public.tf_customers(id) on delete cascade,
    profile_name text not null,
    chest numeric(7,2),
    waist numeric(7,2),
    hips numeric(7,2),
    shoulder numeric(7,2),
    sleeve_length numeric(7,2),
    garment_length numeric(7,2),
    neck numeric(7,2),
    inseam numeric(7,2),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tf_inventory (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    item_name text not null,
    category text,
    quantity numeric(12,2) not null default 0 check (quantity >= 0),
    unit text not null default 'pieces',
    reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
    unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tf_payments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    customer_id uuid not null references public.tf_customers(id) on delete cascade,
    order_id uuid references public.tf_orders(id) on delete set null,
    amount numeric(12,2) not null check (amount > 0),
    method text not null default 'cash' check (method in ('cash', 'card', 'bank_transfer', 'online', 'other')),
    paid_at date not null default current_date,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists tf_customers_user_id_idx on public.tf_customers(user_id);
create index if not exists tf_orders_user_id_idx on public.tf_orders(user_id);
create index if not exists tf_orders_customer_id_idx on public.tf_orders(customer_id);
create index if not exists tf_orders_due_date_idx on public.tf_orders(due_date);
create index if not exists tf_measurements_user_id_idx on public.tf_measurements(user_id);
create index if not exists tf_measurements_customer_id_idx on public.tf_measurements(customer_id);
create index if not exists tf_inventory_user_id_idx on public.tf_inventory(user_id);
create index if not exists tf_payments_user_id_idx on public.tf_payments(user_id);
create index if not exists tf_payments_customer_id_idx on public.tf_payments(customer_id);
create index if not exists tf_payments_order_id_idx on public.tf_payments(order_id);

create or replace function public.tf_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists tf_customers_set_updated_at on public.tf_customers;
create trigger tf_customers_set_updated_at before update on public.tf_customers
for each row execute function public.tf_set_updated_at();

drop trigger if exists tf_orders_set_updated_at on public.tf_orders;
create trigger tf_orders_set_updated_at before update on public.tf_orders
for each row execute function public.tf_set_updated_at();

drop trigger if exists tf_measurements_set_updated_at on public.tf_measurements;
create trigger tf_measurements_set_updated_at before update on public.tf_measurements
for each row execute function public.tf_set_updated_at();

drop trigger if exists tf_inventory_set_updated_at on public.tf_inventory;
create trigger tf_inventory_set_updated_at before update on public.tf_inventory
for each row execute function public.tf_set_updated_at();

drop trigger if exists tf_payments_set_updated_at on public.tf_payments;
create trigger tf_payments_set_updated_at before update on public.tf_payments
for each row execute function public.tf_set_updated_at();

alter table public.tf_customers enable row level security;
alter table public.tf_orders enable row level security;
alter table public.tf_measurements enable row level security;
alter table public.tf_inventory enable row level security;
alter table public.tf_payments enable row level security;

drop policy if exists "Owners manage tf customers" on public.tf_customers;
create policy "Owners manage tf customers" on public.tf_customers
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage tf orders" on public.tf_orders;
create policy "Owners manage tf orders" on public.tf_orders
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage tf measurements" on public.tf_measurements;
create policy "Owners manage tf measurements" on public.tf_measurements
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage tf inventory" on public.tf_inventory;
create policy "Owners manage tf inventory" on public.tf_inventory
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage tf payments" on public.tf_payments;
create policy "Owners manage tf payments" on public.tf_payments
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tf_customers to authenticated;
grant select, insert, update, delete on public.tf_orders to authenticated;
grant select, insert, update, delete on public.tf_measurements to authenticated;
grant select, insert, update, delete on public.tf_inventory to authenticated;
grant select, insert, update, delete on public.tf_payments to authenticated;
