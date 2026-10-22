-- EboHomes 20261106_01 (Phase 5A): a renewal can only be applied after a verified, tenant-confirmed payment.
-- REQUIRES 20261030_01, 20261031_01, 20261101_01 and the existing renewals + renewal_applied tables.
-- WHAT:
--   1. payment_submissions.renewal_id links a payment submission to the renewal it pays for.
--   2. eb_submit_renewal_evidence (server only) creates that submission in ONE transaction.
--   3. eb_renewal_progress gives the tenant, the landlord and admins one safe progress answer.
--   4. A gate on renewal_applied: admin_apply_renewal now FAILS unless the renewal has a bank-verified payment
--      that the tenant confirmed with the code. No button or API can skip it.
--   5. Notifications when a renewal is accepted and when it is applied.
-- DOES NOT: change admin_apply_renewal, payments, payment triggers, or any existing policy.
-- ROLLBACK: at the bottom.
begin;

-- Safety check: the gate relies on admin_apply_renewal writing a row to renewal_applied.
do $$
begin
  if position('renewal_applied' in pg_get_functiondef('public.admin_apply_renewal(uuid)'::regprocedure)) = 0 then
    raise exception 'admin_apply_renewal does not write renewal_applied. Stop here and send this message to Claude.';
  end if;
end $$;

alter table public.payment_submissions add column if not exists renewal_id uuid references public.renewals(id);
create index if not exists payment_submissions_renewal_idx on public.payment_submissions (renewal_id) where renewal_id is not null;

-- SERVER ONLY: create a renewal payment submission (calls the normal submit function, then links it, in one transaction)
create or replace function public.eb_submit_renewal_evidence(
  p_tenant uuid, p_tenancy uuid, p_terms uuid, p_type text, p_expected numeric, p_amount numeric,
  p_payer_name text, p_payer_bank text, p_ref text, p_paid_at timestamptz, p_method text, p_notes text,
  p_path text, p_mime text, p_bytes bigint, p_replaces uuid, p_renewal uuid
) returns public.payment_submissions
 language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r public.renewals; s public.payment_submissions;
begin
  select * into r from public.renewals where id = p_renewal for update;
  if not found or r.tenant_id is distinct from p_tenant or r.tenancy_id is distinct from p_tenancy then
    raise exception 'Renewal not found' using errcode = '42501';
  end if;
  if r.status <> 'accepted' then raise exception 'This renewal is not waiting for payment' using errcode = '22023'; end if;
  if exists (select 1 from public.renewal_applied where renewal_id = r.id) then
    raise exception 'This renewal is already applied' using errcode = '22023';
  end if;
  if p_type <> 'rent' then raise exception 'A renewal is paid as rent' using errcode = '22023'; end if;
  if p_expected is distinct from r.new_rent then raise exception 'The amount due does not match the renewal' using errcode = '22023'; end if;
  if exists (select 1 from public.payment_submissions where renewal_id = r.id and status = 'verified') then
    raise exception 'This renewal payment was already verified' using errcode = '22023';
  end if;

  s := public.eb_submit_payment_evidence(p_tenant, p_tenancy, p_terms, p_type, p_expected, p_amount, p_payer_name, p_payer_bank,
         p_ref, p_paid_at, p_method, p_notes, p_path, p_mime, p_bytes, p_replaces);
  update public.payment_submissions set renewal_id = r.id where id = s.id returning * into s;
  return s;
end;
$f$;
revoke all on function public.eb_submit_renewal_evidence(uuid,uuid,uuid,text,numeric,numeric,text,text,text,timestamptz,text,text,text,text,bigint,uuid,uuid) from public, anon, authenticated;
grant execute on function public.eb_submit_renewal_evidence(uuid,uuid,uuid,text,numeric,numeric,text,text,text,timestamptz,text,text,text,text,bigint,uuid,uuid) to service_role;

-- PARTIES AND ADMINS: one answer about where a renewal is. Never returns evidence, codes or bank details.
create or replace function public.eb_renewal_progress(p_renewal uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare
  r public.renewals; s public.payment_submissions; v_code text; v_applied boolean; v_stage text;
begin
  if auth.uid() is null then return jsonb_build_object('found', false); end if;
  select * into r from public.renewals where id = p_renewal;
  if not found or not (auth.uid() = r.tenant_id or auth.uid() = r.landlord_id or public.eb_is_admin()) then
    return jsonb_build_object('found', false);
  end if;
  select exists (select 1 from public.renewal_applied where renewal_id = r.id) into v_applied;
  select * into s from public.payment_submissions where renewal_id = r.id and status <> 'superseded' order by created_at desc limit 1;
  if s.id is not null then
    select status into v_code from public.payment_confirmation_codes where submission_id = s.id
     order by (status = 'consumed') desc, issued_at desc limit 1;
  end if;

  if v_applied then v_stage := 'applied';
  elsif r.status = 'offered' then v_stage := 'offered';
  elsif r.status = 'declined' then v_stage := 'declined';
  elsif r.status <> 'accepted' then v_stage := r.status;
  elsif s.id is null then v_stage := 'awaiting_payment';
  elsif s.status in ('submitted', 'under_review') then v_stage := 'payment_review';
  elsif s.status in ('needs_info', 'rejected') then v_stage := 'payment_problem';
  elsif s.status = 'verified' and v_code = 'consumed' then v_stage := 'ready_for_admin';
  elsif s.status = 'verified' then v_stage := 'confirm_code';
  else v_stage := 'awaiting_payment';
  end if;

  return jsonb_build_object('found', true, 'stage', v_stage, 'renewal_id', r.id, 'new_rent', r.new_rent, 'new_end_date', r.new_end_date,
    'submission_id', case when auth.uid() = r.tenant_id then s.id end);
end;
$f$;
revoke all on function public.eb_renewal_progress(uuid) from public, anon;
grant execute on function public.eb_renewal_progress(uuid) to authenticated;

-- THE GATE: applying a renewal needs a bank-verified payment that the tenant confirmed with the code.
create or replace function public.eb_renewal_apply_gate()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r public.renewals;
begin
  select * into r from public.renewals where id = new.renewal_id;
  if not found then raise exception 'Renewal not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1
      from public.payment_submissions s
      join public.payments p on p.id = s.payment_id
      join public.payment_confirmation_codes c on c.submission_id = s.id and c.status = 'consumed'
     where s.renewal_id = r.id and s.status = 'verified'
       and s.tenancy_id = r.tenancy_id and s.tenant_id = r.tenant_id
       and p.status = 'confirmed' and p.verified_by is not null
       and s.amount_paid >= r.new_rent
  ) then
    raise exception 'This renewal cannot be applied yet. The tenant must pay it, EboHomes must verify the bank payment, and the tenant must confirm with the code.'
      using errcode = '22023';
  end if;
  return new;
end;
$f$;
drop trigger if exists zz_renewal_apply_gate on public.renewal_applied;
create trigger zz_renewal_apply_gate before insert on public.renewal_applied
  for each row execute function public.eb_renewal_apply_gate();

-- NOTIFICATIONS (a notification problem must never block a renewal)
create or replace function public.eb_renewal_accepted_notice()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    begin
      perform public.notify_user(new.tenant_id, 'Renewal accepted. Next step: pay the renewal',
        'Open your tenancy page and send proof of the renewal payment. EboHomes must verify it before the renewal is applied.',
        '/tenancies/' || new.tenancy_id::text, 'renewal');
    exception when others then null;
    end;
  end if;
  return new;
end;
$f$;
drop trigger if exists zz_renewal_accepted_notice on public.renewals;
create trigger zz_renewal_accepted_notice after update on public.renewals
  for each row execute function public.eb_renewal_accepted_notice();

create or replace function public.eb_renewal_applied_notice()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r public.renewals;
begin
  select * into r from public.renewals where id = new.renewal_id;
  if found then
    begin
      perform public.notify_user(r.tenant_id, 'Your tenancy was renewed',
        'EboHomes applied your renewal. The new rent and end date are on your tenancy page.', '/tenancies/' || r.tenancy_id::text, 'renewal');
    exception when others then null;
    end;
    begin
      perform public.notify_user(r.landlord_id, 'Tenancy renewal applied',
        'EboHomes applied the renewal. The new rent and end date are on the tenancy page.', '/dashboard/tenancies/' || r.tenancy_id::text, 'renewal');
    exception when others then null;
    end;
  end if;
  return new;
end;
$f$;
drop trigger if exists zz_renewal_applied_notice on public.renewal_applied;
create trigger zz_renewal_applied_notice after insert on public.renewal_applied
  for each row execute function public.eb_renewal_applied_notice();

commit;

-- ROLLBACK:
--   drop trigger if exists zz_renewal_apply_gate on public.renewal_applied;
--   drop trigger if exists zz_renewal_applied_notice on public.renewal_applied;
--   drop trigger if exists zz_renewal_accepted_notice on public.renewals;
--   drop function if exists public.eb_renewal_apply_gate(), public.eb_renewal_applied_notice(), public.eb_renewal_accepted_notice();
--   drop function if exists public.eb_renewal_progress(uuid);
--   drop function if exists public.eb_submit_renewal_evidence(uuid,uuid,uuid,text,numeric,numeric,text,text,text,timestamptz,text,text,text,text,bigint,uuid,uuid);
--   (the renewal_id column can stay)