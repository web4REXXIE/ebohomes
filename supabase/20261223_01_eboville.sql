-- EboVille 20261223_01: Lodge Level points, your room items, meeting RSVPs and the in-app meeting room. Additive only.
-- NEEDS: 20261216_01 (eb_my_unit, neighbour_knocks) and 20261222_01 (lodge board) to be run first.
-- PRIVACY: no names. Owner shows as "Management", residents as "Unit 1A". Phone numbers are blocked in meeting chat.
-- POINTS: knocks sent 1 each, posts 3, poll votes 1, meeting RSVPs 2, meeting rooms joined 1.
--         One person counts for at most 100 points toward the lodge, so no single person can run up the level.
-- NOT COUNTED YET: "Light dey" reports (that table is not in this file set). Tell me its name and I add it.
-- DOES NOT: touch listings, applications, tenancies, payments or existing policies. Safe to re-run. ROLLBACK at the bottom.

begin;

do $$
begin
  if to_regclass('public.lodge_posts') is null or to_regclass('public.neighbour_knocks') is null then
    raise exception 'Run 20261216_01 and 20261222_01 first';
  end if;
  if to_regprocedure('public.eb_lodge_role(uuid,uuid)') is null or to_regprocedure('public.eb_lodge_has_phone(text)') is null then
    raise exception 'Run 20261222_01 first (lodge board functions are missing)';
  end if;
end $$;

-- Who said they will come to a meeting.
create table if not exists public.lodge_meeting_rsvps (
  post_id uuid not null references public.lodge_posts(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- The text room of a meeting. It lives inside EboHomes. No outside links, no phone numbers.
create table if not exists public.lodge_meeting_messages (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.lodge_posts(id) on delete cascade,
  user_id uuid not null,
  author_label text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists lodge_meeting_messages_idx on public.lodge_meeting_messages (post_id, created_at);

alter table public.lodge_meeting_rsvps enable row level security;
alter table public.lodge_meeting_messages enable row level security;
revoke all on public.lodge_meeting_rsvps, public.lodge_meeting_messages from anon, authenticated, public;

-- Internal: one person's points in one building.
create or replace function public.eb_ville_points(p_estate uuid, p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    (select count(*) from public.neighbour_knocks k where k.estate_id = p_estate and k.from_user = p_user)::int * 1
  + (select count(*) from public.lodge_posts p where p.estate_id = p_estate and p.author_id = p_user)::int * 3
  + (select count(*) from public.lodge_poll_votes v join public.lodge_posts p on p.id = v.post_id where p.estate_id = p_estate and v.user_id = p_user)::int * 1
  + (select count(*) from public.lodge_meeting_rsvps r join public.lodge_posts p on p.id = r.post_id where p.estate_id = p_estate and r.user_id = p_user)::int * 2
  + (select count(distinct m.post_id) from public.lodge_meeting_messages m join public.lodge_posts p on p.id = m.post_id where p.estate_id = p_estate and m.user_id = p_user)::int * 1
$fn$;
revoke all on function public.eb_ville_points(uuid, uuid) from public, anon, authenticated;

-- The numbers for the town: lodge points, how many live here, how many took part in the last 30 days, my points.
create or replace function public.eboville_summary(p_estate uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_residents int;
  v_active int;
  v_lodge int;
  v_my int := 0;
  v_label text := null;
  v_unit uuid;
begin
  if v_uid is null then
    return jsonb_build_object('role', null);
  end if;
  v_role := public.eb_lodge_role(p_estate, v_uid);
  if v_role is null then
    return jsonb_build_object('role', null);
  end if;

  select count(distinct t.tenant_id)::int into v_residents
    from public.units u
    join public.tenancies t on t.listing_id = u.listing_id and t.status = 'active'
   where u.estate_id = p_estate;

  with people as (
    select from_user as uid from public.neighbour_knocks where estate_id = p_estate
    union select author_id from public.lodge_posts where estate_id = p_estate
    union select v.user_id from public.lodge_poll_votes v join public.lodge_posts p on p.id = v.post_id where p.estate_id = p_estate
    union select r.user_id from public.lodge_meeting_rsvps r join public.lodge_posts p on p.id = r.post_id where p.estate_id = p_estate
    union select m.user_id from public.lodge_meeting_messages m join public.lodge_posts p on p.id = m.post_id where p.estate_id = p_estate
  )
  select coalesce(sum(least(public.eb_ville_points(p_estate, uid), 100)), 0)::int into v_lodge from people;

  with recent as (
    select from_user as uid from public.neighbour_knocks where estate_id = p_estate and created_at > now() - interval '30 days'
    union select author_id from public.lodge_posts where estate_id = p_estate and created_at > now() - interval '30 days'
    union select v.user_id from public.lodge_poll_votes v join public.lodge_posts p on p.id = v.post_id where p.estate_id = p_estate and v.created_at > now() - interval '30 days'
    union select r.user_id from public.lodge_meeting_rsvps r join public.lodge_posts p on p.id = r.post_id where p.estate_id = p_estate and r.created_at > now() - interval '30 days'
    union select m.user_id from public.lodge_meeting_messages m join public.lodge_posts p on p.id = m.post_id where p.estate_id = p_estate and m.created_at > now() - interval '30 days'
  )
  select count(*)::int into v_active from recent;

  v_my := public.eb_ville_points(p_estate, v_uid);
  if v_role = 'resident' then
    v_unit := public.eb_my_unit(p_estate, v_uid);
    select unit_label into v_label from public.units where id = v_unit;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'lodge_points', v_lodge,
    'residents', coalesce(v_residents, 0),
    'active_residents', coalesce(v_active, 0),
    'my_points', v_my,
    'my_unit_label', v_label
  );
end
$fn$;
revoke all on function public.eboville_summary(uuid) from public, anon;
grant execute on function public.eboville_summary(uuid) to authenticated;

-- Meetings that are coming up (or finished less than 6 hours ago), for the Meeting hall in the town.
create or replace function public.lodge_upcoming_meetings(p_estate uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null or public.eb_lodge_role(p_estate, v_uid) is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(x.row order by x.at), '[]'::jsonb) into v_out
  from (
    select p.meeting_at as at,
      jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'meeting_at', p.meeting_at,
        'going', (select count(*) from public.lodge_meeting_rsvps r where r.post_id = p.id),
        'my_going', exists (select 1 from public.lodge_meeting_rsvps r where r.post_id = p.id and r.user_id = v_uid)
      ) as row
    from public.lodge_posts p
    where p.estate_id = p_estate and p.kind = 'meeting' and p.hidden_at is null
      and p.meeting_at > now() - interval '6 hours'
    order by p.meeting_at
    limit 5
  ) x;
  return v_out;
end
$fn$;
revoke all on function public.lodge_upcoming_meetings(uuid) from public, anon;
grant execute on function public.lodge_upcoming_meetings(uuid) to authenticated;

-- Say "I'll come" (or take it back).
create or replace function public.lodge_meeting_rsvp(p_post uuid, p_going boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_p record;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;
  select id, estate_id, kind, hidden_at, meeting_at into v_p from public.lodge_posts where id = p_post;
  if not found or v_p.kind <> 'meeting' or v_p.hidden_at is not null then
    raise exception 'That meeting was not found' using errcode = '22023';
  end if;
  if public.eb_lodge_role(v_p.estate_id, v_uid) is null then
    raise exception 'Only the owner and people who live here can reply' using errcode = '42501';
  end if;
  if p_going then
    if v_p.meeting_at < now() - interval '6 hours' then
      raise exception 'This meeting is over' using errcode = '22023';
    end if;
    insert into public.lodge_meeting_rsvps (post_id, user_id) values (p_post, v_uid) on conflict do nothing;
  else
    delete from public.lodge_meeting_rsvps where post_id = p_post and user_id = v_uid;
  end if;
end
$fn$;
revoke all on function public.lodge_meeting_rsvp(uuid, boolean) from public, anon;
grant execute on function public.lodge_meeting_rsvp(uuid, boolean) to authenticated;

-- Everything the meeting room page needs. The text room is open from 30 minutes before to 6 hours after the start.
create or replace function public.lodge_meeting_room(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_p record;
  v_role text;
  v_msgs jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('role', null);
  end if;
  select id, estate_id, kind, title, body, meeting_at, hidden_at into v_p from public.lodge_posts where id = p_post;
  if not found or v_p.kind <> 'meeting' or v_p.hidden_at is not null then
    return jsonb_build_object('role', null);
  end if;
  v_role := public.eb_lodge_role(v_p.estate_id, v_uid);
  if v_role is null then
    return jsonb_build_object('role', null);
  end if;

  select coalesce(jsonb_agg(x.row order by x.at), '[]'::jsonb) into v_msgs
  from (
    select m.created_at as at,
      jsonb_build_object('id', m.id, 'author', m.author_label, 'body', m.body, 'created_at', m.created_at, 'mine', m.user_id = v_uid) as row
    from public.lodge_meeting_messages m
    where m.post_id = p_post
    order by m.created_at desc
    limit 60
  ) x;

  return jsonb_build_object(
    'role', v_role,
    'title', v_p.title,
    'body', v_p.body,
    'meeting_at', v_p.meeting_at,
    'going', (select count(*) from public.lodge_meeting_rsvps r where r.post_id = p_post),
    'my_going', exists (select 1 from public.lodge_meeting_rsvps r where r.post_id = p_post and r.user_id = v_uid),
    'open', now() >= v_p.meeting_at - interval '30 minutes' and now() <= v_p.meeting_at + interval '6 hours',
    'messages', v_msgs
  );
end
$fn$;
revoke all on function public.lodge_meeting_room(uuid) from public, anon;
grant execute on function public.lodge_meeting_room(uuid) to authenticated;

-- Send a line in the meeting room.
create or replace function public.lodge_meeting_say(p_post uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_p record;
  v_role text;
  v_body text := btrim(coalesce(p_body, ''));
  v_label text;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;
  select id, estate_id, kind, meeting_at, hidden_at into v_p from public.lodge_posts where id = p_post;
  if not found or v_p.kind <> 'meeting' or v_p.hidden_at is not null then
    raise exception 'That meeting was not found' using errcode = '22023';
  end if;
  v_role := public.eb_lodge_role(v_p.estate_id, v_uid);
  if v_role is null then
    raise exception 'Only the owner and people who live here can talk in the meeting' using errcode = '42501';
  end if;
  if not (now() >= v_p.meeting_at - interval '30 minutes' and now() <= v_p.meeting_at + interval '6 hours') then
    raise exception 'The meeting room is not open now' using errcode = '22023';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 300 then
    raise exception 'Write between 1 and 300 letters' using errcode = '22023';
  end if;
  if public.eb_lodge_has_phone(v_body) then
    raise exception 'Please do not share phone numbers here' using errcode = '22023';
  end if;
  if v_body ~* '(https?://|www\.)' then
    raise exception 'Outside links are not allowed. Everything stays inside EboHomes.' using errcode = '22023';
  end if;
  if (select count(*) from public.lodge_meeting_messages where post_id = p_post and user_id = v_uid) >= 40 then
    raise exception 'That is enough messages for this meeting' using errcode = '22023';
  end if;
  if exists (select 1 from public.lodge_meeting_messages where post_id = p_post and user_id = v_uid and created_at > now() - interval '2 seconds') then
    raise exception 'Slow down a little' using errcode = '22023';
  end if;

  if v_role = 'owner' then
    v_label := 'Management';
  else
    select 'Unit ' || u.unit_label into v_label from public.units u where u.id = public.eb_my_unit(v_p.estate_id, v_uid);
  end if;

  insert into public.lodge_meeting_messages (post_id, user_id, author_label, body)
  values (p_post, v_uid, coalesce(v_label, 'A neighbour'), v_body);
end
$fn$;
revoke all on function public.lodge_meeting_say(uuid, text) from public, anon;
grant execute on function public.lodge_meeting_say(uuid, text) to authenticated;

commit;

-- CHECK (read only): expect tables_2 = 2, functions_6 = 6.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('lodge_meeting_rsvps', 'lodge_meeting_messages')) as tables_2,
  (select count(*) from pg_proc where proname in ('eb_ville_points', 'eboville_summary', 'lodge_upcoming_meetings', 'lodge_meeting_rsvp', 'lodge_meeting_room', 'lodge_meeting_say')) as functions_6;

-- ROLLBACK (only if needed):
-- drop function if exists public.lodge_meeting_say(uuid, text);
-- drop function if exists public.lodge_meeting_room(uuid);
-- drop function if exists public.lodge_meeting_rsvp(uuid, boolean);
-- drop function if exists public.lodge_upcoming_meetings(uuid);
-- drop function if exists public.eboville_summary(uuid);
-- drop function if exists public.eb_ville_points(uuid, uuid);
-- drop table if exists public.lodge_meeting_messages;
-- drop table if exists public.lodge_meeting_rsvps;
