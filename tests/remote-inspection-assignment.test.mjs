import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/20261205_03_remote_inspection_assignment.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '')

function fn(name) {
  const i = code.indexOf(`create or replace function public.${name}(`)
  assert.ok(i >= 0, `${name} is missing`)
  const j = code.indexOf('create or replace function', i + 10)
  return code.slice(i, j < 0 ? undefined : j)
}

// no money for tenants, no payment gateway
assert.doesNotMatch(code, /paystack|checkout|tenant_fee|inspection_fee/i)
assert.doesNotMatch(code, /insert into public\.(applications|viewings)|update public\.listings/)

// every admin function checks for an admin first
for (const f of ['admin_remote_queue', 'admin_remote_suggest_inspectors', 'admin_remote_offer', 'admin_remote_return_to_queue',
                 'admin_remote_add_budget', 'admin_remote_save_settings', 'admin_remote_run_timers']) {
  assert.match(fn(f), /eb_remote_require_admin\(\)/, `${f}: admin check`)
}
assert.match(fn('eb_remote_require_admin'), /is_admin\(\)/)

// offer: right status, property still open, access time still ahead, active inspector, no self or party assignment, budget, reason to change
const offer = fn('admin_remote_offer')
assert.match(offer, /r\.status not in \('ready_for_assignment','offered'\)/)
assert.match(offer, /eb_remote_listing_problem/)
assert.match(offer, /inspector_accept_minutes/)
assert.match(offer, /status = 'active'/)
assert.match(offer, /p_inspector = uid/)
assert.match(offer, /p_inspector = r\.tenant_id/)
assert.match(offer, /eb_remote_budget_available/)
assert.match(offer, /cost_per_inspection/)
assert.match(offer, /Give a short reason for changing the inspector/)
assert.match(offer, /status = 'offered'/)
assert.doesNotMatch(offer, /insert into public\.inspection_jobs/) // no job until the inspector accepts

// suggestions: active only, never the tenant, the landlord or the admin; ranked; the admin decides
const sug = fn('admin_remote_suggest_inspectors')
assert.match(sug, /i\.status = 'active'/)
assert.match(sug, /i\.user_id <> r\.tenant_id/)
assert.match(sug, /auth\.uid\(\)/)
assert.match(sug, /workload/)
assert.match(sug, /area_match/)

// inspector: only the offered inspector, only while offered, not after expiry, decline needs a reason, accept makes the remote job through the flag
const resp = fn('inspector_respond_remote_offer')
assert.match(resp, /r\.offered_inspector is distinct from uid or r\.status <> 'offered'/)
assert.match(resp, /offer_due_at < now\(\)/)
assert.match(resp, /Say briefly why you cannot take this inspection/)
assert.match(resp, /'remote'/)
assert.match(resp, /set_config\('eb\.remote_ok', '1', true\)/)
assert.match(resp, /set_config\('eb\.remote_ok', '', true\)/)
assert.match(resp, /status = 'scheduled'/)
assert.match(resp, /status = 'ready_for_assignment'/)
// nobody is told the other side's name; the landlord is not told the tenant
assert.doesNotMatch(resp, /notify_user\(r\.landlord_id[^;]*tenant/i)

// inspector view: the access note appears only after accepting; no tenant fields
const mine = fn('inspector_my_remote_offers')
assert.match(mine, /case when r\.status = 'scheduled' then r\.landlord_note end/)
assert.match(mine, /r\.offered_inspector = auth\.uid\(\)/)
assert.doesNotMatch(mine, /tenant_id|tenant_note|budget/)

// take back: reason required, never after a report is submitted, cancels the job through the helper, restarts the assignment clock
const back = fn('admin_remote_return_to_queue')
assert.match(back, /Give the reason for taking this back/)
assert.match(back, /'submitted','reviewed'/)
assert.match(back, /eb_remote_cancel_job/)
assert.match(back, /assign_due_at = v_due/)

// the job cancel helper uses the flag and only cancels before submission
const cj = fn('eb_remote_cancel_job')
assert.match(cj, /set_config\('eb\.remote_ok', '1', true\)/)
assert.match(cj, /status in \('requested','assigned'\)/)

// budget: only the remote service type, append-only ledger entry, source required
const bud = fn('admin_remote_add_budget')
assert.match(bud, /'remote', 'allocation'/)
assert.doesNotMatch(bud, /'verification'/)
assert.match(bud, /Say where this money comes from/)
assert.match(fn('eb_remote_budget_available'), /service_type = 'remote'/)

// timers: every deadline from settings, every case from the brief
const t = fn('eb_run_remote_inspection_timers')
for (const word of ['closed_unavailable', 'landlord_no_response', 'expired_no_landlord', 'access_time_passed', 'offer_expired', 'escalated', 'expired_unassigned', 'visit_overdue']) {
  assert.match(t, new RegExp(word), `timer case ${word}`)
}
for (const col of ['rescheduling_expiry_days', 'escalate_after_hours', 'visit_grace_hours', 'landlord_response_hours']) assert.match(t, new RegExp(col))
assert.match(t, /l\.status = 'approved'/)
assert.match(t, /for update skip locked/)
assert.doesNotMatch(t, /status = 'completed'|status = 'in_review'/)

// who may call what
assert.match(code, /revoke all on function public\.eb_run_remote_inspection_timers\(text\) from public, anon, authenticated/)
assert.match(code, /grant execute on function public\.eb_run_remote_inspection_timers\(text\) to service_role/)
for (const f of ['admin_remote_queue()', 'admin_remote_suggest_inspectors(uuid)', 'admin_remote_offer(uuid, uuid, text)', 'inspector_my_remote_offers()',
                 'inspector_respond_remote_offer(uuid, text, text)', 'admin_remote_return_to_queue(uuid, text)', 'admin_remote_add_budget(numeric, text)',
                 'admin_remote_run_timers()']) {
  const esc = f.replace(/[()]/g, '\\$&')
  assert.match(code, new RegExp(`revoke all on function public\\.${esc} from public, anon`), `${f}: anon revoke`)
  assert.match(code, new RegExp(`grant execute on function public\\.${esc} to authenticated`), `${f}: grant`)
}
for (const h of ['eb_remote_require_admin()', 'eb_remote_audit(text, uuid, jsonb, jsonb, text)', 'eb_remote_cancel_job(uuid)', 'eb_remote_budget_available()']) {
  const esc = h.replace(/[()]/g, '\\$&')
  assert.match(code, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated`), `${h}: helper closed`)
}

// every change is written to the request history and the audit log
assert.ok((code.match(/perform public\.eb_remote_event\(/g) || []).length >= 12)
assert.ok((code.match(/perform public\.audit_write\(/g) || []).length >= 6)

// the app: the cron route is secret-protected and only calls the timers; the admin page uses functions, never the tables; no money for tenants
const cron = readFileSync('app/api/cron/remote-inspection-timers/route.ts', 'utf8')
assert.match(cron, /CRON_SECRET/)
assert.match(cron, /timingSafeEqual/)
assert.match(cron, /eb_run_remote_inspection_timers/)
const admin = readFileSync('app/admin/remote-inspections/page.tsx', 'utf8').replace(/^\s*\/\/.*$/gm, '')
assert.doesNotMatch(admin, /\.from\('(inspection_requests|inspection_jobs|inspectors|inspection_budget_ledger)'\)/)
assert.doesNotMatch(admin, /tenant_id|tenant_note|paystack|checkout/i)
const off = readFileSync('components/inspector-remote-offers.tsx', 'utf8').replace(/^\s*\/\/.*$/gm, '')
assert.doesNotMatch(off, /\.from\('/)
assert.doesNotMatch(off, /tenant/i)
assert.match(readFileSync('app/inspector/page.tsx', 'utf8'), /InspectorRemoteOffers/)
assert.match(readFileSync('app/admin/layout.tsx', 'utf8'), /\/admin\/remote-inspections/)

console.log('remote-inspection-assignment: all checks passed')
