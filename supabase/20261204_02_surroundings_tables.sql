-- EboHomes 20261204_02: Phase 10.5 Step A2 - surroundings facts (storage of facts only).
-- WHAT: one row per observed fact about a property's surroundings (road, drainage, flooding, lighting, noise, utilities,
--       visible security, nearby facilities), each with its SOURCE, server DATE, review status and context; an append-only
--       history; a setting for when a fact counts as old; a topic tag for inspection photos.
-- RULES: facts are observations, never proof. The original wording of a fact never changes. A correction adds a new row
--       and marks the old one superseded. Distances are straight-line only and say so.
-- DOES NOT: change any existing row or policy, or show anything to the public (Step B adds the public view).
--       No function writes here yet; browsers cannot write at all.
-- REQUIRES: 20261203_01 (eb_inspection_history_immutable, inspection_evidence_files) and public.is_admin().
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. allowed answers per category (fixed choices, no free-text verdicts)
create or replace function public.eb_surroundings_answer_ok(p_cat text, p_ans text)
returns boolean language sql immutable
as $f$
  select case p_cat
    when 'road_access'          then p_ans in ('tarred','untarred_good','untarred_rough','footpath_only')
    when 'road_surface'         then p_ans in ('good','fair','poor')
    when 'vehicle_access'       then p_ans in ('car_to_gate','car_nearby','motorbike_only','foot_only')
    when 'rainy_season_access'  then p_ans in ('passable','difficult','not_passable','not_observed')
    when 'street_lighting'      then p_ans in ('working','partial','none_seen')
    when 'drainage'             then p_ans in ('covered_working','open_working','blocked_or_poor','none_seen')
    when 'flooding'             then p_ans in ('no_signs_seen','signs_seen','reported_by_person_met')
    when 'noise'                then p_ans in ('quiet','moderate','loud')
    when 'water'                then p_ans in ('available','unreliable','none_seen')
    when 'electricity'          then p_ans in ('available','unreliable','none_seen')
    when 'network'              then p_ans in ('strong','weak','none')
    when 'visible_security'     then p_ans in ('gate_or_fence','guard_post_seen','both_seen','none_seen')
    when 'facility_school'      then p_ans = 'recorded'
    when 'facility_hospital'    then p_ans = 'recorded'
    when 'facility_market'      then p_ans = 'recorded'
    when 'facility_transport'   then p_ans = 'recorded'
    when 'facility_shopping'    then p_ans = 'recorded'
    when 'landmark'             then p_ans = 'recorded'
    else false
  end
$f$;

-- ============================================================ 2. settings: when a fact counts as old
create table if not exists public.surroundings_settings (
  id boolean primary key default true check (id),
  stale_months int not null default 12 check (stale_months between 1 and 60),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.surroundings_settings (id) values (true) on conflict do nothing;

-- ============================================================ 3. facts
-- No foreign keys on purpose (same as inspection evidence): deleting a listing must not erase or be blocked by its history.
create table if not exists public.listing_surroundings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  category text not null,
  answer text not null,
  name text check (name is null or char_length(btrim(name)) between 2 and 120),     -- facility or landmark name
  facility_lat double precision,                                                     -- facility position, if the inspector recorded it
  facility_lng double precision,
  distance_m numeric check (distance_m is null or distance_m >= 0),                  -- straight line from the listing pin when it was computed
  distance_method text check (distance_method is null or distance_method = 'straight_line'),
  distance_computed_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  context text check (context is null or char_length(context) <= 150),               -- e.g. time of day, weather when observed
  source text not null check (source in ('landlord','inspector','admin')),
  recorded_by uuid not null,
  inspection_id uuid,
  job_id uuid,
  observed_at timestamptz not null default now(),                                    -- server time, never the device clock
  review_status text not null default 'pending' check (review_status in ('pending','published','flagged','withdrawn','superseded')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  supersedes_id uuid,
  superseded_by uuid,
  created_at timestamptz not null default now(),
  constraint listing_surroundings_answer_chk check (public.eb_surroundings_answer_ok(category, answer)),
  constraint listing_surroundings_name_chk check ((category not like 'facility\_%' and category <> 'landmark') or name is not null),
  constraint listing_surroundings_pin_chk check (
    (facility_lat is null and facility_lng is null)
    or (facility_lat between 4 and 14 and facility_lng between 2.5 and 15)),
  constraint listing_surroundings_distance_chk check ((distance_m is null) = (distance_method is null)),
  constraint listing_surroundings_published_chk check (review_status <> 'published' or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists listing_surroundings_listing_idx on public.listing_surroundings (listing_id, review_status);
create index if not exists listing_surroundings_insp_idx on public.listing_surroundings (inspection_id);
create index if not exists listing_surroundings_observed_idx on public.listing_surroundings (observed_at);
-- One published answer per listing for each single-answer category. Facilities and landmarks may have several.
create unique index if not exists listing_surroundings_one_published
  on public.listing_surroundings (listing_id, category)
  where review_status = 'published' and category not like 'facility\_%' and category <> 'landmark';

-- ============================================================ 4. history (append-only, reuses the guard from 10.4)
create table if not exists public.listing_surroundings_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  fact_id uuid,
  event text not null,
  actor_id uuid,
  note text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists listing_surroundings_events_listing_idx on public.listing_surroundings_events (listing_id, created_at);
create index if not exists listing_surroundings_events_fact_idx on public.listing_surroundings_events (fact_id, created_at);

drop trigger if exists aa_surroundings_events_guard on public.listing_surroundings_events;
create trigger aa_surroundings_events_guard before update or delete on public.listing_surroundings_events
  for each row execute function public.eb_inspection_history_immutable();

-- ============================================================ 5. facts: what may change, and when
-- The original observation never changes. Only the review fields can change, and a withdrawn or superseded fact stays that way.
create or replace function public.eb_surroundings_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare keys text[] := array['review_status','reviewed_by','reviewed_at','review_note','superseded_by'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Surroundings facts are kept on record and cannot be deleted.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - keys) is distinct from (to_jsonb(old) - keys) then
    raise exception 'The original observation cannot be edited. Record a correction instead.' using errcode = '42501';
  end if;
  if old.review_status in ('withdrawn','superseded') and new.review_status is distinct from old.review_status then
    raise exception 'A withdrawn or replaced fact stays that way.' using errcode = '42501';
  end if;
  return new;
end $f$;

drop trigger if exists aa_surroundings_guard on public.listing_surroundings;
create trigger aa_surroundings_guard before update or delete on public.listing_surroundings
  for each row execute function public.eb_surroundings_guard();

-- ============================================================ 6. topic tag on inspection photos (set once at upload, never changed)
alter table public.inspection_evidence_files add column if not exists topic text;
alter table public.inspection_evidence_files drop constraint if exists inspection_evidence_files_topic_chk;
alter table public.inspection_evidence_files add constraint inspection_evidence_files_topic_chk
  check (topic is null or topic in ('general','road','drainage','flooding','street_lighting','water','electricity','network','facility'));

-- ============================================================ 7. access: admins read, inspectors read what they recorded, nobody writes directly
alter table public.surroundings_settings enable row level security;
alter table public.listing_surroundings enable row level security;
alter table public.listing_surroundings_events enable row level security;

revoke all on public.surroundings_settings, public.listing_surroundings, public.listing_surroundings_events from anon, authenticated, public;
grant select on public.surroundings_settings, public.listing_surroundings, public.listing_surroundings_events to authenticated;

drop policy if exists "Admins read surroundings settings" on public.surroundings_settings;
create policy "Admins read surroundings settings" on public.surroundings_settings for select to authenticated using (public.is_admin());
drop policy if exists "Admins read surroundings" on public.listing_surroundings;
create policy "Admins read surroundings" on public.listing_surroundings for select to authenticated using (public.is_admin());
drop policy if exists "Inspectors read own surroundings" on public.listing_surroundings;
create policy "Inspectors read own surroundings" on public.listing_surroundings for select to authenticated using (recorded_by = auth.uid());
drop policy if exists "Admins read surroundings events" on public.listing_surroundings_events;
create policy "Admins read surroundings events" on public.listing_surroundings_events for select to authenticated using (public.is_admin());

commit;

-- ROLLBACK (only while nothing has been recorded):
-- drop table if exists public.listing_surroundings_events, public.listing_surroundings, public.surroundings_settings;
-- drop function if exists public.eb_surroundings_guard(), public.eb_surroundings_answer_ok(text, text);
-- alter table public.inspection_evidence_files drop constraint if exists inspection_evidence_files_topic_chk;
-- alter table public.inspection_evidence_files drop column if exists topic;
