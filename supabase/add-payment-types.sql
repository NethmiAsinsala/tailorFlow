-- One-time update for an existing Thanu Fashion installation.
-- Adds Advance, Full payment and Balance payment classification.

alter table public.tf_payments
add column if not exists payment_type text not null default 'full';

update public.tf_payments
set payment_type = 'full'
where payment_type is null or payment_type not in ('advance', 'full', 'balance');

do $$
begin
    alter table public.tf_payments
    add constraint tf_payments_payment_type_check
    check (payment_type in ('advance', 'full', 'balance'));
exception
    when duplicate_object then null;
end;
$$;
