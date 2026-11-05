-- EboHomes 20261119_01: Phase 9.4 - duplicate detection, fraud signals and risk alerts.
-- WHAT: new tables (alerts, evidence, history, settings, location history, deletion log), detection functions,
--       triggers that RAISE ALERTS when listings, evidence files or locations change, and admin-only action functions.
-- DOES NOT: ban or suspend anyone, hide, delete, unpublish or reject any listing, change authority_status, touch
--       applications or tenancies, or reveal any private file. A risk alert is an investigation task, nothing more.
-- FAILS OPEN: every trigger swallows its own errors, so a detection bug can never block a landlord saving a listing.
-- REQUIRES: 20261114_01 and 20261115_01 (Phase 9.2), 20261027_03 (property holds), and the preflight 20261119_00 checked.
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. settings (adjustable by admins)
-- The location-change distance is NOT duplicated here: it reuses listing_authority_settings.gps_tolerance_m from Phase 9.2.
create table if not exists public.risk_settings (
  id boolean primary key default true check (id),
  duplicate_radius_m numeric not null default 50 check (duplicate_radius_m between 5 and 1000),
  location_jump_m numeric not null default 1000 check (location_jump_m between 100 and 50000),
  photo_hamming_max int not null default 6 check (photo_hamming_max between 0 and 16),
  photo_match_min int not null default 2 check (photo_match_min between 1 and 10),
  phone_share_min int not null default 3 check (phone_share_min between 2 and 20),
  recreate_window_days int not null default 30 check (recreate_window_days between 1 and 365),
  recreate_count int not null default 3 check (recreate_count between 2 and 20),
  warn_at int not null default 20 check (warn_at > 0),
  investigate_at int not null default 40,
  high_at int not null default 70,
  updated_by uuid, updated_at timestamptz not null default now(),
  check (warn_at < investigate_at and investigate_at < high_at)
);
insert into public.risk_settings (id) values (true) on conflict do nothing;

-- ============================================================ 2. alert tables
create sequence if not exists public.risk_alert_seq;

create table if not exists public.risk_alerts (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('RA-' || lpad(nextval('public.risk_alert_seq')::text, 6, '0')),
  category text not null check (category in ('duplicate_property','multiple_accounts','document_reuse','location_change','repeated_rejected','recreated_listing','unusual_representative','unauthorized_listing','manual_review')),
  severity text not null check (severity in ('info','warning','investigation','high')),
  status text not null default 'open' check (status in ('open','investigating','info_requested','escalated','resolved')),
  resolution text check (resolution in ('false_positive','legitimate','no_action','confirmed_violation')),
  score int not null default 0,
  user_id uuid,                 -- the account the alert is about (never an automatic penalty)
  listing_id uuid references public.listings(id) on delete set null,
  listing_title text,           -- snapshot, so the alert stays readable if the listing is ever deleted
  property_id uuid,
  explanation text not null,
  dedupe_key text not null,
  assigned_to uuid,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid, decision_note text,
  check ((status = 'resolved') = (resolution is not null))
);
create unique index if not exists risk_alerts_one_active on public.risk_alerts (dedupe_key) where status <> 'resolved';
create index if not exists risk_alerts_queue_idx on public.risk_alerts (status, severity, detected_at desc);
create index if not exists risk_alerts_listing_idx on public.risk_alerts (listing_id);
create index if not exists risk_alerts_user_idx on public.risk_alerts (user_id);
create index if not exists risk_alerts_dedupe_idx on public.risk_alerts (dedupe_key);

-- Evidence holds REFERENCES and short safe summaries only. Never a file path, a file link or a document image.
create table if not exists public.risk_alert_evidence (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.risk_alerts(id) on delete restrict,
  kind text not null check (kind in ('listing','document','account','location','photo','property','signal')),
  ref_type text, ref_id uuid,
  label text not null, detail text, weight int not null default 0, data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists risk_alert_evidence_alert_idx on public.risk_alert_evidence (alert_id);

create table if not exists public.risk_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.risk_alerts(id) on delete restrict,
  actor_id uuid,                -- null = the detection system
  event text not null check (event in ('detected','assigned','note','info_requested','escalated','hold_placed','resolved','reopened','rescanned')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists risk_alert_events_alert_idx on public.risk_alert_events (alert_id, created_at);

-- ============================================================ 3. location history + deletion log
-- No foreign key on purpose: history must survive even if a listing is deleted.
create table if not exists public.listing_location_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  lat double precision, lng double precision, location_text text,
  moved_m double precision,
  source text not null check (source in ('baseline','created','updated')),
  recorded_by uuid,
  recorded_at timestamptz not null default now()
);
create index if not exists listing_location_history_idx on public.listing_location_history (listing_id, recorded_at);

create table if not exists public.listing_deletion_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  landlord_id uuid,
  status_at_delete text,
  location_text text, lat double precision, lng double precision, property_type text,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);
create index if not exists listing_deletion_log_landlord_idx on public.listing_deletion_log (landlord_id, deleted_at desc);

-- ============================================================ 4. row security: admins read, nobody writes directly
do $$
declare t text;
begin
  foreach t in array array['risk_settings','risk_alerts','risk_alert_evidence','risk_alert_events','listing_location_history','listing_deletion_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.eb_is_admin())', t || '_admin_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ============================================================ 5. integrity: history cannot be edited or deleted
create or replace function public.risk_append_only_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  raise exception 'This record is part of the investigation history and cannot be edited or deleted.' using errcode = '42501';
end $f$;

drop trigger if exists aa_risk_alert_events_guard on public.risk_alert_events;
create trigger aa_risk_alert_events_guard before update or delete on public.risk_alert_events for each row execute function public.risk_append_only_guard();
drop trigger if exists aa_risk_alert_evidence_guard on public.risk_alert_evidence;
create trigger aa_risk_alert_evidence_guard before update or delete on public.risk_alert_evidence for each row execute function public.risk_append_only_guard();
drop trigger if exists aa_listing_location_history_guard on public.listing_location_history;
create trigger aa_listing_location_history_guard before update or delete on public.listing_location_history for each row execute function public.risk_append_only_guard();
drop trigger if exists aa_listing_deletion_log_guard on public.listing_deletion_log;
create trigger aa_listing_deletion_log_guard before update or delete on public.listing_deletion_log for each row execute function public.risk_append_only_guard();

create or replace function public.risk_alerts_no_delete_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  raise exception 'Risk alerts cannot be deleted. Resolve them instead.' using errcode = '42501';
end $f$;
drop trigger if exists aa_risk_alerts_no_delete on public.risk_alerts;
create trigger aa_risk_alerts_no_delete before delete on public.risk_alerts for each row execute function public.risk_alerts_no_delete_guard();

-- ============================================================ 6. helpers (internal)
-- Photo fingerprints are the 16 hex character difference hashes made in the browser (lib/image-hash.ts).
-- Returns the number of differing bits (0 to 64), or null if either value is not a valid fingerprint.
create or replace function public.eb_hex_hamming(a text, b text)
returns int language sql immutable
as $f$
  select case when a ~ '^[0-9a-f]{16}$' and b ~ '^[0-9a-f]{16}$'
    then length(replace(((('x' || a)::bit(64)) # (('x' || b)::bit(64)))::text, '0', '')) end
$f$;

-- Last 10 digits of a phone number, so +234 801... and 0801... compare equal. Null if fewer than 10 digits.
create or replace function public.eb_phone_key(p text)
returns text language sql immutable
as $f$
  select case when length(d) >= 10 then right(d, 10) end from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) q
$f$;

create or replace function public.eb_risk_ev(p_kind text, p_ref_type text, p_ref uuid, p_label text, p_detail text, p_weight int, p_data jsonb default null)
returns jsonb language sql immutable
as $f$
  select jsonb_build_array(jsonb_build_object('kind', p_kind, 'ref_type', p_ref_type, 'ref_id', p_ref, 'label', p_label, 'detail', p_detail, 'weight', p_weight, 'data', p_data))
$f$;

-- eb_risk_ev returns a ONE-ITEM JSON ARRAY, so  ev := ev || eb_risk_ev(...)  appends an item.
-- Creates ONE alert with its evidence. The score is the plain sum of the evidence weights (so it can always be explained).
-- Skips quietly if an active alert with the same dedupe key exists, or if an admin already marked the same finding
-- as a false positive / legitimate. Returns the new alert id or null.
create or replace function public.eb_risk_raise(p_category text, p_user uuid, p_listing uuid, p_dedupe text, p_explanation text, p_evidence jsonb, p_cap int default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare s public.risk_settings; v_score int; v_sev text; v_id uuid; v_prop uuid; v_title text; v_cap_note text := '';
begin
  select * into s from public.risk_settings where id;
  if exists (select 1 from public.risk_alerts where dedupe_key = p_dedupe and status <> 'resolved') then return null; end if;
  if exists (select 1 from public.risk_alerts where dedupe_key = p_dedupe and resolution in ('false_positive','legitimate')) then return null; end if;

  select coalesce(sum((x->>'weight')::int), 0) into v_score from jsonb_array_elements(p_evidence) x;
  if p_cap is not null and v_score > p_cap then
    v_score := p_cap;
    v_cap_note := ' The level was kept lower because the details also fit a legitimate situation.';
  end if;
  if v_score <= 0 then return null; end if;

  v_sev := case when v_score >= s.high_at then 'high' when v_score >= s.investigate_at then 'investigation'
                when v_score >= s.warn_at then 'warning' else 'info' end;
  select property_id, title into v_prop, v_title from public.listings where id = p_listing;

  begin
    insert into public.risk_alerts (category, severity, score, user_id, listing_id, listing_title, property_id, explanation, dedupe_key)
    values (p_category, v_sev, v_score, p_user, p_listing, left(v_title, 200), v_prop, left(p_explanation || v_cap_note, 1000), p_dedupe)
    returning id into v_id;
  exception when unique_violation then
    return null;
  end;

  insert into public.risk_alert_evidence (alert_id, kind, ref_type, ref_id, label, detail, weight, data)
  select v_id, x->>'kind', x->>'ref_type', nullif(x->>'ref_id', '')::uuid, left(x->>'label', 200), left(coalesce(x->>'detail', ''), 500),
         coalesce((x->>'weight')::int, 0), case when jsonb_typeof(x->'data') = 'object' then x->'data' end
  from jsonb_array_elements(p_evidence) x;

  insert into public.risk_alert_events (alert_id, actor_id, event) values (v_id, null, 'detected');

  if v_sev in ('investigation','high') then
    perform public.notify_admins('Risk alert needs investigation', 'A new risk alert needs investigation. Open Risk Alerts to review the evidence.', '/admin/risk', 'general');
  end if;
  return v_id;
end $f$;

-- ============================================================ 7. detection: listings
-- Looks for listings under OTHER accounts that match this one. Understands property vs unit vs listing:
--   * same account, same property = normal (not an alert)
--   * same address but different bedrooms/type and no shared photos = probably another unit in the building (capped at "info")
--   * both listings already passed authority review = probably two representatives (capped below "investigation")
-- Mirrors lib/risk-alerts.ts scoreListingPair(). If you change a weight here, change it there.
create or replace function public.eb_risk_scan_listing(p_listing uuid)
returns int language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  s public.risk_settings; me record; o record; d record; c public.listing_authority_claims;
  ev jsonb; w int; n int := 0; cap int; dist double precision; photos int; cnt int; pk text; cat text; expl text; v_new uuid;
  f_prop boolean; f_gps boolean; f_addr boolean; f_photo boolean; f_phone boolean; f_dev boolean; f_price boolean; f_rej boolean; f_unit boolean; f_both boolean;
begin
  select * into s from public.risk_settings where id;
  select l.id, l.landlord_id, l.property_id, l.title, l.location_text, l.lat, l.lng, l.property_type, l.bedrooms, l.bathrooms,
         l.price_monthly, l.contact_info, l.device_id, l.authority_status, to_jsonb(l.photo_hashes) as ph
    into me from public.listings l where l.id = p_listing;
  if not found then return 0; end if;

  -- 7a. other accounts' listings that look like this one
  for o in
    select l2.id, l2.landlord_id, l2.property_id, l2.title, l2.location_text, l2.lat, l2.lng, l2.property_type, l2.bedrooms, l2.bathrooms,
           l2.price_monthly, l2.contact_info, l2.device_id, l2.status, l2.authority_status, to_jsonb(l2.photo_hashes) as ph
    from public.listings l2
    where l2.id <> me.id and l2.landlord_id <> me.landlord_id
      and ( (me.property_id is not null and l2.property_id = me.property_id)
         or (public.eb_norm_loc(me.location_text) <> '' and public.eb_norm_loc(l2.location_text) = public.eb_norm_loc(me.location_text))
         or (me.lat is not null and me.lng is not null and l2.lat is not null and l2.lng is not null
             and l2.lat between me.lat - 0.01 and me.lat + 0.01 and l2.lng between me.lng - 0.01 and me.lng + 0.01
             and public.eb_distance_m(me.lat::double precision, me.lng::double precision, l2.lat::double precision, l2.lng::double precision) <= s.duplicate_radius_m)
         or exists (select 1 from jsonb_array_elements_text(coalesce(me.ph, '[]'::jsonb)) a(h), jsonb_array_elements_text(coalesce(to_jsonb(l2.photo_hashes), '[]'::jsonb)) b(h)
                    where public.eb_hex_hamming(a.h, b.h) <= s.photo_hamming_max) )
  loop
    dist := case when me.lat is not null and me.lng is not null and o.lat is not null and o.lng is not null
                 then public.eb_distance_m(me.lat::double precision, me.lng::double precision, o.lat::double precision, o.lng::double precision) end;
    f_prop := me.property_id is not null and o.property_id = me.property_id;
    f_gps := dist is not null and dist <= s.duplicate_radius_m;
    f_addr := public.eb_norm_loc(me.location_text) <> '' and public.eb_norm_loc(o.location_text) = public.eb_norm_loc(me.location_text);
    select count(distinct a.h) into photos from jsonb_array_elements_text(coalesce(me.ph, '[]'::jsonb)) a(h)
      where exists (select 1 from jsonb_array_elements_text(coalesce(o.ph, '[]'::jsonb)) b(h) where public.eb_hex_hamming(a.h, b.h) <= s.photo_hamming_max);
    f_photo := photos >= s.photo_match_min;
    if not (f_prop or f_gps or f_addr or f_photo) then continue; end if;   -- one stray photo match alone is not a signal

    f_phone := public.eb_phone_key(me.contact_info) is not null and public.eb_phone_key(me.contact_info) = public.eb_phone_key(o.contact_info);
    f_dev := me.device_id is not null and me.device_id = o.device_id;
    f_price := me.price_monthly is not null and o.price_monthly is not null and greatest(me.price_monthly, o.price_monthly) > 0
               and abs(me.price_monthly - o.price_monthly) / greatest(me.price_monthly, o.price_monthly) >= 0.10;
    f_rej := o.status = 'rejected';
    f_unit := not f_photo and not f_prop and (me.bedrooms is distinct from o.bedrooms or me.property_type is distinct from o.property_type);
    f_both := me.authority_status = 'accepted' and o.authority_status = 'accepted';

    ev := public.eb_risk_ev('listing', 'listing', o.id, 'Matching listing under another account', coalesce(o.title, ''), 0)
       || public.eb_risk_ev('account', 'profile', o.landlord_id, 'Account of the matching listing', null, 0);
    w := 0;
    if f_prop then ev := ev || public.eb_risk_ev('property', 'listing', o.id, 'Same property record', 'Both listings are linked to the same property under different accounts.', 40); end if;
    if f_gps then ev := ev || public.eb_risk_ev('location', 'listing', o.id, 'Pins are very close', 'About ' || round(dist) || ' m apart (limit ' || round(s.duplicate_radius_m) || ' m).', 20); end if;
    if f_addr then ev := ev || public.eb_risk_ev('location', 'listing', o.id, 'Same address text', null, 20); end if;
    if f_photo then ev := ev || public.eb_risk_ev('photo', 'listing', o.id, 'Matching photos', photos || ' photo(s) look the same or almost the same.', least(15 + photos * 5, 40), jsonb_build_object('matching_photos', photos)); end if;
    if me.property_type is not distinct from o.property_type and me.property_type is not null then ev := ev || public.eb_risk_ev('signal', 'listing', o.id, 'Same property type', me.property_type, 5); end if;
    if me.bedrooms is not distinct from o.bedrooms and me.bedrooms is not null then ev := ev || public.eb_risk_ev('signal', 'listing', o.id, 'Same number of bedrooms', me.bedrooms::text, 5); end if;
    if f_phone then ev := ev || public.eb_risk_ev('signal', 'listing', o.id, 'Same contact phone number', 'Number ending ' || right(public.eb_phone_key(me.contact_info), 3), 20); end if;
    if f_dev then ev := ev || public.eb_risk_ev('signal', 'listing', o.id, 'Same device identifier', 'Supporting signal only. Shared devices are common.', 10); end if;
    if f_price then ev := ev || public.eb_risk_ev('signal', 'listing', o.id, 'Rent differs by 10% or more', 'The same place may be offered at different prices.', 10); end if;
    if f_rej then ev := ev || public.eb_risk_ev('signal', 'listing', o.id, 'Matching listing was rejected earlier', null, 15); end if;

    cap := null;
    if f_unit then cap := s.warn_at - 1; end if;
    if f_both then cap := least(coalesce(cap, s.investigate_at - 1), s.investigate_at - 1); end if;

    cat := case when f_rej then 'repeated_rejected' when f_prop then 'multiple_accounts' else 'duplicate_property' end;
    expl := case cat
      when 'repeated_rejected' then 'A listing that was rejected earlier looks like this one, but it belongs to a different account.'
      when 'multiple_accounts' then 'Two different accounts have listings linked to the same property record.'
      else 'A listing under another account matches this one by address, map pin or photos.' end;
    if f_unit then expl := expl || ' The details suggest these may be separate units in one building, so this is for information only.'; end if;
    if f_both then expl := expl || ' Both listings already passed an authority review, which can be normal when an owner has more than one representative.'; end if;

    v_new := public.eb_risk_raise(cat, me.landlord_id, me.id, 'dup:' || least(me.id, o.id)::text || ':' || greatest(me.id, o.id)::text, expl, ev, cap);
    if v_new is not null then n := n + 1; end if;
  end loop;

  -- 7b. this location matches a listing that another account had rejected and then deleted
  for d in
    select x.listing_id, x.deleted_at from public.listing_deletion_log x
    where x.landlord_id is distinct from me.landlord_id and x.status_at_delete = 'rejected' and x.deleted_at > now() - interval '365 days'
      and ( (public.eb_norm_loc(x.location_text) <> '' and public.eb_norm_loc(x.location_text) = public.eb_norm_loc(me.location_text))
         or (x.lat is not null and x.lng is not null and me.lat is not null and me.lng is not null
             and public.eb_distance_m(x.lat, x.lng, me.lat::double precision, me.lng::double precision) <= s.duplicate_radius_m) )
    order by x.deleted_at desc limit 3
  loop
    ev := public.eb_risk_ev('listing', 'listing', d.listing_id, 'A rejected listing at this location was deleted by another account', 'Deleted ' || to_char(d.deleted_at, 'YYYY-MM-DD'), 35);
    v_new := public.eb_risk_raise('repeated_rejected', me.landlord_id, me.id, 'rejdel:' || me.id::text || ':' || d.listing_id::text,
      'This location matches a listing that was rejected and then deleted by a different account.', ev, s.investigate_at - 1);
    if v_new is not null then n := n + 1; end if;
  end loop;

  -- 7c. the same account keeps deleting and re-creating listings for this place
  select count(*) into cnt from public.listing_deletion_log x
   where x.landlord_id = me.landlord_id and x.deleted_at > now() - make_interval(days => s.recreate_window_days::int)
     and ( (public.eb_norm_loc(x.location_text) <> '' and public.eb_norm_loc(x.location_text) = public.eb_norm_loc(me.location_text))
        or (x.lat is not null and x.lng is not null and me.lat is not null and me.lng is not null
            and public.eb_distance_m(x.lat, x.lng, me.lat::double precision, me.lng::double precision) <= s.duplicate_radius_m) );
  if cnt >= s.recreate_count then
    ev := public.eb_risk_ev('signal', 'listing', me.id, 'Listing deleted and re-created repeatedly', cnt || ' deletions for this place in ' || s.recreate_window_days || ' days.', 30);
    v_new := public.eb_risk_raise('recreated_listing', me.landlord_id, me.id, 'recreate:' || me.landlord_id::text || ':' || md5(public.eb_norm_loc(me.location_text)),
      'This account has deleted and re-created listings for the same place several times.', ev);
    if v_new is not null then n := n + 1; end if;
  end if;

  -- 7d. many different accounts name the same owner phone number
  select * into c from public.listing_authority_claims where listing_id = p_listing;
  if found then
    pk := public.eb_phone_key(c.owner_phone);
    if pk is not null then
      select count(distinct l2.landlord_id) into cnt from public.listing_authority_claims c2 join public.listings l2 on l2.id = c2.listing_id where public.eb_phone_key(c2.owner_phone) = pk;
      if cnt >= s.phone_share_min then
        select coalesce(jsonb_agg(public.eb_risk_ev('account', 'profile', q.landlord_id, 'Account naming this owner phone', 'Owner phone ending ' || right(pk, 3), 0) -> 0), '[]'::jsonb)
          into ev from (select distinct l2.landlord_id from public.listing_authority_claims c2 join public.listings l2 on l2.id = c2.listing_id where public.eb_phone_key(c2.owner_phone) = pk limit 10) q;
        ev := ev || public.eb_risk_ev('signal', 'listing', me.id, 'Same owner phone on several accounts', cnt || ' accounts name the same owner phone number.', 25);
        v_new := public.eb_risk_raise('unusual_representative', me.landlord_id, me.id, 'phone:' || pk,
          'Several different accounts say they act for an owner with the same phone number. One owner can have several agents, so this needs a look, not a penalty.', ev);
        if v_new is not null then n := n + 1; end if;
      end if;
    end if;
  end if;
  return n;
end $f$;

-- ============================================================ 8. detection: evidence files
-- A matching file fingerprint is a signal, not proof. Same owner or company papers on several properties can be legitimate.
-- Mirrors lib/risk-alerts.ts scoreDocumentPair().
create or replace function public.eb_risk_scan_document(p_document uuid)
returns int language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  s public.risk_settings; d record; o record; dl record; ol record; dc public.listing_authority_claims; oc public.listing_authority_claims;
  ev jsonb; w int; n int := 0; cap int; v_rel boolean; v_flag boolean; v_prop_specific boolean; expl text; v_new uuid;
begin
  select * into s from public.risk_settings where id;
  select id, listing_id, uploaded_by, doc_type, sha256 into d from public.listing_authority_documents where id = p_document;
  if not found then return 0; end if;
  select landlord_id, property_id into dl from public.listings where id = d.listing_id;
  select * into dc from public.listing_authority_claims where listing_id = d.listing_id;
  v_prop_specific := d.doc_type in ('certificate_of_occupancy','registered_deed_of_assignment','land_title_or_recognised_title_evidence');

  for o in
    select x.id, x.listing_id, x.uploaded_by, x.doc_type, x.withdrawn_at from public.listing_authority_documents x
    where x.sha256 = d.sha256 and x.id <> d.id and x.listing_id <> d.listing_id
  loop
    select landlord_id, property_id, authority_status into ol from public.listings where id = o.listing_id;
    select * into oc from public.listing_authority_claims where listing_id = o.listing_id;
    v_flag := ol.authority_status = 'rejected'
              or exists (select 1 from public.listing_document_reviews r where r.document_id = o.id and r.outcome = 'concern');
    v_rel := (public.eb_phone_key(dc.owner_phone) is not null and public.eb_phone_key(dc.owner_phone) = public.eb_phone_key(oc.owner_phone))
          or (public.eb_norm(dc.company_cac) <> '' and public.eb_norm(dc.company_cac) = public.eb_norm(oc.company_cac));

    cap := null; w := 0;
    ev := public.eb_risk_ev('document', 'authority_document', d.id, 'This submission', 'File type: ' || d.doc_type || '. Fingerprint ' || left(d.sha256, 10), 0, jsonb_build_object('doc_type', d.doc_type))
       || public.eb_risk_ev('document', 'authority_document', o.id, 'Earlier submission with the same file', 'File type: ' || o.doc_type || '. Fingerprint ' || left(d.sha256, 10), 0, jsonb_build_object('doc_type', o.doc_type, 'withdrawn', o.withdrawn_at is not null))
       || public.eb_risk_ev('listing', 'listing', o.listing_id, 'Listing of the earlier submission', null, 0)
       || public.eb_risk_ev('account', 'profile', o.uploaded_by, 'Account of the earlier submission', null, 0);

    if o.uploaded_by is distinct from d.uploaded_by then
      ev := ev || public.eb_risk_ev('signal', 'authority_document', o.id, 'Same file sent by a different account', null, 45);
      if v_flag then ev := ev || public.eb_risk_ev('signal', 'authority_document', o.id, 'The earlier copy was flagged or its listing was rejected', null, 25); end if;
      if v_rel then
        cap := s.investigate_at - 1;
        expl := 'The same file was sent by two accounts. They also name the same owner or company, which can be normal when one owner has several representatives.';
      else
        expl := 'The same file was sent by two unrelated accounts.';
      end if;
    elsif v_prop_specific and dl.property_id is distinct from ol.property_id then
      ev := ev || public.eb_risk_ev('signal', 'authority_document', o.id, 'A property-specific document used for another property', null, 25);
      expl := 'The same title or occupancy document was used for two different properties by one account.';
    else
      ev := ev || public.eb_risk_ev('signal', 'authority_document', o.id, 'Same file reused by the same account', 'Owner or company papers are often reused legitimately.', 5);
      expl := 'One account reused the same file for another listing. This is often legitimate (for example company papers).';
    end if;

    v_new := public.eb_risk_raise('document_reuse', d.uploaded_by, d.listing_id,
      'doc:' || left(d.sha256, 24) || ':' || least(d.listing_id, o.listing_id)::text || ':' || greatest(d.listing_id, o.listing_id)::text, expl, ev, cap);
    if v_new is not null then n := n + 1; end if;
  end loop;
  return n;
end $f$;

-- ============================================================ 9. detection: location changes + history
-- Compares with the last APPROVED position (Phase 9.2 baseline) so many small moves cannot add up unnoticed.
-- Uses the existing admin distance setting listing_authority_settings.gps_tolerance_m.
create or replace function public.listings_location_history_log()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  s public.risk_settings; tol double precision; ref_lat double precision; ref_lng double precision; ref_text text;
  moved double precision; from_ref double precision; text_changed boolean; ev jsonb; v_new uuid; cap int; w int; had_ref boolean;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.listing_location_history (listing_id, lat, lng, location_text, source, recorded_by)
      values (new.id, new.lat, new.lng, new.location_text, 'created', auth.uid());
      return new;
    end if;
    if new.lat is not distinct from old.lat and new.lng is not distinct from old.lng and new.location_text is not distinct from old.location_text then return new; end if;

    select * into s from public.risk_settings where id;
    select gps_tolerance_m::double precision into tol from public.listing_authority_settings where id;
    tol := coalesce(tol, 100);

    select (r.baseline->>'lat')::double precision, (r.baseline->>'lng')::double precision, r.baseline->>'location_text'
      into ref_lat, ref_lng, ref_text
      from public.listing_authority_reviews r
     where r.listing_id = new.id and r.decision in ('accepted','kept_unchanged') and r.baseline is not null
     order by r.decided_at desc limit 1;
    had_ref := found;
    if not had_ref then
      select h.lat, h.lng, h.location_text into ref_lat, ref_lng, ref_text
        from public.listing_location_history h where h.listing_id = new.id order by h.recorded_at asc, h.id limit 1;
    end if;

    moved := case when old.lat is not null and old.lng is not null and new.lat is not null and new.lng is not null
                  then public.eb_distance_m(old.lat::double precision, old.lng::double precision, new.lat::double precision, new.lng::double precision) end;
    insert into public.listing_location_history (listing_id, lat, lng, location_text, moved_m, source, recorded_by)
    values (new.id, new.lat, new.lng, new.location_text, moved, 'updated', auth.uid());

    from_ref := case when ref_lat is not null and ref_lng is not null and new.lat is not null and new.lng is not null
                     then public.eb_distance_m(ref_lat, ref_lng, new.lat::double precision, new.lng::double precision) end;
    text_changed := ref_text is not null and public.eb_norm_loc(new.location_text) <> public.eb_norm_loc(ref_text);

    w := 0; ev := '[]'::jsonb; cap := null;
    if from_ref is not null and from_ref > tol then
      w := w + 30;
      ev := ev || public.eb_risk_ev('location', 'listing', new.id, 'Pin moved away from the ' || case when had_ref then 'approved' else 'original' end || ' position',
              'Moved about ' || round(from_ref) || ' m (limit ' || round(tol) || ' m).', 30,
              jsonb_build_object('from_lat', ref_lat, 'from_lng', ref_lng, 'to_lat', new.lat, 'to_lng', new.lng, 'metres', round(from_ref)));
      if from_ref > s.location_jump_m then
        w := w + 40;
        ev := ev || public.eb_risk_ev('location', 'listing', new.id, 'Large jump', 'More than ' || round(s.location_jump_m) || ' m from the ' || case when had_ref then 'approved' else 'original' end || ' position.', 40);
      end if;
    end if;
    if text_changed then
      ev := ev || public.eb_risk_ev('location', 'listing', new.id, 'Address text changed', 'Changed from the ' || case when had_ref then 'approved' else 'original' end || ' wording.', 10);
    end if;
    if jsonb_array_length(ev) > 0 then
      v_new := public.eb_risk_raise('location_change', new.landlord_id, new.id,
        'loc:' || new.id::text || ':' || coalesce(round(new.lat::numeric, 4)::text, 'x') || ':' || coalesce(round(new.lng::numeric, 4)::text, 'x') || ':' || md5(public.eb_norm_loc(new.location_text)),
        'The location of this listing changed after it was first recorded or approved.', ev);
    end if;
  exception when others then
    raise warning 'EboHomes location history skipped: %', sqlerrm;
  end;
  return new;
end $f$;

drop trigger if exists ad_listings_location_history on public.listings;
create trigger ad_listings_location_history after insert or update of location_text, lat, lng on public.listings
  for each row execute function public.listings_location_history_log();

-- ============================================================ 10. triggers that run the scans (fail open)
create or replace function public.risk_scan_listing_trigger()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  begin
    if tg_table_name = 'listings' then perform public.eb_risk_scan_listing(new.id);
    else perform public.eb_risk_scan_listing(new.listing_id); end if;
  exception when others then
    raise warning 'EboHomes risk scan skipped: %', sqlerrm;
  end;
  return new;
end $f$;

create or replace function public.risk_scan_document_trigger()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  begin
    perform public.eb_risk_scan_document(new.id);
  exception when others then
    raise warning 'EboHomes risk scan skipped: %', sqlerrm;
  end;
  return new;
end $f$;

create or replace function public.listings_deletion_log_write()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  begin
    insert into public.listing_deletion_log (listing_id, landlord_id, status_at_delete, location_text, lat, lng, property_type, deleted_by)
    values (old.id, old.landlord_id, old.status, old.location_text, old.lat, old.lng, old.property_type, auth.uid());
  exception when others then
    raise warning 'EboHomes deletion log skipped: %', sqlerrm;
  end;
  return old;
end $f$;

drop trigger if exists ae_listings_risk_scan on public.listings;
create trigger ae_listings_risk_scan after insert on public.listings for each row execute function public.risk_scan_listing_trigger();
drop trigger if exists ae_claims_risk_scan on public.listing_authority_claims;
create trigger ae_claims_risk_scan after insert or update on public.listing_authority_claims for each row execute function public.risk_scan_listing_trigger();
drop trigger if exists ae_documents_risk_scan on public.listing_authority_documents;
create trigger ae_documents_risk_scan after insert on public.listing_authority_documents for each row execute function public.risk_scan_document_trigger();
drop trigger if exists ae_listings_deletion_log on public.listings;
create trigger ae_listings_deletion_log before delete on public.listings for each row execute function public.listings_deletion_log_write();

-- ============================================================ 11. admin actions (all admin-only; an admin cannot act on an alert about their own account)
create or replace function public.eb_risk_load(p_alert uuid)
returns public.risk_alerts language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  select * into a from public.risk_alerts where id = p_alert for update;
  if not found then raise exception 'Alert not found.' using errcode = 'P0002'; end if;
  if a.user_id = auth.uid() then raise exception 'You cannot act on an alert about your own account.' using errcode = '42501'; end if;
  return a;
end $f$;

create or replace function public.admin_risk_assign(p_alert uuid, p_assignee uuid default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v_to uuid := coalesce(p_assignee, auth.uid());
begin
  a := public.eb_risk_load(p_alert);
  if a.status = 'resolved' then raise exception 'This alert is already resolved.' using errcode = '22023'; end if;
  if v_to <> auth.uid() and not exists (select 1 from public.profiles p where p.id = v_to and p.role = 'admin') then raise exception 'Choose an administrator.' using errcode = '22023'; end if;
  if v_to = a.user_id then raise exception 'This alert cannot be assigned to the account it is about.' using errcode = '22023'; end if;
  update public.risk_alerts set assigned_to = v_to, status = case when status = 'open' then 'investigating' else status end, updated_at = now() where id = p_alert;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'assigned', null);
end $f$;

create or replace function public.admin_risk_add_note(p_alert uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  a := public.eb_risk_load(p_alert);
  if v is null or char_length(v) < 5 then raise exception 'Write a short note.' using errcode = '22023'; end if;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'note', left(v, 2000));
  update public.risk_alerts set updated_at = now() where id = p_alert;
end $f$;

-- Sends the account holder a message. Tell them what is needed; do not name other accounts.
create or replace function public.admin_risk_request_info(p_alert uuid, p_message text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v text := nullif(trim(coalesce(p_message, '')), '');
begin
  a := public.eb_risk_load(p_alert);
  if a.status = 'resolved' then raise exception 'This alert is already resolved.' using errcode = '22023'; end if;
  if a.user_id is null then raise exception 'This alert has no account to contact.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write the message the lister will see.' using errcode = '22023'; end if;
  update public.risk_alerts set status = 'info_requested', assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = p_alert;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'info_requested', left(v, 2000));
  perform public.notify_user(a.user_id, 'EboHomes needs more information', left(v, 500),
    case when a.listing_id is not null then '/dashboard/authority/' || a.listing_id else '/dashboard' end, 'general');
  perform public.audit_write('risk_alert_info_requested', 'risk_alert', a.id, jsonb_build_object('status', a.status), jsonb_build_object('status', 'info_requested'), v);
end $f$;

create or replace function public.admin_risk_escalate(p_alert uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  a := public.eb_risk_load(p_alert);
  if a.status = 'resolved' then raise exception 'This alert is already resolved.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write why you are escalating this.' using errcode = '22023'; end if;
  update public.risk_alerts set status = 'escalated', assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = p_alert;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'escalated', left(v, 2000));
  perform public.audit_write('risk_alert_escalated', 'risk_alert', a.id, jsonb_build_object('status', a.status), jsonb_build_object('status', 'escalated'), v);
  perform public.notify_admins('Risk alert escalated', 'An administrator escalated a risk alert. Open Risk Alerts to review it.', '/admin/risk', 'general');
end $f$;

-- Uses the EXISTING property hold (Phase 6). It blocks NEW applications, viewings and tenancies only.
-- It does not hide the listing and never touches existing applications or tenancies. Authority review has its own separate hold.
create or replace function public.admin_risk_place_hold(p_alert uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v text := nullif(trim(coalesce(p_reason, '')), ''); v_pub text; v_res text;
begin
  a := public.eb_risk_load(p_alert);
  if a.status = 'resolved' then raise exception 'This alert is already resolved.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write the reason for the hold.' using errcode = '22023'; end if;
  select p.public_id into v_pub from public.listings l join public.properties p on p.id = l.property_id where l.id = a.listing_id;
  if v_pub is null then raise exception 'This listing has no property record, so a property hold cannot be placed.' using errcode = '22023'; end if;
  v_res := public.admin_place_property_hold(v_pub, 'Risk alert ' || a.ref || ': ' || v);
  if v_res <> 'ok' and v_res <> 'This property is already on hold.' then raise exception '%', v_res using errcode = '22023'; end if;
  update public.risk_alerts set assigned_to = coalesce(assigned_to, auth.uid()), status = case when status = 'open' then 'investigating' else status end, updated_at = now() where id = p_alert;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'hold_placed', left(v, 2000));
  return case when v_res = 'ok' then 'Hold placed. New applications, viewings and tenancies are blocked for this property.' else v_res end;
end $f$;

-- Recording "confirmed policy violation" changes NOTHING by itself. Any account or listing action is a separate, deliberate step.
create or replace function public.admin_risk_resolve(p_alert uuid, p_resolution text, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  a := public.eb_risk_load(p_alert);
  if a.status = 'resolved' then raise exception 'This alert is already resolved.' using errcode = '22023'; end if;
  if p_resolution is null or p_resolution not in ('false_positive','legitimate','no_action','confirmed_violation') then raise exception 'Choose a decision.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write the reason for your decision.' using errcode = '22023'; end if;
  update public.risk_alerts set status = 'resolved', resolution = p_resolution, resolved_at = now(), resolved_by = auth.uid(), decision_note = left(v, 2000),
         assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = p_alert;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'resolved', left(p_resolution || ': ' || v, 2000));
  perform public.audit_write('risk_alert_resolved_' || p_resolution, 'risk_alert', a.id, jsonb_build_object('status', a.status), jsonb_build_object('status', 'resolved', 'resolution', p_resolution), v);
end $f$;

create or replace function public.admin_risk_reopen(p_alert uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.risk_alerts; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  a := public.eb_risk_load(p_alert);
  if a.status <> 'resolved' then raise exception 'Only a resolved alert can be reopened.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write why you are reopening this.' using errcode = '22023'; end if;
  update public.risk_alerts set status = 'investigating', resolution = null, resolved_at = null, resolved_by = null, decision_note = null, updated_at = now() where id = p_alert;
  insert into public.risk_alert_events (alert_id, actor_id, event, note) values (p_alert, auth.uid(), 'reopened', left(v, 2000));
  perform public.audit_write('risk_alert_reopened', 'risk_alert', a.id, jsonb_build_object('status', 'resolved', 'resolution', a.resolution), jsonb_build_object('status', 'investigating'), v);
end $f$;

create or replace function public.admin_risk_rescan_listing(p_listing uuid)
returns int language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare n int;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  n := public.eb_risk_scan_listing(p_listing);
  return n;
end $f$;

-- Scans existing listings in small batches (safe to repeat: the same finding is never raised twice).
create or replace function public.admin_risk_scan_batch(p_offset int, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r record; v_scanned int := 0; v_alerts int := 0;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  for r in select id from public.listings order by created_at, id offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 100), 1), 200) loop
    v_alerts := v_alerts + public.eb_risk_scan_listing(r.id);
    v_scanned := v_scanned + 1;
  end loop;
  return jsonb_build_object('scanned', v_scanned, 'alerts_raised', v_alerts);
end $f$;

create or replace function public.admin_risk_update_settings(p_values jsonb, p_reason text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare o public.risk_settings; v text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if v is null or char_length(v) < 5 then raise exception 'A reason is required.' using errcode = '22023'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception 'Invalid settings.' using errcode = '22023'; end if;
  select * into o from public.risk_settings where id for update;
  update public.risk_settings set
    duplicate_radius_m = coalesce((p_values->>'duplicate_radius_m')::numeric, duplicate_radius_m),
    location_jump_m = coalesce((p_values->>'location_jump_m')::numeric, location_jump_m),
    photo_hamming_max = coalesce((p_values->>'photo_hamming_max')::int, photo_hamming_max),
    photo_match_min = coalesce((p_values->>'photo_match_min')::int, photo_match_min),
    phone_share_min = coalesce((p_values->>'phone_share_min')::int, phone_share_min),
    recreate_window_days = coalesce((p_values->>'recreate_window_days')::int, recreate_window_days),
    recreate_count = coalesce((p_values->>'recreate_count')::int, recreate_count),
    updated_by = auth.uid(), updated_at = now()
  where id;
  perform public.audit_write('risk_settings_changed', 'settings', null, to_jsonb(o), p_values, v);
exception when check_violation then
  raise exception 'One of the values is outside its allowed range.' using errcode = '22023';
end $f$;

-- ============================================================ 12. who may call what
revoke all on function public.eb_hex_hamming(text,text), public.eb_phone_key(text), public.eb_risk_ev(text,text,uuid,text,text,int,jsonb),
  public.eb_risk_raise(text,uuid,uuid,text,text,jsonb,int), public.eb_risk_scan_listing(uuid), public.eb_risk_scan_document(uuid),
  public.eb_risk_load(uuid), public.listings_location_history_log(), public.risk_scan_listing_trigger(), public.risk_scan_document_trigger(),
  public.listings_deletion_log_write(), public.risk_append_only_guard(), public.risk_alerts_no_delete_guard()
  from public, anon, authenticated;

revoke all on function public.admin_risk_assign(uuid,uuid), public.admin_risk_add_note(uuid,text), public.admin_risk_request_info(uuid,text),
  public.admin_risk_escalate(uuid,text), public.admin_risk_place_hold(uuid,text), public.admin_risk_resolve(uuid,text,text),
  public.admin_risk_reopen(uuid,text), public.admin_risk_rescan_listing(uuid), public.admin_risk_scan_batch(int,int),
  public.admin_risk_update_settings(jsonb,text)
  from public, anon;
grant execute on function public.admin_risk_assign(uuid,uuid), public.admin_risk_add_note(uuid,text), public.admin_risk_request_info(uuid,text),
  public.admin_risk_escalate(uuid,text), public.admin_risk_place_hold(uuid,text), public.admin_risk_resolve(uuid,text,text),
  public.admin_risk_reopen(uuid,text), public.admin_risk_rescan_listing(uuid), public.admin_risk_scan_batch(int,int),
  public.admin_risk_update_settings(jsonb,text)
  to authenticated;

-- ============================================================ 13. starting point for location history (existing listings)
insert into public.listing_location_history (listing_id, lat, lng, location_text, source)
select l.id, l.lat, l.lng, l.location_text, 'baseline'
from public.listings l
where not exists (select 1 from public.listing_location_history h where h.listing_id = l.id);

commit;

-- CHECK (read only, run after the migration): expect 6 tables, 1 settings row, 5 triggers on listings/claims/documents, 10 admin functions.
-- select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('risk_alerts','risk_alert_evidence','risk_alert_events','risk_settings','listing_location_history','listing_deletion_log')) as tables,
--        (select count(*) from public.risk_settings) as settings_rows,
--        (select count(*) from pg_trigger where not tgisinternal and tgname in ('ad_listings_location_history','ae_listings_risk_scan','ae_claims_risk_scan','ae_documents_risk_scan','ae_listings_deletion_log')) as triggers_should_be_5,
--        (select count(*) from pg_proc where proname like 'admin_risk_%') as admin_functions_should_be_10;

-- ROLLBACK (only if you must undo, and only before real alerts exist you want to keep):
-- drop trigger if exists ad_listings_location_history on public.listings;
-- drop trigger if exists ae_listings_risk_scan on public.listings;
-- drop trigger if exists ae_listings_deletion_log on public.listings;
-- drop trigger if exists ae_claims_risk_scan on public.listing_authority_claims;
-- drop trigger if exists ae_documents_risk_scan on public.listing_authority_documents;
-- drop function if exists public.admin_risk_assign(uuid,uuid), public.admin_risk_add_note(uuid,text), public.admin_risk_request_info(uuid,text), public.admin_risk_escalate(uuid,text),
--   public.admin_risk_place_hold(uuid,text), public.admin_risk_resolve(uuid,text,text), public.admin_risk_reopen(uuid,text), public.admin_risk_rescan_listing(uuid),
--   public.admin_risk_scan_batch(int,int), public.admin_risk_update_settings(jsonb,text), public.eb_risk_load(uuid), public.eb_risk_scan_document(uuid),
--   public.eb_risk_scan_listing(uuid), public.eb_risk_raise(text,uuid,uuid,text,text,jsonb,int), public.eb_risk_ev(text,text,uuid,text,text,int,jsonb),
--   public.eb_phone_key(text), public.eb_hex_hamming(text,text), public.listings_location_history_log(), public.risk_scan_listing_trigger(),
--   public.risk_scan_document_trigger(), public.listings_deletion_log_write(), public.risk_append_only_guard(), public.risk_alerts_no_delete_guard();
-- drop trigger if exists aa_risk_alert_events_guard on public.risk_alert_events;   -- (dropped with the tables below)
-- drop table if exists public.risk_alert_events, public.risk_alert_evidence, public.risk_alerts, public.risk_settings, public.listing_location_history, public.listing_deletion_log;
-- drop sequence if exists public.risk_alert_seq;
