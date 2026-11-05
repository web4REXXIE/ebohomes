-- EboHomes 20261119_00: Phase 9.4 PREFLIGHT. READ ONLY. Changes nothing.
-- Run each query in the Supabase SQL editor BEFORE running 20261119_01_risk_alert_foundation.sql
-- and send me the results if any answer is not what the comment says.

-- 1. listings columns the risk scan reads. Expect these 12 rows: bedrooms, bathrooms, contact_info, created_at,
--    device_id, landlord_id, lat, lng, location_text, photo_hashes, price_monthly, property_id (+ property_type, title, status, authority_status).
select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'listings'
  and column_name in ('id','landlord_id','property_id','title','location_text','lat','lng','property_type','bedrooms','bathrooms',
                      'price_monthly','contact_info','device_id','photo_hashes','video_hashes','status','authority_status','created_at')
order by column_name;

-- 2. Functions this migration calls. Expect 1 row each (audit_write, notify_user, notify_admins, eb_is_admin, admin_place_property_hold, eb_distance_m, eb_norm_loc).
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('audit_write','notify_user','notify_admins','eb_is_admin','admin_place_property_hold','eb_distance_m','eb_norm_loc')
order by proname;

-- 3. Foreign keys that point at listings. Shows what blocks a listing delete today (the authority tables use ON DELETE RESTRICT).
select conrelid::regclass as child_table, conname, confdeletetype as on_delete
from pg_constraint
where contype = 'f' and confrelid = 'public.listings'::regclass
order by 1;

-- 4. How many listings have no property record (these cannot be put on a property hold).
select count(*) filter (where property_id is null) as listings_without_property, count(*) as total_listings from public.listings;

-- 5. Photo fingerprint format. Expect every row to be 16 hex characters.
select length(h) as hash_length, count(*)
from public.listings l, jsonb_array_elements_text(coalesce(to_jsonb(l.photo_hashes), '[]'::jsonb)) h
group by 1 order by 1;

-- 6. Nothing from Phase 9.4 exists yet. Expect 0.
select count(*) as phase_94_tables_already_present
from information_schema.tables
where table_schema = 'public' and table_name in ('risk_alerts','risk_alert_evidence','risk_alert_events','risk_settings','listing_location_history','listing_deletion_log');
