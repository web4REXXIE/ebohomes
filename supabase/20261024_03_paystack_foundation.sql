-- EboHomes 20261024_03: Paystack foundation. ADDITIVE ONLY. Safe to run while payments are switched off.
-- WHAT: one new table, paystack_transactions, written ONLY by the server (service role). It records each online
--       payment attempt and what Paystack confirmed. It does NOT touch the payments table, so the manual
--       record-then-verify workflow is unchanged.
-- RLS is on with no policies = browsers cannot read or write it. Admin screens come later.
-- PREREQUISITE: tenancies and rental_terms exist (they do).
-- ROLLBACK: drop table if exists public.paystack_transactions;

begin;

create table if not exists public.paystack_transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  tenancy_id uuid not null references public.tenancies(id),
  terms_id uuid references public.rental_terms(id),
  user_id uuid not null,
  purpose text not null check (purpose in ('rent', 'deposit', 'fees')),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  status text not null default 'initiated'
    check (status in ('initiated', 'paid', 'mismatch', 'failed', 'abandoned')),
  paystack_transaction_id text,
  channel text,
  paid_at timestamptz,
  reconciled_payment_id uuid,
  raw_verify jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paystack_transactions_tenancy_idx on public.paystack_transactions (tenancy_id);

alter table public.paystack_transactions enable row level security;
revoke all on public.paystack_transactions from anon, authenticated;

commit;

select count(*) as rows_now from public.paystack_transactions;