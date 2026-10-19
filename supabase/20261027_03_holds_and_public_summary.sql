-- 1. Reviewed public summary
alter table public.property_inspections add column if not exists public_summary text;
alter table public.property_inspections drop constraint if exists property_inspections_public_summary_len;
alter table public.property_inspections add constraint property_inspections_public_summary_len
  check (public_summary is null or char_length(public_summary) <= 600);

-- 2. Guard v3: summary is admin-only, required to approve, editable by admins without touching evidence
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
      new.public_summary := null;
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
     and (to_jsonb(new) - array['review_status','reviewed_by','reviewed_at','review_note','public_summary'])
         is distinct from
         (to_jsonb(old) - array['review_status','reviewed_by','reviewed_at','review_note','public_summary']) then
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
    if new.review_status = 'approved'
       and nullif(btrim(coalesce(new.public_summary, '')), '') is null then
      raise exception 'A public summary is required to approve an inspection' using errcode = '23514';
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

-- 3. Audit v3: also log public-summary edits
create or replace function public.property_inspections_review_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.review_status is distinct from old.review_status then
    perform public.audit_write(
      'inspection_' || new.review_status, 'inspection', new.id,
      jsonb_build_object('review_status', old.review_status, 'verdict', old.verdict, 'listing_id', old.listing_id),
      jsonb_build_object('review_status', new.review_status, 'verdict', new.verdict, 'listing_id', new.listing_id, 'reviewed_by', new.reviewed_by),
      new.review_note);
  end if;
  if new.public_summary is distinct from old.public_summary then
    perform public.audit_write(
      'inspection_summary_edited', 'inspection', new.id,
      jsonb_build_object('had_summary', old.public_summary is not null),
      jsonb_build_object('has_summary', new.public_summary is not null),
      null);
  end if;
  return new;
end;
$function$;

-- 4. Review RPC v2: takes the public summary, required to approve
drop function if exists public.admin_review_inspection(uuid, text, text);
create or replace function public.admin_review_inspection(
  p_inspection_id uuid,
  p_decision text,
  p_note text default null,
  p_public_summary text default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_insp public.property_inspections%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_sum text := nullif(btrim(coalesce(p_public_summary, '')), '');
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
  if p_decision = 'approved' and v_sum is null then
    raise exception 'A public summary is required to approve an inspection' using errcode = '23514';
  end if;
  update public.property_inspections
     set review_status = p_decision,
         review_note = v_note,
         public_summary = case when p_decision = 'approved' then v_sum else public_summary end
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

revoke all on function public.admin_review_inspection(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_inspection(uuid, text, text, text) to authenticated;

-- 5. Property holds (history kept, admin-only)
create table if not exists public.property_holds (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) > 0),
  placed_by uuid references public.profiles(id),
  placed_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id),
  release_note text
);
create unique index if not exists property_holds_one_active
  on public.property_holds (property_id) where released_at is null;
alter table public.property_holds enable row level security;
revoke all on public.property_holds from anon, authenticated, public;
grant select on public.property_holds to authenticated;
drop policy if exists "Admins read holds" on public.property_holds;
create policy "Admins read holds" on public.property_holds
  for select to authenticated using (public.is_admin());

create or replace function public.listing_on_hold(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.listings l
    join public.property_holds h on h.property_id = l.property_id and h.released_at is null
    where l.id = p_listing
  );
$function$;
revoke all on function public.listing_on_hold(uuid) from public;
grant execute on function public.listing_on_hold(uuid) to anon, authenticated;

create or replace function public.admin_place_property_hold(p_public_id text, p_reason text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prop uuid;
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only an administrator can place a hold' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A reason is required' using errcode = '23514';
  end if;
  select id into v_prop from public.properties where public_id = upper(btrim(p_public_id));
  if v_prop is null then
    return 'No property found with that reference.';
  end if;
  begin
    insert into public.property_holds (property_id, reason, placed_by)
    values (v_prop, v_reason, auth.uid()) returning id into v_id;
  exception when unique_violation then
    return 'This property is already on hold.';
  end;
  perform public.audit_write('property_hold_placed', 'property', v_prop, null,
                             jsonb_build_object('hold_id', v_id), v_reason);
  return 'ok';
end;
$function$;

create or replace function public.admin_release_property_hold(p_hold_id uuid, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prop uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only an administrator can release a hold' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'A note is required to release a hold' using errcode = '23514';
  end if;
  update public.property_holds
     set released_at = now(), released_by = auth.uid(), release_note = v_note
   where id = p_hold_id and released_at is null
   returning property_id into v_prop;
  if not found then
    return 'That hold does not exist or is already released.';
  end if;
  perform public.audit_write('property_hold_released', 'property', v_prop, null,
                             jsonb_build_object('hold_id', p_hold_id), v_note);
  return 'ok';
end;
$function$;

revoke all on function public.admin_place_property_hold(text, text) from public, anon;
revoke all on function public.admin_release_property_hold(uuid, text) from public, anon;
grant execute on function public.admin_place_property_hold(text, text) to authenticated;
grant execute on function public.admin_release_property_hold(uuid, text) to authenticated;

-- 6. A hold blocks NEW applications, viewings and tenancies only.
--    Existing tenancies, payments and updates are not touched.
create or replace function public.block_new_activity_on_hold()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_listing uuid;
begin
  if auth.uid() is null or coalesce(public.is_admin(), false) then
    return new;
  end if;
  v_listing := nullif(to_jsonb(new)->>'listing_id', '')::uuid;
  if v_listing is not null and public.listing_on_hold(v_listing) then
    raise exception 'This property is currently on hold and cannot take new applications, viewings or tenancies.'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;
revoke execute on function public.block_new_activity_on_hold() from public, anon, authenticated;

drop trigger if exists a20_block_on_hold on public.applications;
create trigger a20_block_on_hold before insert on public.applications
  for each row execute function public.block_new_activity_on_hold();
drop trigger if exists a20_block_on_hold on public.tenancies;
create trigger a20_block_on_hold before insert on public.tenancies
  for each row execute function public.block_new_activity_on_hold();
drop trigger if exists a20_block_on_hold on public.viewings;
create trigger a20_block_on_hold before insert on public.viewings
  for each row execute function public.block_new_activity_on_hold();

-- 7. Public view: stale and held inspections hidden; free text only after a reviewed summary
create or replace view public.public_listing_inspections as
select pi.listing_id,
       pi.inspected_at,
       case when pi.public_summary is not null then pi.road_condition end as road_condition,
       pi.road_matches,
       case when pi.public_summary is not null then pi.water_source end as water_source,
       pi.water_matches,
       case when pi.public_summary is not null then pi.electricity_notes end as electricity_notes,
       pi.electricity_matches,
       case when pi.public_summary is not null then pi.network_notes end as network_notes,
       pi.network_matches,
       case when pi.public_summary is not null then pi.security_notes end as security_notes,
       pi.security_matches,
       case when pi.public_summary is not null then pi.neighborhood_type end as neighborhood_type,
       case when pi.public_summary is not null then pi.nearby_landmarks end as nearby_landmarks,
       case when pi.public_summary is not null then pi.environment_notes end as environment_notes,
       pi.environment_matches,
       case when pi.public_summary is not null then pi.condition_notes end as condition_notes,
       pi.condition_matches,
       pi.public_summary as overall_notes
from public.property_inspections pi
join public.listings l on l.id = pi.listing_id
where pi.review_status = 'approved'
  and coalesce(pi.verdict, 'pass') = 'pass'
  and (l.material_changed_at is null or pi.inspected_at >= l.material_changed_at)
  and not public.listing_on_hold(pi.listing_id);

revoke insert, update, delete, truncate, references, trigger
  on public.public_listing_inspections from anon, authenticated, public;
grant select on public.public_listing_inspections to anon, authenticated;