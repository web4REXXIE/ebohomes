-- Listing freshness functions, captured from the live database.
-- Safe to re-run. Day 10 without confirmation: reminder. Day 14: paused (never while an application is open).
begin;

alter table public.listings
  add column if not exists availability_reminded_at timestamptz;

create or replace function public.confirm_listing_available(p_listing uuid)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_l record;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;

  select id, landlord_id, status, freshness_paused_at into v_l from public.listings where id = p_listing;
  if not found or v_l.landlord_id is distinct from v_uid then
    raise exception 'This is not your listing' using errcode = '42501';
  end if;
  if v_l.status not in ('approved', 'paused') then
    raise exception 'This listing is not live, so it cannot be confirmed' using errcode = '22023';
  end if;

  if v_l.status = 'paused' then
    -- Only resume a listing the freshness check paused. A listing the landlord paused on purpose stays paused.
    if v_l.freshness_paused_at is null then
      raise exception 'This listing is paused. Use Resume on My Properties' using errcode = '22023';
    end if;
    update public.listings set status = 'approved' where id = p_listing;  -- trigger resets the dates
  else
    update public.listings
       set availability_confirmed_at = v_now, availability_reminded_at = null
     where id = p_listing;
  end if;
  return v_now;
end
$function$;

create or replace function public.eb_sweep_listing_freshness()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_reminded int := 0;
  v_paused int := 0;
begin
  for r in
    select l.id, l.landlord_id, l.title
      from public.listings l
     where l.status = 'approved'
       and l.landlord_id is not null
       and l.availability_confirmed_at <= now() - interval '10 days'
       and l.availability_confirmed_at > now() - interval '14 days'
       and (l.availability_reminded_at is null or l.availability_reminded_at < l.availability_confirmed_at)
  loop
    update public.listings set availability_reminded_at = now() where id = r.id;
    perform public.notify_user(r.landlord_id, 'Is your property still available?',
      'Confirm that ' || coalesce(nullif(btrim(r.title), ''), 'your property') ||
      ' is still available. If you do not, it will be paused in about 4 days.',
      '/dashboard/listings', 'application');
    v_reminded := v_reminded + 1;
  end loop;

  for r in
    select l.id, l.landlord_id, l.title
      from public.listings l
     where l.status = 'approved'
       and l.landlord_id is not null
       and l.availability_confirmed_at <= now() - interval '14 days'
       and not exists (
         select 1 from public.applications a
          where a.listing_id = l.id and a.status in ('pending', 'info_requested', 'approved')
       )
  loop
    update public.listings set status = 'paused', freshness_paused_at = now() where id = r.id;
    perform public.notify_user(r.landlord_id, 'Your listing was paused',
      coalesce(nullif(btrim(r.title), ''), 'Your property') ||
      ' was paused because you did not confirm it is still available. Confirm to put it back on the market.',
      '/dashboard/listings', 'application');
    v_paused := v_paused + 1;
  end loop;

  return jsonb_build_object('reminded', v_reminded, 'paused', v_paused);
end
$function$;

commit;

notify pgrst, 'reload schema';
