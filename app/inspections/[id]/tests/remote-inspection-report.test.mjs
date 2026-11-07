import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/20261205_05_remote_inspection_report.sql', 'utf8')
const code = sql.replace(/--.*$/gm, '')

function fn(name) {
  const i = code.indexOf(`create or replace function public.${name}(`)
  assert.ok(i >= 0, `${name} is missing`)
  const j = code.indexOf('create or replace function', i + 10)
  return code.slice(i, j < 0 ? undefined : j)
}

// no money, no public output, no badge, nothing written except the history line
assert.doesNotMatch(code, /paystack|checkout|payment|price|charge_|fee\b/i)
assert.doesNotMatch(code, /public_listing_inspections|public_summary|update public\.|insert into public\.(applications|viewings|listings)/)

// the report: own request only, released only, nothing private in it
const rep = fn('my_remote_inspection_report')
assert.match(rep, /tenant_id = uid/)
assert.match(rep, /r\.status <> 'completed' or r\.report_released_at is null/)
assert.match(rep, /f\.discarded_at is null and f\.review_status = 'accepted'/)
assert.doesNotMatch(rep, /claimant|gps_|inspected_by|inspector|evidence_paths|storage_path|review_note|landlord|reviewed_by|integrity/i)

// the file helper: tenant, released, accepted only; recorded; closed to every browser role
const file = fn('eb_remote_report_file_path')
assert.match(file, /r\.tenant_id = p_uid and r\.status = 'completed' and r\.report_released_at is not null/)
assert.match(file, /f\.review_status = 'accepted' and f\.discarded_at is null/)
assert.match(file, /r\.job_id = j\.id/)
assert.match(file, /eb_remote_event\(v_req, 'report_file_opened'/)
assert.match(code, /revoke all on function public\.eb_remote_report_file_path\(uuid, uuid\) from public, anon, authenticated/)
assert.match(code, /revoke all on function public\.my_remote_inspection_report\(uuid\) from public, anon/)
assert.match(code, /grant execute on function public\.my_remote_inspection_report\(uuid\) to authenticated/)
assert.doesNotMatch(code, /grant execute on function public\.eb_remote_report_file_path/)

// the route: signed in, asks the database, short link, same answer for anything not allowed
const route = readFileSync('app/api/inspection-evidence/report/route.ts', 'utf8')
assert.match(route, /authUser\(req\)/)
assert.match(route, /eb_remote_report_file_path/)
assert.match(route, /createSignedUrl\(path, 300\)/)
assert.ok(route.indexOf('eb_remote_report_file_path') < route.indexOf('createSignedUrl'))
assert.doesNotMatch(route, /storage_path|\.from\('inspection_evidence_files'\)/)

// the page: RPC only, never a table; no storage paths, no public output
const page = readFileSync('app/inspections/[id]/page.tsx', 'utf8')
assert.match(page, /my_remote_inspection_report/)
assert.doesNotMatch(page, /\.from\('(inspection_requests|property_inspections|inspection_evidence_files)'\)/)
assert.doesNotMatch(page, /storage_path|public_summary/)
assert.match(page, /REPORT_PRIVACY_NOTE/)

// the list links to the report only when it is ready
const mgr = readFileSync('components/remote-inspections-manager.tsx', 'utf8')
assert.match(mgr, /role === 'tenant' && r\.status === 'completed' && r\.report_ready[\s\S]*?reportHref\(r\.id\)/)

// the helpers keep the privacy wording
const lib = readFileSync('lib/remote-inspection.ts', 'utf8')
assert.match(lib, /private to you/)
assert.match(lib, /does not give the property an Inspected badge/)

console.log('remote-inspection-report: all checks passed')
