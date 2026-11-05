begin;
create or replace function public.admin_decide_landlord_verification(p_landlord uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  r record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an administrator can decide landlord verification' using errcode = '42501';
  end if;
  if p_decision not in ('verify', 'reject') then
    raise exception 'Decision must be verify or reject' using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_reason is null then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;

  select * into r from public.profiles where id = p_landlord for update;
  if not found or r.role <> 'landlord' then
    raise exception 'Landlord not found' using errcode = 'P0002';
  end if;

  -- Only a landlord who is still awaiting review can be decided.
  if r.verified is true or r.verification_status in ('verified', 'approved', 'rejected') then
    raise exception 'This landlord is not awaiting review' using errcode = '22023';
  end if;

  -- Everything required must be on file. The ownership document is optional:
  -- each property is checked separately by the property authority review.
  if coalesce(trim(r.business_name), '') = ''
     or coalesce(trim(r.business_address), '') = ''
     or coalesce(r.id_document_type, '') = ''
     or r.id_document_url is null
     or r.selfie_url is null
     or (r.account_type = 'company'
         and (coalesce(trim(r.cac_number), '') = ''
              or coalesce(trim(r.representative_name), '') = ''
              or coalesce(trim(r.representative_role), '') = '')) then
    raise exception 'This landlord has not submitted every required item' using errcode = '22023';
  end if;

  if p_decision = 'verify' then
    update public.profiles
       set verification_status = 'verified', verified = true, rejection_reason = null
     where id = p_landlord;
  else
    update public.profiles
       set verification_status = 'rejected', verified = false, rejection_reason = v_reason
     where id = p_landlord;
  end if;

  return jsonb_build_object('ok', true, 'landlord_id', p_landlord,
    'status', case when p_decision = 'verify' then 'verified' else 'rejected' end);
end $f$;
commit;
-- ROLLBACK: re-run the same function with "or r.ownership_doc_url is null" added back after the selfie_url line.
