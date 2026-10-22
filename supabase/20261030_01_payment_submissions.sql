-- EboHomes 20261030_01: tenant payment evidence submissions (Phase 1).
-- WHAT: adds payment_submissions + payment_submission_events, a private storage bucket, and one server-only function.
-- DOES NOT: touch payments, payments_guard, payments_verify_guard, admin_review_payment, receipts, tenancies or any trigger.
--   A submission is only EVIDENCE. It never creates or changes a payments row and never confirms anything.
-- Phase 2 (admin review + approval codes) will link a verified submission to a payments row via payment_id.
-- ROLLBACK: at the bottom.
begin;

create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id),
  tenant_id uuid not null references public.profiles(id),
  terms_id uuid references public.rental_terms(id),
  payment_type text not null check (payment_type in ('rent','deposit','fees')),
  expected_amount numeric check (expected_amount is null or expected_amount > 0),
  amount_paid numeric not null check (amount_paid > 0 and amount_paid <= 100000000000),
  payer_name text not null check (char_length(trim(payer_name)) between 2 and 120),
  payer_bank text not null check (char_length(trim(payer_bank)) between 2 and 80),
  transaction_reference text not null check (char_length(trim(transaction_reference)) between 4 and 80),
  reference_key text not null,
  paid_at timestamptz not null,
  payment_method text not null check (payment_method in ('bank_transfer','mobile_app_transfer','ussd','cash_deposit')),
  notes text check (notes is null or char_length(notes) <= 500),
  evidence_path text not null,
  evidence_mime text not null,
  evidence_bytes bigint not null check (evidence_bytes > 0),
  status text not null default 'submitted'
    check (status in ('submitted','under_review','needs_info','rejected','superseded','verified')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  replaces_id uuid references public.payment_submissions(id),
  payment_id uuid references public.payments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_submissions_evidence_uidx on public.payment_submissions (evidence_path);
-- one open submission per tenancy and payment type
create unique index if not exists payment_submissions_one_open_idx
  on public.payment_submissions (tenancy_id, payment_type) where status in ('submitted','under_review');
-- the same bank reference cannot back two live submissions
create unique index if not exists payment_submissions_reference_idx
  on public.payment_submissions (reference_key) where status in ('submitted','under_review','needs_info','verified');
create index if not exists payment_submissions_tenancy_idx on public.payment_submissions (tenancy_id, created_at desc);
create index if not exists payment_submissions_tenant_idx on public.payment_submissions (tenant_id);

create table if not exists public.payment_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.payment_submissions(id),
  event text not null,
  actor_id uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists payment_submission_events_sub_idx on public.payment_submission_events (submission_id, created_at);

-- events are append-only
create or replace function public.payment_submission_events_immutable()
 returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$ begin raise exception 'Payment submission events cannot be changed' using errcode = '42501'; end; $f$;
drop trigger if exists payment_submission_events_no_change on public.payment_submission_events;
create trigger payment_submission_events_no_change before update or delete on public.payment_submission_events
  for each row execute function public.payment_submission_events_immutable();

-- RLS: tenants read their own rows, admins read all. NOBODY writes from the client. Writes go through the server function below.
alter table public.payment_submissions enable row level security;
alter table public.payment_submission_events enable row level security;

drop policy if exists payment_submissions_select_own on public.payment_submissions;
create policy payment_submissions_select_own on public.payment_submissions for select to authenticated
  using (tenant_id = auth.uid());
drop policy if exists payment_submissions_select_admin on public.payment_submissions;
create policy payment_submissions_select_admin on public.payment_submissions for select to authenticated
  using (public.eb_is_admin());
drop policy if exists payment_submission_events_select on public.payment_submission_events;
create policy payment_submission_events_select on public.payment_submission_events for select to authenticated
  using (public.eb_is_admin() or exists (select 1 from public.payment_submissions s where s.id = submission_id and s.tenant_id = auth.uid()));

revoke all on public.payment_submissions from anon, authenticated;
revoke all on public.payment_submission_events from anon, authenticated;
grant select on public.payment_submissions to authenticated;
grant select on public.payment_submission_events to authenticated;

-- The ONLY way a submission is created. Callable by the server (service_role) only.
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
  select tenant_id, status into t from public.tenancies where id = p_tenancy;
  if not found or t.tenant_id is distinct from p_tenant then raise exception 'Tenancy not found' using errcode = '42501'; end if;
  if t.status <> 'active' then raise exception 'Payments can only be submitted on active tenancies' using errcode = '42501'; end if;

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

-- Private evidence bucket. No storage.objects policies are added, so only the server (service role) can write or sign.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-evidence', 'payment-evidence', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

commit;

-- AFTER RUNNING, check no broad storage policy exposes the bucket (expect no row that is not bucket-specific):
--   select policyname, cmd, qual from pg_policies where schemaname='storage' and tablename='objects';
-- ROLLBACK:
--   drop function if exists public.eb_submit_payment_evidence(uuid,uuid,uuid,text,numeric,numeric,text,text,text,timestamptz,text,text,text,text,bigint,uuid);
--   drop table if exists public.payment_submission_events; drop table if exists public.payment_submissions;
--   delete from storage.buckets where id='payment-evidence';  -- only after the bucket is empty