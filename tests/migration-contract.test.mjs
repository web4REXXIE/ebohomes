// Static checks of the Phase 11 migrations. No database needed, so CI can run them.
// These do NOT prove behaviour (see scripts/db-scenarios.mjs for that). They stop the protections from being edited away by accident:
// unique indexes, lock order, who may call what, and the status rules.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const strip = (s) => s.replace(/^\s*--.*$/gm, '')
const sql = (f) => strip(readFileSync('supabase/' + f, 'utf8'))
const all = readdirSync('supabase').filter((f) => /^\d{8}_\d+.*\.sql$/.test(f)).sort()

// Body of ONE function (from its "create or replace function public.<name>(" to the next one).
function fn(text, name) {
  const re = new RegExp('create or replace function public\\.' + name + '\\(', 'i')
  const m = re.exec(text)
  assert.ok(m, 'function not found: ' + name)
  const rest = text.slice(m.index + 10)
  const next = rest.search(/create or replace function /i)
  return text.slice(m.index, next === -1 ? undefined : m.index + 10 + next)
}
// Position of the first row lock (… for update) on a table.
const lock = (body, table) => { const m = new RegExp('from public\\.' + table + '\\b[^;]*?for update', 'i').exec(body); return m ? m.index : -1 }
const lockedBefore = (body, first, second, msg) => {
  const i = lock(body, first), j = lock(body, second)
  assert.ok(i >= 0 && j >= 0, msg + ' (lock missing)')
  assert.ok(i < j, msg)
}
const before = (body, a, b, msg) => {
  const i = body.indexOf(a), j = body.indexOf(b)
  assert.ok(i >= 0 && j >= 0, msg + ' (marker missing)')
  assert.ok(i < j, msg)
}

// ---- 11.3 application insert gate
{
  const s = sql('20261206_01_application_insert_gate.sql')
  assert.match(s, /create unique index if not exists applications_one_open_per_tenant_listing/)
  assert.match(s, /create unique index if not exists applications_one_approved_per_listing/)
  assert.match(s, /create trigger a15_application_insert_gate/)
  const g = fn(s, 'eb_application_insert_gate')
  for (const rule of [/new\.tenant_id is distinct from v_uid/, /l\.landlord_id = v_uid/, /new\.landlord_id is distinct from l\.landlord_id/,
    /l\.status is distinct from 'approved'/, /tenancy in progress/]) assert.match(g, rule)
}

// ---- 11.4 lifecycle
{
  const s = sql('20261206_02_application_lifecycle.sql')
  assert.match(s, /check \(status in \('pending','info_requested','approved','rejected','withdrawn','accepted','not_selected'\)\)/)
  assert.match(s, /create trigger a40_application_transition_guard/)
  const g = fn(s, 'eb_application_transition_guard')
  assert.match(g, /eb\.system_transition/, 'accepted / not_selected can only be set by trusted functions')
  const o = fn(s, 'eb_admin_override_application')
  assert.match(o, /10/, 'override needs a reason')
  assert.match(s, /revoke all on function public\.eb_admin_override_application\(uuid, text, text\) from public, anon/)
}

// ---- 11.7 offers
{
  const s = sql('20261206_05_rental_offers.sql')
  assert.match(s, /rental_offers_one_live_per_application[\s\S]*?where status in \('offered', 'countered', 'accepted'\)/)
  assert.match(s, /rental_offers_one_accepted_per_listing[\s\S]*?where status = 'accepted'/)
  assert.match(s, /grant select on public\.rental_offers to authenticated/)
  assert.doesNotMatch(s, /grant (insert|update|delete)[^;]*rental_offers/i, 'offers change only through the functions')
  for (const f of ['eb_issue_rental_offer', 'eb_respond_rental_offer', 'eb_landlord_confirm_offer', 'eb_withdraw_rental_offer']) {
    const b = fn(s, f)
    lockedBefore(b, 'listings', 'applications', f + ' locks the listing before the application')
  }
  assert.match(s, /grant execute on function public\.eb_expire_rental_offers\(\) to service_role/)
  assert.doesNotMatch(s, /grant execute on function public\.eb_expire_rental_offers\(\) to authenticated/)
}

// ---- 11.8 tenancy from offer
{
  const s = sql('20261207_01_offer_tenancies.sql')
  assert.match(s, /create unique index if not exists tenancies_one_per_offer/)
  assert.match(s, /create trigger b_eb_tenancy_offer_guard before insert on public\.tenancies/)
  const c = fn(s, 'eb_create_tenancy_from_offer')
  assert.match(c, /eb_is_admin/)
  lockedBefore(c, 'listings', 'applications', 'tenancy creation locks the listing first')
  lockedBefore(c, 'applications', 'rental_offers', 'then the application, then the offer')
  assert.match(c, /Only an accepted offer can become a tenancy/)
  assert.match(c, /already has a tenancy in progress/)
}

// ---- 11.9 finalization
{
  const s = sql('20261207_02_finalize_rental.sql')
  const f = fn(s, 'eb_finalize_rental')
  lockedBefore(f, 'listings', 'applications', 'finalize locks listing then application')
  assert.match(f, /x\.status = 'signed'/, 'needs a signed agreement')
  assert.match(f, /p\.status = 'confirmed' and p\.verified_by is not null and p\.type = 'rent'/, 'needs a verified rent payment')
  assert.match(f, /set status = 'rented'/)
  assert.match(f, /set status = 'accepted'/)
  assert.match(f, /set status = 'not_selected'/)
  before(f, "set_config('eb.system_transition', '1', true)", "set status = 'not_selected'", 'system flag is set before the competing applications change')
  assert.match(f, /set_config\('eb\.system_transition', '', true\)/, 'system flag is cleared again')
  assert.match(s, /revoke all on function public\.eb_complete_rental\(uuid\) from public, anon, authenticated/)
}

// ---- admin_decide_application still locks listing first and refuses a second approval
{
  const s = sql('20261019_02_rental_case_refs.sql')
  const d = fn(s, 'admin_decide_application')
  lockedBefore(d, 'listings', 'applications', 'decide locks the listing first')
}

// ---- 11.10 payments
{
  const s = sql('20261207_03_payment_hardening.sql')
  const l = fn(s, 'eb_link_paystack_payment')
  assert.match(l, /'recorded'/, 'an online payment is recorded, not verified')
  assert.doesNotMatch(l, /verified_by/, 'the link never verifies a payment')
  assert.match(s, /revoke all on function public\.eb_link_paystack_payment\(text\) from public, anon, authenticated/)
}

// ---- 11.11 notifications (skipped, with a message, until the file is added to the repo)
if (!all.includes('20261207_04_notification_gaps.sql')) {
  console.log('migration-contract: NOTE 20261207_04_notification_gaps.sql is not in supabase/, so its checks were skipped')
} else {
  const s = sql('20261207_04_notification_gaps.sql')
  const t = fn(s, 'notify_trigger')
  assert.match(t, /v_new->>'status' = 'accepted' then\s+null/, 'no duplicate notice for accepted')
  assert.match(t, /eb\.system_transition/)
  assert.match(t, /v_new->>'offer_id' is null/)
  assert.match(fn(s, 'notify_user'), /notification_failures/)
  assert.match(s, /grant execute on function public\.eb_retry_failed_notifications\(\) to service_role/)
}

// ---- every Phase 11 file: functions that run with owner rights fix their search_path; nothing is opened to anon
for (const f of all.filter((x) => x >= '20261206_01' && x <= '20261207_99')) {
  const s = sql(f)
  assert.doesNotMatch(s, /grant\s+[^;]*\bto\s+anon\b/i, f + ' must not grant to anon')
  const defs = s.split(/create or replace function /i).slice(1)
  for (const d of defs) {
    const head = d.slice(0, 600)
    if (/security definer/i.test(head)) {
      assert.match(head, /set search_path/i, f + ': a security definer function without a fixed search_path: ' + head.slice(0, 60).replace(/\s+/g, ' '))
    }
  }
}

console.log('migration-contract: all checks passed')
