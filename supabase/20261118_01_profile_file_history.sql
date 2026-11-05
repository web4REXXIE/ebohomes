begin;

create table if not exists public.landlord_verification_file_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  changed_by uuid,
  event text not null,
  verification_status text,
  id_document_url text,
  selfie_url text,
  ownership_doc_url text,
  recorded_at timestamptz not null default now()
);
create index if not exists landlord_verification_file_history_profile_idx
  on public.landlord_verification_file_history (profile_id, recorded_at desc);

alter table public.landlord_verification_file_history enable row level security;
revoke all on public.landlord_verification_file_history from anon, authenticated;
grant select on public.landlord_verification_file_history to authenticated;
create policy "file_history_read_admin" on public.landlord_verification_file_history for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace function public.profiles_file_history_log()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare paths_changed boolean; status_changed boolean;
begin
  paths_changed := (old.id_document_url is distinct from new.id_document_url)
                or (old.selfie_url is distinct from new.selfie_url)
                or (old.ownership_doc_url is distinct from new.ownership_doc_url);
  status_changed := old.verification_status is distinct from new.verification_status;
  if not paths_changed and not status_changed then return new; end if;
  insert into public.landlord_verification_file_history
    (profile_id, changed_by, event, verification_status, id_document_url, selfie_url, ownership_doc_url)
  values (new.id, auth.uid(),
    case when paths_changed and status_changed then 'files_and_status_changed'
         when paths_changed then 'files_changed' else 'status_changed' end,
    new.verification_status, new.id_document_url, new.selfie_url, new.ownership_doc_url);
  return new;
end $f$;
revoke all on function public.profiles_file_history_log() from public, anon, authenticated;

drop trigger if exists z_profiles_file_history_log on public.profiles;
create trigger z_profiles_file_history_log after update on public.profiles
  for each row execute function public.profiles_file_history_log();

-- starting point: the files each profile points to right now
insert into public.landlord_verification_file_history (profile_id, event, verification_status, id_document_url, selfie_url, ownership_doc_url)
select id, 'baseline', verification_status, id_document_url, selfie_url, ownership_doc_url
  from public.profiles
 where id_document_url is not null or selfie_url is not null or ownership_doc_url is not null;

commit;
-- ROLLBACK: drop trigger if exists z_profiles_file_history_log on public.profiles;
--           drop function if exists public.profiles_file_history_log();
--           drop table if exists public.landlord_verification_file_history;
