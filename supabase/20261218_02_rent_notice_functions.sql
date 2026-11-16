-- Rent notice functions, captured from the live database (copied exactly).
-- Safe to re-run: create or replace with the same bodies.
-- NOT included here: the rent_notices table, its policies and the grants.
-- Those are saved in a separate file once captured.
begin;

create or replace function public.send_rent_notice(p_tenancy uuid, p_current numeric, p_new numeric, p_effective date, p_reason text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_min_days int := 30;
  v_uid uuid := auth.uid();
  v_t record;
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;
  if public.eb_tenancy_role(p_tenancy) is distinct from 'landlord' then
    raise exception 'Only the landlord of this tenancy can send a rent notice' using errcode = '42501';
  end if;

  select id, tenant_id, status into v_t from public.tenancies where id = p_tenancy;
  if not found or v_t.status is distinct from 'active' then
    raise exception 'A rent notice can only be sent for an active tenancy' using errcode = '22023';
  end if;
  if p_current is null or p_new is null or p_current <= 0 or p_new <= 0 or p_current = p_new then
    raise exception 'Enter the current rent and a different new rent' using errcode = '22023';
  end if;
  if p_effective is null or p_effective < current_date + v_min_days then
    raise exception 'The new rent must start at least % days from today', v_min_days using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'The reason is too long' using errcode = '22023';
  end if;
  if exists (select 1 from public.rent_notices
              where tenancy_id = p_tenancy and status = 'sent' and effective_date >= current_date) then
    raise exception 'There is already a notice waiting. Withdraw it first' using errcode = '22023';
  end if;

  insert into public.rent_notices (tenancy_id, created_by, current_rent, new_rent, effective_date, reason)
  values (p_tenancy, v_uid, p_current, p_new, p_effective, v_reason)
  returning id into v_id;

  perform public.notify_user(v_t.tenant_id, 'Official rent notice',
    'Your landlord sent a rent change notice through EboHomes. Open EboHomes to read it.',
    '/tenancies/' || p_tenancy::text || '/rent-notices', 'tenancy');

  return v_id;
end
$function$;

create or replace function public.acknowledge_rent_notice(p_notice uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n record;
  v_t record;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;
  select id, tenancy_id, status, acknowledged_at into v_n from public.rent_notices where id = p_notice;
  if not found then
    raise exception 'Notice not found' using errcode = '22023';
  end if;
  if public.eb_tenancy_role(v_n.tenancy_id) is distinct from 'tenant' then
    raise exception 'Only the tenant can acknowledge a rent notice' using errcode = '42501';
  end if;
  if v_n.status <> 'sent' then
    raise exception 'This notice was withdrawn' using errcode = '22023';
  end if;
  if v_n.acknowledged_at is not null then
    return;
  end if;

  update public.rent_notices set acknowledged_at = now(), acknowledged_by = v_uid where id = p_notice;

  select landlord_id into v_t from public.tenancies where id = v_n.tenancy_id;
  perform public.notify_user(v_t.landlord_id, 'Rent notice read',
    'Your tenant has read your rent notice.',
    '/dashboard/tenancies/' || v_n.tenancy_id::text || '/rent-notice', 'tenancy');
end
$function$;

create or replace function public.withdraw_rent_notice(p_notice uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n record;
  v_t record;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;
  select id, tenancy_id, status, acknowledged_at into v_n from public.rent_notices where id = p_notice;
  if not found then
    raise exception 'Notice not found' using errcode = '22023';
  end if;
  if public.eb_tenancy_role(v_n.tenancy_id) is distinct from 'landlord' then
    raise exception 'Only the landlord can withdraw a rent notice' using errcode = '42501';
  end if;
  if v_n.status <> 'sent' then
    raise exception 'This notice is already withdrawn' using errcode = '22023';
  end if;
  if v_n.acknowledged_at is not null then
    raise exception 'The tenant has already read this notice. Contact EboHomes' using errcode = '22023';
  end if;

  update public.rent_notices set status = 'withdrawn', withdrawn_at = now() where id = p_notice;

  select tenant_id into v_t from public.tenancies where id = v_n.tenancy_id;
  perform public.notify_user(v_t.tenant_id, 'Rent notice withdrawn',
    'Your landlord withdrew a rent notice. Open EboHomes to see the details.',
    '/tenancies/' || v_n.tenancy_id::text || '/rent-notices', 'tenancy');
end
$function$;

commit;

notify pgrst, 'reload schema';
