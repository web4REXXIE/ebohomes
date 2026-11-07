import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/20261205_01_remote_inspection_foundation.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '') // ignore comments

// no money for tenants: no price, fee, checkout or payment-gateway objects in the new migration
assert.doesNotMatch(code, /paystack|checkout|tenant_fee|inspection_fee|price|charge/i)

// the two services stay separate
assert.match(code, /inspection_jobs_service_type_chk check \(service_type in \('verification','remote'\)\)/)
assert.match(code, /property_inspections_service_type_chk check \(service_type in \('verification','remote'\)\)/)
assert.match(code, /add column if not exists service_type text not null default 'verification'/)

// every new table is locked down: RLS on, browsers get select only
for (const t of ['remote_inspection_settings', 'inspection_requests', 'inspection_request_events', 'inspection_budget_ledger', 'inspection_payouts']) {
  assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`), `${t}: RLS`)
}
assert.match(code, /revoke all on public\.remote_inspection_settings[\s\S]*?from anon, authenticated, public/)
assert.doesNotMatch(code, /grant (insert|update|delete)[^;]*(inspection_requests|inspection_payouts|inspection_budget_ledger|inspection_request_events)/i)

// tenants read only their own requests; there is no landlord or inspector table policy
assert.match(code, /Tenants read own inspection requests[\s\S]*?tenant_id = auth\.uid\(\)/)
assert.doesNotMatch(code, /create policy[^;]*landlord/i)

// one open request per tenant and property; one payout per job
assert.match(code, /inspection_requests_one_open_uidx[\s\S]*?\(tenant_id, listing_id\)[\s\S]*?not in \('completed','cancelled','expired','access_refused','closed'\)/)
assert.match(code, /inspection_payouts_one_per_job_uidx on public\.inspection_payouts \(job_id\) where status <> 'void'/)

// history and money records are append-only
assert.match(code, /aa_insp_request_events_guard[\s\S]*?eb_inspection_history_immutable/)
assert.match(code, /aa_insp_budget_ledger_guard[\s\S]*?eb_inspection_history_immutable/)
assert.match(code, /Payout records are kept on record and cannot be deleted/)

// guards: remote jobs cannot be assigned from the old page, remote inspections cannot be approved as verification
assert.match(code, /eb\.remote_ok/)
assert.match(code, /new\.service_type = 'remote' and new\.review_status is distinct from old\.review_status/)
assert.match(code, /old\.status = 'assigned' and new\.status = 'submitted'/)

// a remote submission never counts as a verification's second inspector
const blockers = code.slice(code.indexOf('eb_inspection_approval_blockers'))
assert.equal((blockers.match(/o\.service_type = 'verification'/g) || []).length, 2)

// the public view is untouched
assert.doesNotMatch(code, /public_listing_inspections/)

// the old admin page only lists verification work
const admin = readFileSync('app/admin/inspections/page.tsx', 'utf8')
assert.equal((admin.match(/\.eq\('service_type', 'verification'\)/g) || []).length, 2)

console.log('remote-inspection-foundation: all checks passed')
