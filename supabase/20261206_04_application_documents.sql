-- EboHomes 20261206_04 (Phase 11.6)  *** PROPOSED. NOT EXECUTED. ***
-- Application documents: private bucket, tenant + EboHomes staff access only, landlord sees document TYPES only.
-- Documents are optional for now (making any of them required is a pending decision).
-- Files are never deleted by these functions (retention schedule is a pending decision).
-- ROLLBACK at the bottom.
begin;

-- ===== A. Private bucket (no storage.objects policies on purpose: only the server can write or sign) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-documents', 'application-documents', false, 8388608,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- ===== B. Documents table =====
create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete restrict,
  tenant_id uuid not null,
  kind text not null check (kind in ('government_id','proof_of_income','employment_letter','reference_letter','proof_of_address','other')),
  label text,
  storage_path text not null unique,
  original_name text,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 8388608),
  status text not null default 'active' check (status in ('active','replaced','removed')),
  replaced_by uuid references public.application_documents(id),
  uploaded_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists application_documents_app_idx on public.application_documents (application_id, status);
create index if not exists application_documents_tenant_idx on public.application_documents (tenant_id);
-- One live document per type. "other" may have several (the function caps it at 3).
create unique index if not exists application_documents_one_active_kind
  on public.application_documents (application_id, kind) where status = 'active' and kind <> 'other';

alter table public.application_documents enable row level security;
revoke all on public.application_documents from anon, authenticated;
grant select on public.application_documents to authenticated;
drop policy if exists application_documents_select_owner on public.application_documents;
create policy application_documents_select_owner on public.application_documents for select to authenticated
  using (tenant_id = auth.uid());
drop policy if exists application_documents_select_staff on public.application_documents;
create policy application_documents_select_staff on public.application_documents for select to authenticated
  using (public.eb_is_admin());

-- ===== C. Access log (every signed link that is issued) =====
create table if not exists public.application_document_access (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  actor_id uuid not null,
  actor_role text not null,
  accessed_at timestamptz not null default now()
);
create index if not exists application_document_access_doc_idx on public.application_document_access (document_id, accessed_at);
alter table public.application_document_access enable row level security;
revoke all on public.application_document_access from anon, authenticated;
grant select on public.application_document_access to authenticated;
drop policy if exists application_document_access_select_staff on public.application_document_access;
create policy application_document_access_select_staff on public.application_document_access for select to authenticated
  using (public.eb_is_admin());

-- ===== D. Add a document (called by the server with the service role) =====
create or replace function public.eb_add_application_document(
  p_user uuid, p_application uuid, p_kind text, p_label text, p_path text, p_name text, p_mime text, p_bytes bigint)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_id uuid;
  v_old uuid;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_active int;
  v_other int;
begin
  select id, tenant_id, status into a from public.applications where id = p_application for update;
  if not found or a.tenant_id is distinct from p_user then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if a.status not in ('pending', 'info_requested', 'approved') then
    raise exception 'Documents can only be added while your application is open.' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies t where t.application_id = p_application) then
    raise exception 'A tenancy already exists for this application, so documents can no longer be changed.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('government_id','proof_of_income','employment_letter','reference_letter','proof_of_address','other') then
    raise exception 'Choose what kind of document this is.' using errcode = '22023';
  end if;
  if p_kind = 'other' and (v_label is null or char_length(v_label) < 2 or char_length(v_label) > 60) then
    raise exception 'Describe the document in 2 to 60 characters.' using errcode = '22023';
  end if;
  if p_kind <> 'other' then v_label := null; end if;
  if p_path is null
     or p_path !~ ('^' || p_user::text || '/' || p_application::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then
    raise exception 'Invalid file location.' using errcode = '22023';
  end if;

  select count(*) filter (where status = 'active'), count(*) filter (where status = 'active' and kind = 'other')
    into v_active, v_other
    from public.application_documents where application_id = p_application;
  if p_kind = 'other' and v_other >= 3 then
    raise exception 'You can add up to 3 other documents. Remove one first.' using errcode = '22023';
  end if;
  if v_active >= 8 and not exists (
       select 1 from public.application_documents where application_id = p_application and kind = p_kind and status = 'active' and p_kind <> 'other') then
    raise exception 'You can keep up to 8 documents on one application.' using errcode = '22023';
  end if;

  -- A new document of the same type replaces the old one. The old row and file stay as history.
  if p_kind <> 'other' then
    update public.application_documents
       set status = 'replaced', ended_at = now()
     where application_id = p_application and kind = p_kind and status = 'active'
     returning id into v_old;
  end if;

  insert into public.application_documents (application_id, tenant_id, kind, label, storage_path, original_name, mime, size_bytes)
  values (p_application, p_user, p_kind, v_label, p_path, left(p_name, 120), p_mime, p_bytes)
  returning id into v_id;

  if v_old is not null then
    update public.application_documents set replaced_by = v_id where id = v_old;
  end if;

  begin
    insert into public.application_events (application_id, event, actor_id, actor_role, note)
    values (p_application, 'document_added', p_user, 'tenant', p_kind);
  exception when undefined_table then null;  -- 11.4 not installed yet: skip the audit line, never block the upload
  end;
  return v_id;
end;
$function$;
revoke all on function public.eb_add_application_document(uuid, uuid, text, text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.eb_add_application_document(uuid, uuid, text, text, text, text, text, bigint) to service_role;

-- ===== E. Remove a document (hides it; the file and row stay for the audit trail) =====
create or replace function public.eb_remove_application_document(p_user uuid, p_document uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  d record;
  a record;
begin
  select * into d from public.application_documents where id = p_document for update;
  if not found or d.tenant_id is distinct from p_user then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  if d.status <> 'active' then
    return;
  end if;
  select id, status into a from public.applications where id = d.application_id;
  if a.status not in ('pending', 'info_requested', 'approved')
     or exists (select 1 from public.tenancies t where t.application_id = d.application_id) then
    raise exception 'Documents can no longer be changed on this application.' using errcode = '22023';
  end if;
  update public.application_documents set status = 'removed', ended_at = now() where id = p_document;
  begin
    insert into public.application_events (application_id, event, actor_id, actor_role, note)
    values (d.application_id, 'document_removed', p_user, 'tenant', d.kind);
  exception when undefined_table then null;
  end;
end;
$function$;
revoke all on function public.eb_remove_application_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.eb_remove_application_document(uuid, uuid) to service_role;

-- ===== F. Landlord-safe summary: document TYPES only. No file names, no paths, no links. =====
create or replace function public.eb_application_document_summary(p_application uuid)
 returns table (kind text, uploaded_at timestamptz)
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    return;
  end if;
  if not exists (
       select 1 from public.applications a
       where a.id = p_application and (a.landlord_id = auth.uid() or a.tenant_id = auth.uid()))
     and not coalesce(public.eb_is_admin(), false) then
    return;
  end if;
  return query
    select d.kind, d.uploaded_at
      from public.application_documents d
     where d.application_id = p_application and d.status = 'active'
     order by d.uploaded_at;
end;
$function$;
revoke all on function public.eb_application_document_summary(uuid) from public, anon;
grant execute on function public.eb_application_document_summary(uuid) to authenticated;

commit;

-- CHECK (read only): expect 1 bucket row with public = false, 2 tables, 3 functions.
select id, public from storage.buckets where id = 'application-documents';
select to_regclass('public.application_documents') as docs, to_regclass('public.application_document_access') as access_log;
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('eb_add_application_document', 'eb_remove_application_document', 'eb_application_document_summary');
-- Also check no broad storage policy exposes the bucket:
--   select policyname, cmd, qual from pg_policies where schemaname = 'storage' and tablename = 'objects';

-- ROLLBACK (only if needed; keep the tables if any document was uploaded, they are the audit history):
-- drop function if exists public.eb_application_document_summary(uuid);
-- drop function if exists public.eb_remove_application_document(uuid, uuid);
-- drop function if exists public.eb_add_application_document(uuid, uuid, text, text, text, text, text, bigint);
