-- EboHomes 20261207_03 (Phase 11.10)  *** PROPOSED. NOT EXECUTED. ***
-- 1. Payment evidence is accepted on offer-created pending tenancies (agreement must still be signed: the server checks that).
-- 2. eb_link_paystack_payment: a PAID Paystack transaction becomes ONE payments row with status 'recorded' (an admin still verifies it).
-- 3. paystack_transactions.link_error, payments.application_id (auto-filled).
-- Needs 20261024_03 (paystack_transactions), 20261030_01 (payment submissions), 20261207_01 (tenancies.offer_id).
begin;

-- ===== A. Preflight =====
create or replace function pg_temp.eb_col_allows(p_col text, p_val text) returns boolean
 language plpgsql
as $$
declare
  c record;
  v_type text;
  v_udt text;
  mentioned boolean := false;
  ok boolean := false;
begin
  select data_type, udt_name into v_type, v_udt from information_schema.columns
   where table_schema = 'public' and table_name = 'payments' and column_name = p_col;
  if not found then return false; end if;
  if v_type = 'USER-DEFINED' then
    return exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = v_udt and e.enumlabel = p_val);
  end if;
  for c in select pg_get_constraintdef(oid) as d from pg_constraint
            where conrelid = 'public.payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~* ('\m' || p_col || '\M')
  loop
    mentioned := true;
    if position(quote_literal(p_val) in c.d) > 0 then ok := true; end if;
  end loop;
  return (not mentioned) or ok;
end;
$$;

do $$
declare
  miss text;
  extra text;
  pair text[];
begin
  if to_regclass('public.paystack_transactions') is null then
    raise exception 'STOPPED: run 20261024_03_paystack_foundation.sql first.';
  end if;
  if to_regclass('public.payment_submissions') is null then
    raise exception 'STOPPED: run 20261030_01_payment_submissions.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tenancies' and column_name = 'offer_id') then
    raise exception 'STOPPED: run 20261207_01_offer_tenancies.sql first.';
  end if;

  select string_agg(c, ', ') into miss
    from unnest(array['user_id', 'listing_id', 'tenancy_id', 'type', 'amount', 'status', 'reference', 'payment_method', 'source']) c
   where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = c);
  if miss is not null then
    raise exception 'STOPPED: public.payments is missing column(s): %. Tell Claude.', miss;
  end if;

  select string_agg(column_name, ', ') into extra from information_schema.columns
   where table_schema = 'public' and table_name = 'payments' and is_nullable = 'NO' and column_default is null
     and is_identity = 'NO' and is_generated = 'NEVER'
     and column_name <> all (array['id', 'user_id', 'listing_id', 'tenancy_id', 'type', 'amount', 'status', 'reference', 'payment_method', 'source']);
  if extra is not null then
    raise exception 'STOPPED: payments has required column(s) this migration does not fill: %. Tell Claude.', extra;
  end if;

  foreach pair slice 1 in array array[array['type', 'fee'], array['payment_method', 'card'], array['source', 'paystack'], array['status', 'recorded']] loop
    if not pg_temp.eb_col_allows(pair[1], pair[2]) then
      raise exception 'STOPPED: payments.% does not allow the value ''%''. Run: select pg_get_constraintdef(oid) from pg_constraint where conrelid = ''public.payments''::regclass; and send the result to Claude.', pair[1], pair[2];
    end if;
  end loop;
end $$;

-- ===== B. Columns =====
alter table public.paystack_transactions add column if not exists link_error text;

alter table public.payments add column if not exists application_id uuid;
create index if not exists payments_application_idx on public.payments (application_id);

create or replace function public.eb_payment_set_application()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  if new.application_id is null and new.tenancy_id is not null then
    select t.application_id into new.application_id from public.tenancies t where t.id = new.tenancy_id;
  end if;
  return new;
end;
$$;
revoke all on function public.eb_payment_set_application() from public, anon, authenticated;

drop trigger if exists a_payment_set_application on public.payments;
create trigger a_payment_set_application before insert on public.payments
  for each row execute function public.eb_payment_set_application();

-- Backfill old rows. If an existing payments guard refuses the update, this is skipped and nothing else is affected.
do $$
begin
  update public.payments p set application_id = t.application_id
    from public.tenancies t
   where t.id = p.tenancy_id and p.application_id is null and t.application_id is not null;
exception when others then
  raise notice 'Backfill of payments.application_id skipped: %', sqlerrm;
end $$;

-- ===== C. Payment evidence allowed on offer-created pending tenancies =====
create or replace function public.eb_submit_payment_evidence(
  p_tenant uuid, p_tenancy uuid, p_terms uuid, p_type text, p_expected numeric, p_amount numeric,
  p_payer_name text, p_payer_bank text, p_ref text, p_paid_at timestamptz, p_method text, p_notes text,
  p_path text, p_mime text, p_bytes bigint, p_replaces uuid
) returns public.payment_submissions
 language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  t record; old public.payment_submissions; r public.payment_submissions;
begin
  select tenant_id, status, offer_id into t from public.tenancies where id = p_tenancy;
  if not found or t.tenant_id is distinct from p_tenant then raise exception 'Tenancy not found' using errcode = '42501'; end if;
  if not (t.status = 'active' or (t.status in ('pending', 'awaiting_payment') and t.offer_id is not null)) then
    raise exception 'Payments can only be submitted on active or reserved tenancies' using errcode = '42501';
  end if;

  if p_replaces is not null then
    select * into old from public.payment_submissions where id = p_replaces for update;
    if not found or old.tenant_id <> p_tenant or old.tenancy_id <> p_tenancy or old.payment_type <> p_type then
      raise exception 'Submission to correct was not found' using errcode = '42501';
    end if;
    if old.status not in ('rejected','needs_info') then
      raise exception 'Only a rejected submission or one that needs more information can be corrected' using errcode = '22023';
    end if;
    update public.payment_submissions set status = 'superseded', updated_at = now() where id = old.id;
    insert into public.payment_submission_events (submission_id, event, actor_id, note) values (old.id, 'superseded', p_tenant, 'Replaced by a corrected submission');
  end if;

  insert into public.payment_submissions (tenancy_id, tenant_id, terms_id, payment_type, expected_amount, amount_paid, payer_name, payer_bank,
    transaction_reference, reference_key, paid_at, payment_method, notes, evidence_path, evidence_mime, evidence_bytes, replaces_id)
  values (p_tenancy, p_tenant, p_terms, p_type, p_expected, p_amount, trim(p_payer_name), trim(p_payer_bank),
    trim(p_ref), lower(regexp_replace(trim(p_ref), '\s+', '', 'g')), p_paid_at, p_method, nullif(trim(p_notes), ''),
    p_path, p_mime, p_bytes, p_replaces)
  returning * into r;

  insert into public.payment_submission_events (submission_id, event, actor_id, note) values (r.id, 'submitted', p_tenant, null);

  begin
    perform public.notify_admins('Payment evidence submitted', 'A tenant says they have paid and uploaded evidence. It is not verified yet.', '/admin/payments', 'payment');
  exception when others then null; -- a notification problem must never block a submission
  end;
  return r;
end;
$f$;
revoke all on function public.eb_submit_payment_evidence(uuid,uuid,uuid,text,numeric,numeric,text,text,text,timestamptz,text,text,text,text,bigint,uuid) from public, anon, authenticated;
grant execute on function public.eb_submit_payment_evidence(uuid,uuid,uuid,text,numeric,numeric,text,text,text,timestamptz,text,text,text,text,bigint,uuid) to service_role;

-- ===== D. Paystack link: one PAID transaction -> one payments row ('recorded', awaiting EboHomes verification) =====
create or replace function public.eb_link_paystack_payment(p_reference text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  x record;
  t record;
  v_payment uuid;
  v_type text;
begin
  select * into x from public.paystack_transactions where reference = p_reference for update;
  if not found then raise exception 'Unknown Paystack reference'; end if;
  if x.reconciled_payment_id is not null then return x.reconciled_payment_id; end if;
  if x.status <> 'paid' then raise exception 'This Paystack transaction is not paid (status: %)', x.status; end if;

  select id, listing_id, tenant_id into t from public.tenancies where id = x.tenancy_id;
  if not found then raise exception 'Tenancy not found'; end if;

  v_type := case x.purpose when 'fees' then 'fee' else x.purpose end;

  -- If a payments row with this reference already exists (an earlier half-finished run), reuse it.
  select id into v_payment from public.payments where reference = x.reference and tenancy_id = x.tenancy_id limit 1;
  if v_payment is null then
    insert into public.payments (user_id, listing_id, tenancy_id, type, amount, status, reference, payment_method, source)
    values (t.tenant_id, t.listing_id, x.tenancy_id, v_type, x.amount_kobo / 100.0, 'recorded', x.reference, 'card', 'paystack')
    returning id into v_payment;
  end if;

  update public.paystack_transactions
     set reconciled_payment_id = v_payment, link_error = null, updated_at = now()
   where id = x.id;
  return v_payment;
end;
$function$;
revoke all on function public.eb_link_paystack_payment(text) from public, anon, authenticated;
grant execute on function public.eb_link_paystack_payment(text) to service_role;

commit;

-- CHECK (read only): expect 2 columns, 1 trigger, 2 functions.
select column_name from information_schema.columns
 where table_schema = 'public' and ((table_name = 'payments' and column_name = 'application_id') or (table_name = 'paystack_transactions' and column_name = 'link_error'));
select tgname from pg_trigger where tgname = 'a_payment_set_application' and not tgisinternal;
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('eb_link_paystack_payment', 'eb_submit_payment_evidence');

-- OPTIONAL, read only: paid online but not in Payments yet (the retry is: select public.eb_link_paystack_payment('<reference>');).
-- select reference, tenancy_id, purpose, paid_at, link_error from public.paystack_transactions where status = 'paid' and reconciled_payment_id is null;

-- ROLLBACK:
-- drop trigger if exists a_payment_set_application on public.payments;
-- drop function if exists public.eb_payment_set_application();
-- drop function if exists public.eb_link_paystack_payment(text);
-- Put back the 20261030_01 version of eb_submit_payment_evidence (re-run that function block).
-- Keep payments.application_id and paystack_transactions.link_error (harmless).
