import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/20261205_04_remote_inspection_review.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '')

function fn(name) {
  const i = code.indexOf(`create or replace function public.${name}(`)
  assert.ok(i >= 0, `${name} is missing`)
  const j = code.indexOf('create or replace function', i + 10)
  return code.slice(i, j < 0 ? undefined : j)
}

// no money for tenants, and no badge or public output
assert.doesNotMatch(code, /paystack|checkout|payment|price|charge_|fee\b/i)
assert.doesNotMatch(code, /public_listing_inspections|public_summary|update public\.listings|insert into public\.(applications|viewings)/)
assert.doesNotMatch(code, /update public\.property_inspections/)   // a remote inspection keeps review_status 'submitted'

// submission moves scheduled -> in_review through a trigger that only fires for remote jobs, and never blocks the inspector
assert.match(code, /create trigger zz_remote_job_submitted after update of status on public\.inspection_jobs/)
assert.match(code, /new\.service_type = 'remote' and old\.status = 'assigned' and new\.status = 'submitted' and new\.request_id is not null/)
const sub = fn('eb_remote_job_submitted')
assert.match(sub, /status = 'scheduled'/)
assert.match(sub, /exception when others then/)
assert.match(sub, /notify_admins/)

// the money of a released inspection stays counted until the payout step
assert.match(fn('eb_remote_budget_available'), /status = 'completed' and budget_reserved > 0/)

// nobody involved can review: the inspector, the tenant, the landlord
const target = fn('eb_remote_review_target')
assert.match(target, /i\.inspected_by = p_uid or r\.tenant_id = p_uid or r\.landlord_id is not distinct from p_uid/)
assert.match(target, /r\.status <> 'in_review'/)

// admin only
for (const f of ['admin_remote_review_queue', 'admin_remote_review_detail', 'admin_remote_review_decide']) {
  assert.match(fn(f), /eb_remote_require_admin\(\)/, `${f}: admin check`)
  assert.match(code, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon`), `${f}: anon revoke`)
  assert.match(code, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated`), `${f}: grant`)
}
assert.match(code, /revoke all on function public\.eb_remote_review_target\(uuid, uuid, boolean\) from public, anon, authenticated/)
assert.match(code, /revoke all on function public\.eb_remote_job_submitted\(\) from public, anon, authenticated/)

// the detail never carries storage paths
assert.match(fn('admin_remote_review_detail'), /- 'evidence_paths'/)

// the decision
const dec = fn('admin_remote_review_decide')
assert.match(dec, /p_decision not in \('released','reinspect','rejected'\)/)
assert.match(dec, /Write the reason, at least 5 characters/)
assert.match(dec, /eb_inspection_approval_blockers\(i\.id\)/)           // same evidence rules as a verification
assert.match(dec, /Cannot release yet/)
assert.match(dec, /status = 'completed', review_decision = 'released'[\s\S]*report_released_at = now\(\)/)
assert.match(dec, /status = 'ready_for_assignment', review_decision = 'reinspect'/)
assert.match(dec, /status = 'closed', review_decision = 'rejected'/)
assert.match(dec, /cancelled_at = now\(\), cancelled_by = uid/)         // open requests for more evidence are cancelled
// the landlord only learns that a visit took place; the tenant is never sent the internal note
assert.doesNotMatch(dec, /notify_user\([^;]*(v_note|review_note)/)
assert.doesNotMatch(dec, /notify_user\(r\.landlord_id[^;]*(verdict|report|photo|finding)/i)
// every decision is written to the request history and the audit log
assert.ok((dec.match(/perform public\.eb_remote_event\(/g) || []).length >= 3)
assert.ok((dec.match(/perform public\.audit_write\(/g) || []).length >= 3)

// the tenant can no longer read the request table directly (that exposed the landlord's note and the review notes)
assert.match(code, /drop policy if exists "Tenants read own inspection requests" on public\.inspection_requests/)
assert.doesNotMatch(code, /create policy[^;]*tenant/i)

// the admin evidence route: admin only, recorded before the link is made, blocks people involved
const route = readFileSync('app/api/admin/inspection-evidence/open/route.ts', 'utf8')
assert.match(route, /authAdmin\(req\)/)
assert.ok(route.indexOf('eb_inspection_log_open') < route.indexOf('createSignedUrl'))
assert.match(route, /q\.tenant_id === a\.user\.id \|\| q\.landlord_id === a\.user\.id/)
assert.match(route, /createSignedUrl\(path, 300\)/)

// the review page: only the RPCs, never the tables; accept needs the file to be opened; no public summary and no badge
const page = readFileSync('app/admin/remote-inspection-reviews/page.tsx', 'utf8')
assert.doesNotMatch(page, /\.from\('(inspection_requests|property_inspections|inspection_evidence_files)'\)/)
assert.match(page, /admin_remote_review_decide/)
assert.match(page, /disabled=\{busy \|\| !f\.opened_by_me\}/)
assert.doesNotMatch(page, /public_summary|admin_review_inspection['"(]/)
assert.match(readFileSync('app/admin/layout.tsx', 'utf8'), /\/admin\/remote-inspection-reviews/)

console.log('remote-inspection-review: all checks passed')
