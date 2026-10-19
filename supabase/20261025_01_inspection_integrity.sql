-- 20261025_01_inspection_integrity.sql
-- 1. Inspection guard: only PASS can be approved, evidence is frozen after submission,
--    allowed status moves are fixed, a note is required to reject.
create or replace function public.property_inspections_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if not coalesce(public.is_admin(), false) then
        new.inspected_by := auth.uid();
        new.inspected_at := now();
      end if;
      new.review_status := 'submitted';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    if new.job_id is not null then
      update inspection_jobs set status = 'submitted' where id = new.job_id;
    end if;
    return new;
  end if;

  if auth.uid() is not null and not coalesce(public.is_admin(), false) then
    raise exception 'Only a reviewer can change an inspection' using errcode = '42501';
  end if;

  if auth.uid() is not null
     and (to_jsonb(new) - array['review_status','reviewed_by','reviewed_at','review_note'])
         is distinct from
         (to_jsonb(old) - array['review_status','reviewed_by','reviewed_at','review_note']) then
    raise exception 'Submitted inspection evidence cannot be edited' using errcode = '42501';
  end if;

  if new.review_status is not distinct from old.review_status then
    if auth.uid() is not null
       and (new.reviewed_by is distinct from old.reviewed_by
            or new.reviewed_at is distinct from old.reviewed_at
            or new.review_note is distinct from old.review_note) then
      raise exception 'Review details change only together with a decision' using errcode = '42501';
    end if;
    return new;
  end if;

  if auth.uid() is not null
     and not ((old.review_status = 'submitted' and new.review_status in ('approved','rejected','reinspect'))
              or (old.review_status = 'approved' and new.review_status = 'rejected')) then
    raise exception 'An inspection cannot move from % to %', old.review_status, new.review_status
      using errcode = '42501';
  end if;

  if new.review_status in ('approved','rejected','reinspect') then
    if auth.uid() is not null and new.inspected_by = auth.uid() then
      raise exception 'You cannot review your own inspection' using errcode = '42501';
    end if;
    if new.review_status = 'approved' and new.verdict is distinct from 'pass' then
      raise exception 'Only an inspection with a PASS verdict can be approved' using errcode = '42501';
    end if;
    if new.review_status in ('rejected','reinspect')
       and nullif(btrim(coalesce(new.review_note, '')), '') is null then
      raise exception 'A note is required to reject an inspection or ask for another one' using errcode = '23514';
    end if;
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
    new.reviewed_at := now();
    if new.job_id is not null then
      update inspection_jobs set status = 'reviewed' where id = new.job_id;
    end if;
  end if;
  return new;
end;
$function$;

-- 2. Audit log entry for every review decision
create or replace function public.property_inspections_review_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.review_status is distinct from old.review_status then
    insert into public.audit_events
      (actor_id, actor_role, action, object_type, object_id, reason, previous_state, new_state)
    values (
      auth.uid(),
      case when auth.uid() is null then 'system' else 'admin' end,
      'inspection_' || new.review_status,
      'property_inspection',
      new.id,
      new.review_note,
      jsonb_build_object('review_status', old.review_status, 'verdict', old.verdict, 'listing_id', old.listing_id),
      jsonb_build_object('review_status', new.review_status, 'verdict', new.verdict, 'listing_id', new.listing_id, 'reviewed_by', new.reviewed_by)
    );
  end if;
  return new;
end;
$function$;drop trigger if exists zz_audit_inspection_review on public.property_inspections;
create trigger zz_audit_inspection_review
  after update on public.property_inspections
  for each row execute function public.property_inspections_review_audit();

-- 3. One atomic call for approve / reject / ask for another inspection
create or replace function public.admin_review_inspection(
  p_inspection_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_insp public.property_inspections%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only a reviewer can review an inspection' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected','reinspect') then
    raise exception 'Unknown decision: %', p_decision using errcode = '22023';
  end if;
  select * into v_insp from public.property_inspections where id = p_inspection_id for update;
  if not found then
    raise exception 'Inspection not found' using errcode = 'P0002';
  end if;
  update public.property_inspections
     set review_status = p_decision, review_note = v_note
   where id = p_inspection_id;
  if p_decision = 'approved' then
    update public.listings set status = 'pending'
     where id = v_insp.listing_id and status = 'inspection_required';
  elsif p_decision = 'reinspect' then
    insert into public.inspection_jobs (listing_id, reason, needs_second_inspector, created_by)
    values (v_insp.listing_id, 'reinspection', true, auth.uid());
  end if;
  return 'ok';
end;
$function$;

revoke all on function public.admin_review_inspection(uuid, text, text) from public, anon;
grant execute on function public.admin_review_inspection(uuid, text, text) to authenticated;

-- 4. Re-review guard: also covers paused listings and more fields,
--    so pause -> edit -> resume no longer skips review.
create or replace function public.listings_reedit_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if old.status in ('approved','paused') and new.status in ('approved','paused')
     and (new.price_monthly is distinct from old.price_monthly
          or new.price_yearly is distinct from old.price_yearly
          or new.rent is distinct from old.rent
          or new.location_text is distinct from old.location_text
          or new.lat is distinct from old.lat
          or new.lng is distinct from old.lng
          or new.description is distinct from old.description
          or new.property_type is distinct from old.property_type
          or new.bedrooms is distinct from old.bedrooms
          or new.bedroom_count is distinct from old.bedroom_count
          or new.bathrooms is distinct from old.bathrooms
          or new.toilets is distinct from old.toilets
          or new.property_id is distinct from old.property_id
          or new.photos is distinct from old.photos
          or new.video_url is distinct from old.video_url) then
    new.status := 'pending';
  end if;
  return new;
end;
$function$;