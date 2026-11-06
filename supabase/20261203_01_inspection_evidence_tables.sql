-- EboHomes 20261203_01: Phase 10.4 Step A1 - inspection evidence tables (storage of facts only).
-- WHAT: settings (GPS threshold), per-file evidence records with SHA-256, two append-only history tables,
--       new GPS/integrity columns on property_inspections, parent_job_id on inspection_jobs.
-- DOES NOT: change any existing row, policy, trigger or function. Nothing reads the new tables yet.
--       Old inspections keep working and stay "legacy" (integrity_level stays empty).
-- REQUIRES: property_inspections, inspection_jobs, inspectors, listings, is_admin() (all already live).
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. settings
create table if not exists public.inspection_settings (
  id boolean primary key default true check (id),
  gps_threshold_m int not null default 200 check (gps_threshold_m between 20 and 5000),
  max_files_per_job int not null default 30 check (max_files_per_job between 3 and 100),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.inspection_settings (id) values (true) on conflict do nothing;

-- ============================================================ 2. new columns on existing tables (all nullable)
alter table public.property_inspections
  add column if not exists gps_accuracy_m numeric,
  add column if not exists gps_fix_at timestamptz,
  add column if not exists gps_distance_m numeric,
  add column if not exists gps_threshold_m int,
  add column if not exists gps_flag text,
  add column if not exists integrity_level text;

alter table public.property_inspections drop constraint if exists property_inspections_gps_flag_chk;
alter table public.property_inspections add constraint property_inspections_gps_flag_chk
  check (gps_flag is null or gps_flag in ('within','outside','no_pin'));
alter table public.property_inspections drop constraint if exists property_inspections_integrity_chk;
alter table public.property_inspections add constraint property_inspections_integrity_chk
  check (integrity_level is null or integrity_level = 'hashed');

alter table public.inspection_jobs add column if not exists parent_job_id uuid;

-- ============================================================ 3. evidence files (one row per file, never deleted)
-- No foreign keys to listings or jobs on purpose: deleting a listing must never be blocked by, or erase, evidence.
create table if not exists public.inspection_evidence_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  listing_id uuid not null,
  inspection_id uuid,                       -- empty while the file is only "staged" (uploaded, not yet submitted)
  uploaded_by uuid not null,
  kind text not null check (kind in ('photo','video')),
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),   -- computed by the server from the stored bytes
  capture_method text not null default 'unknown' check (capture_method in ('camera','gallery','unknown')), -- as reported by the device, never proof
  phase text not null default 'initial' check (phase in ('initial','supplement')),
  uploaded_at timestamptz not null default now(),            -- server time
  submitted_at timestamptz,
  discarded_at timestamptz,                                  -- only a never-submitted file can be discarded
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz
);
create index if not exists inspection_evidence_files_job_idx on public.inspection_evidence_files (job_id);
create index if not exists inspection_evidence_files_insp_idx on public.inspection_evidence_files (inspection_id);
create index if not exists inspection_evidence_files_hash_idx on public.inspection_evidence_files (sha256);

-- ============================================================ 4. history tables (append-only)
create table if not exists public.inspection_evidence_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  inspection_id uuid,
  file_id uuid,
  event text not null,
  actor_id uuid,
  note text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inspection_evidence_events_insp_idx on public.inspection_evidence_events (inspection_id, created_at);
create index if not exists inspection_evidence_events_job_idx on public.inspection_evidence_events (job_id, created_at);

create table if not exists public.inspection_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  event text not null,
  from_inspector uuid, to_inspector uuid,
  from_status text, to_status text,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists inspection_job_events_job_idx on public.inspection_job_events (job_id, created_at);

create or replace function public.eb_inspection_history_immutable()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  raise exception 'This record is part of the inspection history and cannot be edited or deleted.' using errcode = '42501';
end $f$;

drop trigger if exists aa_insp_evidence_events_guard on public.inspection_evidence_events;
create trigger aa_insp_evidence_events_guard before update or delete on public.inspection_evidence_events
  for each row execute function public.eb_inspection_history_immutable();
drop trigger if exists aa_insp_job_events_guard on public.inspection_job_events;
create trigger aa_insp_job_events_guard before update or delete on public.inspection_job_events
  for each row execute function public.eb_inspection_history_immutable();

-- ============================================================ 5. evidence files: what may change, and when
-- Original facts (path, hash, size, type, uploader, time) never change. A file can only: be attached to its inspection once,
-- be discarded while never submitted, and receive a review decision after submission.
create or replace function public.eb_inspection_file_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare keys text[] := array['inspection_id','submitted_at','discarded_at','review_status','review_note','reviewed_by','reviewed_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Evidence files are kept on record and cannot be deleted.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - keys) is distinct from (to_jsonb(old) - keys) then
    raise exception 'Submitted evidence cannot be edited or replaced.' using errcode = '42501';
  end if;
  if old.inspection_id is not null and new.inspection_id is distinct from old.inspection_id then
    raise exception 'This file already belongs to an inspection.' using errcode = '42501';
  end if;
  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'Submission time cannot change.' using errcode = '42501';
  end if;
  if old.discarded_at is not null and new.discarded_at is distinct from old.discarded_at then
    raise exception 'A discarded file stays discarded.' using errcode = '42501';
  end if;
  if new.discarded_at is distinct from old.discarded_at and old.inspection_id is not null then
    raise exception 'A submitted file cannot be discarded.' using errcode = '42501';
  end if;
  if (new.review_status is distinct from old.review_status or new.review_note is distinct from old.review_note
      or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at)
     and old.inspection_id is null then
    raise exception 'Only a submitted file can be reviewed.' using errcode = '42501';
  end if;
  return new;
end $f$;

drop trigger if exists aa_insp_file_guard on public.inspection_evidence_files;
create trigger aa_insp_file_guard before update or delete on public.inspection_evidence_files
  for each row execute function public.eb_inspection_file_guard();

-- ============================================================ 6. access: admins read, inspectors read their own file rows, nobody writes directly
alter table public.inspection_settings enable row level security;
alter table public.inspection_evidence_files enable row level security;
alter table public.inspection_evidence_events enable row level security;
alter table public.inspection_job_events enable row level security;

revoke all on public.inspection_settings, public.inspection_evidence_files,
              public.inspection_evidence_events, public.inspection_job_events from anon, authenticated, public;
grant select on public.inspection_settings, public.inspection_evidence_files,
                public.inspection_evidence_events, public.inspection_job_events to authenticated;

drop policy if exists "Admins read inspection settings" on public.inspection_settings;
create policy "Admins read inspection settings" on public.inspection_settings for select to authenticated using (public.is_admin());
drop policy if exists "Admins read evidence files" on public.inspection_evidence_files;
create policy "Admins read evidence files" on public.inspection_evidence_files for select to authenticated using (public.is_admin());
drop policy if exists "Inspectors read own evidence files" on public.inspection_evidence_files;
create policy "Inspectors read own evidence files" on public.inspection_evidence_files for select to authenticated using (uploaded_by = auth.uid());
drop policy if exists "Admins read evidence events" on public.inspection_evidence_events;
create policy "Admins read evidence events" on public.inspection_evidence_events for select to authenticated using (public.is_admin());
drop policy if exists "Admins read job events" on public.inspection_job_events;
create policy "Admins read job events" on public.inspection_job_events for select to authenticated using (public.is_admin());

commit;

-- ROLLBACK (only if nothing has been submitted through the new flow yet):
-- drop table if exists public.inspection_job_events, public.inspection_evidence_events, public.inspection_evidence_files, public.inspection_settings;
-- drop function if exists public.eb_inspection_file_guard(), public.eb_inspection_history_immutable();
-- alter table public.inspection_jobs drop column if exists parent_job_id;
-- alter table public.property_inspections drop column if exists gps_accuracy_m, drop column if exists gps_fix_at,
--   drop column if exists gps_distance_m, drop column if exists gps_threshold_m, drop column if exists gps_flag, drop column if exists integrity_level;
