import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/20261205_02_remote_inspection_requests.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '')

// function body by name, up to the next function
function fn(name) {
  const i = code.indexOf(`create or replace function public.${name}(`)
  assert.ok(i >= 0, `${name} is missing`)
  const j = code.indexOf('create or replace function', i + 10)
  return code.slice(i, j < 0 ? undefined : j)
}

// no money for tenants
assert.doesNotMatch(code, /paystack|checkout|payment|price|charge_|fee\b/i)

// request: eligibility, fair use, duplicates, own-property block, no application and no reservation
const req = fn('tenant_request_remote_inspection')
assert.match(req, /eb_remote_listing_problem/)
assert.match(req, /max_open_per_tenant/)
assert.match(req, /max_requests_per_30_days/)
assert.match(req, /exception when unique_violation/)
assert.match(req, /You cannot request an inspection of your own property/)
assert.doesNotMatch(req, /insert into public\.(applications|viewings)|update public\.listings/)

// eligibility: only approved, not rented, not on hold
const prob = fn('eb_remote_listing_problem')
assert.match(prob, /l\.status is distinct from 'approved'/)
assert.match(prob, /listing_on_hold/)

// cancel: owner only, reason required, only before the report stage, cancels the job through the flag, resets the flag
const cancel = fn('tenant_cancel_remote_inspection')
assert.match(cancel, /r\.tenant_id <> uid/)
assert.match(cancel, /Tell us briefly why you are cancelling/)
assert.match(cancel, /'awaiting_landlord','awaiting_rescheduling','ready_for_assignment','offered','scheduled'/)
assert.doesNotMatch(cancel, /'in_review'|'completed'/)
assert.match(cancel, /set_config\('eb\.remote_ok', '1', true\)/)
assert.match(cancel, /set_config\('eb\.remote_ok', '', true\)/)

// landlord: only the owner, refusal needs a reason, confirmation needs a time, ready_for_assignment starts the assignment clock
const land = fn('landlord_respond_remote_inspection')
assert.match(land, /r\.landlord_id is distinct from uid/)
assert.match(land, /v_owner is distinct from uid/)
assert.match(land, /Say briefly why access cannot be given/)
assert.match(land, /status = 'ready_for_assignment', ready_at = now\(\), assign_due_at/)
assert.match(land, /status = 'access_refused'/)
// the tenant is never told the landlord's own words
for (const part of land.split('perform public.notify_user(r.tenant_id').slice(1)) {
  const call = part.slice(0, part.indexOf("'general')"))
  assert.doesNotMatch(call, /v_note|landlord_note/)
}

// what each person can see
const mine = fn('my_remote_inspection_requests')
assert.doesNotMatch(mine, /landlord_note|landlord_id|budget|offered_inspector|review_note|closed_reason/)
assert.match(mine, /r\.tenant_id = auth\.uid\(\)/)
const theirs = fn('my_landlord_inspection_requests')
assert.doesNotMatch(theirs, /tenant_id|tenant_note|review_|report|offered_inspector|budget/)
assert.match(theirs, /l\.landlord_id = auth\.uid\(\)/)

// every user-facing function is closed to anon and open to signed-in users; helpers are closed to everyone
for (const f of ['tenant_request_remote_inspection', 'tenant_cancel_remote_inspection', 'landlord_respond_remote_inspection', 'my_remote_inspection_requests', 'my_landlord_inspection_requests']) {
  assert.match(code, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon`), `${f}: anon revoke`)
  assert.match(code, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated`), `${f}: grant`)
}
assert.match(code, /revoke all on function public\.eb_remote_event\([^)]*\) from public, anon, authenticated/)
assert.match(code, /revoke all on function public\.eb_remote_listing_problem\(uuid\) from public, anon, authenticated/)

// every change is written to the request history and the audit log
assert.ok((code.match(/perform public\.eb_remote_event\(/g) || []).length >= 4)
assert.ok((code.match(/perform public\.audit_write\(/g) || []).length >= 4)

console.log('remote-inspection-requests: all checks passed')
