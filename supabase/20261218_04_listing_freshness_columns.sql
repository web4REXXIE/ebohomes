-- Listing freshness columns, captured from the live database.
-- Safe to re-run. The functions that use these are saved in the next freshness file.
begin;

alter table public.listings
  add column if not exists availability_confirmed_at timestamptz not null default now(),
  add column if not exists freshness_paused_at timestamptz;

commit;

notify pgrst, 'reload schema';
