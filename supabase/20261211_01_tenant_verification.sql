begin;

-- 1) Admin decision for a tenant (same pattern as the landlord decision).
create or replace function public.admin_decide_tenant_verification(
  p_tenant uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  r record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an administrator can decide tenant verification' using errcode = '42501';
  end if;
  if p_decision not in ('verify', 'reject') then
    raise exception 'Decision must be verify or reject' using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_reason is null then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;

  select * into r from public.profiles where id = p_tenant for update;
  if not found or r.role is distinct from 'tenant' then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  if r.verified is true or r.verification_status in ('verified', 'rejected') then
    raise exception 'This tenant is not awaiting review' using errcode = '22023';
  end if;

  if coalesce(r.id_document_type, '') = ''
     or r.id_document_url is null
     or r.selfie_url is null
     or coalesce(trim(r.full_name), '') = '' then
    raise exception 'This tenant has not submitted every required item' using errcode = '22023';
  end if;

  if p_decision = 'verify' then
    update public.profiles
       set verification_status = 'verified', verified = true, rejection_reason = null
     where id = p_tenant;
  else
    update public.profiles
       set verification_status = 'rejected', verified = false, rejection_reason = v_reason
     where id = p_tenant;
  end if;

  return jsonb_build_object('ok', true, 'tenant_id', p_tenant,
    'status', case when p_decision = 'verify' then 'verified' else 'rejected' end);
end $f$;

revoke all on function public.admin_decide_tenant_verification(uuid, text, text) from public;
grant execute on function public.admin_decide_tenant_verification(uuid, text, text) to authenticated;

-- 2) One submission only: once a tenant's ID and selfie are on file, they cannot be
--    swapped while the account is waiting or verified. A rejected tenant can send new ones.
create or replace function public.profiles_tenant_pending_file_lock()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if old.role is distinct from 'tenant' then return new; end if;
  if not (old.id_document_type is distinct from new.id_document_type
       or old.id_document_url is distinct from new.id_document_url
       or old.selfie_url is distinct from new.selfie_url) then
    return new;
  end if;
  if coalesce(old.verification_status, 'pending') = 'rejected' then return new; end if;

  if coalesce(old.id_document_type, '') <> ''
     and old.id_document_url is not null
     and old.selfie_url is not null then
    raise exception 'Your ID has already been submitted to EboHomes. It cannot be changed while it is waiting or verified.' using errcode = '22023';
  end if;
  return new;
end $f$;

drop trigger if exists a06b_profiles_tenant_pending_file_lock on public.profiles;
create trigger a06b_profiles_tenant_pending_file_lock before update on public.profiles
  for each row execute function public.profiles_tenant_pending_file_lock();

commit;
-- ROLLBACK: drop trigger if exists a06b_profiles_tenant_pending_file_lock on public.profiles;
--           drop function if exists public.profiles_tenant_pending_file_lock();
--           drop function if exists public.admin_decide_tenant_verification(uuid, text, text);
