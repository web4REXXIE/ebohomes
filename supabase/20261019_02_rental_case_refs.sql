begin;

create or replace function public.enforce_application_rules()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return new;
  end if;

  if public.is_admin() then
    if tg_op = 'UPDATE'
       and new.status is distinct from old.status
       and new.status in ('approved', 'rejected') then
      new.decided_by := v_uid;
      new.decided_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.info_request is not null or new.tenant_reply is not null
       or new.decision_note is not null or new.tenant_interest_at is not null
       or coalesce(new.tenant_inspected, false)
       or new.decided_by is not null
       or new.landlord_recommendation is not null
       or new.landlord_recommendation_note is not null
       or new.landlord_recommended_at is not null then
      raise exception 'New applications cannot include workflow fields.';
    end if;
    return new;
  end if;

  if v_uid = old.landlord_id then
    if (to_jsonb(new) - array['landlord_recommendation','landlord_recommendation_note','landlord_recommended_at','updated_at'])
       is distinct from
       (to_jsonb(old) - array['landlord_recommendation','landlord_recommendation_note','landlord_recommended_at','updated_at']) then
      raise exception 'Only EboHomes can approve, decline or ask questions on an application. You can add a recommendation.';
    end if;
    if new.landlord_recommendation is distinct from old.landlord_recommendation
       or new.landlord_recommendation_note is distinct from old.landlord_recommendation_note then
      if old.status not in ('pending', 'info_requested') then
        raise exception 'This application has already been decided.';
      end if;
      new.landlord_recommended_at := now();
    else
      new.landlord_recommended_at := old.landlord_recommended_at;
    end if;
    return new;
  end if;

  if v_uid = old.tenant_id then
    if (to_jsonb(new) - array['status','tenant_reply','tenant_interest_at','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','tenant_reply','tenant_interest_at','updated_at']) then
      raise exception 'Tenants cannot change these application fields.';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'info_requested' and new.status = 'pending'
          and nullif(trim(coalesce(new.tenant_reply, '')), '') is not null)
        or (old.status in ('pending','info_requested','approved') and new.status = 'withdrawn')
      ) then
        raise exception 'Invalid status change.';
      end if;
      if new.status = 'withdrawn'
         and exists (select 1 from public.tenancies t where t.application_id = old.id) then
        raise exception 'A tenancy already exists for this application. Contact EboHomes.';
      end if;
    end if;

    if new.tenant_reply is distinct from old.tenant_reply
       and not (old.status = 'info_requested' and new.status = 'pending') then
      raise exception 'Replies are only allowed when answering a question.';
    end if;

    if new.tenant_interest_at is distinct from old.tenant_interest_at then
      if not (old.status = 'approved' and new.status = 'approved'
              and old.tenant_interest_at is null
              and new.tenant_interest_at is not null) then
        raise exception 'You can confirm interest only after EboHomes approves your application.';
      end if;
      new.tenant_interest_at := now();
    end if;
    return new;
  end if;

  raise exception 'Not allowed.';
end;
$function$;

create or replace function public.handle_tenancy_created()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.listings
  set status = 'rented'
  where id = new.listing_id;
  return new;
end;
$function$;

create or replace function public.admin_decide_application(p_application uuid, p_action text, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_listing_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only EboHomes staff can decide applications' using errcode = '42501';
  end if;
  if p_action not in ('request_info', 'approve', 'reject') then
    raise exception 'Unknown action: %', p_action;
  end if;

  select listing_id into a from public.applications where id = p_application;
  if not found then
    raise exception 'Application not found';
  end if;

  select status into v_listing_status from public.listings where id = a.listing_id for update;
  select * into a from public.applications where id = p_application for update;

  if p_action = 'request_info' then
    if a.status <> 'pending' then
      raise exception 'A question can only be sent while the application is awaiting review (current: %)', a.status;
    end if;
    if v_note is null then
      raise exception 'Write the question for the tenant';
    end if;
    update public.applications
       set status = 'info_requested', info_request = v_note, updated_at = now()
     where id = p_application;

  elsif p_action = 'approve' then
    if a.status = 'approved' then
      return;
    end if;
    if a.status <> 'pending' then
      raise exception 'Only applications awaiting review can be approved (current: %)', a.status;
    end if;
    if v_listing_status is distinct from 'approved' then
      raise exception 'This property is not open for new tenants (listing status: %)', v_listing_status;
    end if;
    if exists (
      select 1 from public.applications o
      where o.listing_id = a.listing_id and o.id <> a.id and o.status = 'approved'
    ) then
      raise exception 'Another application for this property is already approved. Decide that one first.';
    end if;
    update public.applications
       set status = 'approved', decision_note = v_note, updated_at = now()
     where id = p_application;

  else
    if a.status = 'rejected' then
      return;
    end if;
    if a.status not in ('pending', 'info_requested') then
      raise exception 'Only open applications can be declined (current: %)', a.status;
    end if;
    if v_note is null then
      raise exception 'Give the tenant a short reason';
    end if;
    update public.applications
       set status = 'rejected', decision_note = v_note, updated_at = now()
     where id = p_application;
  end if;
end;
$function$;

revoke all on function public.admin_decide_application(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_application(uuid, text, text) to authenticated;

do $$
begin
  if exists (select 1 from public.tenancies group by application_id having count(*) > 1) then
    raise notice 'SKIPPED tenancies_application_id_key: duplicate tenancies exist for one application.';
  else
    create unique index if not exists tenancies_application_id_key on public.tenancies (application_id);
  end if;

  if exists (select 1 from public.tenancies where status = 'active' group by listing_id having count(*) > 1) then
    raise notice 'SKIPPED tenancies_one_active_per_listing: a property has more than one active tenancy.';
  else
    create unique index if not exists tenancies_one_active_per_listing
      on public.tenancies (listing_id) where status = 'active';
  end if;
end $$;

commit;