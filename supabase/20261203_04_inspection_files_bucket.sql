-- EboHomes 20261203_04: Phase 10.4 Step C - private storage bucket for new inspection evidence.
-- WHAT: creates a PRIVATE bucket 'inspection-files' (100MB limit, JPEG/PNG/WebP/MP4/WebM only). It gets NO storage policies,
--       so only the server (service key) can write, read or sign links. Browsers cannot list, read or delete anything in it.
-- DOES NOT: touch the old 'inspection-evidence' bucket, its policies, or any existing inspection. Old evidence keeps working.
-- NOTE: the Supabase project's own global upload limit also applies. If it is below 100MB, videos above that limit fail
--       until the project limit is raised (Dashboard > Storage > Settings).
-- ROLLBACK: at the bottom.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-files', 'inspection-files', false, 104857600,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update
  set public = false, file_size_limit = 104857600,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm'];

-- ROLLBACK (only while the bucket is empty):
-- delete from storage.buckets where id = 'inspection-files';
