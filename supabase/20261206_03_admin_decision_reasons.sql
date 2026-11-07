-- EboHomes 20261206_03 (Phase 11.5)  *** PROPOSED. NOT EXECUTED. ***
-- WHY: policy says every decision records who, when and why. Approve had an optional note.
-- WHAT: admin_decide_application now needs a reason (5 to 600 chars) for approve, reject and request_info.
-- ROLLBACK: re-run the original function from 20261019_02_rental_case_refs.sql.
begin;

create or replace function public.admin_decide_application(p_application uuid, p_action text, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_listing_status text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only EboHomes staff can decide applications' using errcode = '42501';
  end if;
  if p_action not in ('request_info', 'approve', 'reject') then
    raise exception 'Unknown action: %', p_action;
  end if;
  if v_note is null or char_length(v_note) < 5 then
    raise exception 'Write a reason of at least 5 characters. Every decision records why.' using errcode = '22023';
  end if;
  if char_length(v_note) > 600 then
    raise exception 'Keep the note under 600 characters.' using errcode = '22023';
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
    update public.applications
       set status = 'rejected', decision_note = v_note, updated_at = now()
     where id = p_application;
  end if;
end;
$function$;

revoke all on function public.admin_decide_application(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_application(uuid, text, text) to authenticated;

commit;
