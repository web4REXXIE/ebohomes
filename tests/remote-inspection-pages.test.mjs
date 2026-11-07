import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const r = await load('lib/remote-inspection.ts')
const fmt = (x) => (x ? 'DATE' : '-')
const NOW = new Date('2026-12-07T10:00:00Z')

// ---- the button on the property page
const base = { listingId: 'L1', listingStatus: 'approved', signedIn: true, isOwner: false, onHold: false, openRequest: null }
assert.equal(r.decideEntry({ ...base, isOwner: true }).kind, 'hidden', 'owner never sees it')
assert.equal(r.decideEntry({ ...base, listingStatus: 'rented' }).kind, 'disabled')
for (const s of ['draft', 'pending', 'suspended', 'rejected', 'archived', 'withdrawn', null, undefined]) {
  assert.equal(r.decideEntry({ ...base, listingStatus: s }).kind, 'disabled', `status ${s}`)
}
assert.equal(r.decideEntry({ ...base, onHold: true }).kind, 'disabled', 'on hold')
const out = r.decideEntry({ ...base, signedIn: false })
assert.equal(out.kind, 'link')
assert.match(out.href, /^\/login\?redirect=%2Finspect%2FL1$/)
const ask = r.decideEntry(base)
assert.equal(ask.kind, 'link')
assert.equal(ask.href, '/inspect/L1')
assert.equal(r.decideEntry({ ...base, openRequest: { id: 'x', status: 'awaiting_landlord' } }).href, '/inspections', 'no duplicate request button')

// ---- statuses: honest wording, nothing "confirmed" before scheduled
for (const s of ['awaiting_landlord', 'awaiting_rescheduling', 'ready_for_assignment', 'offered']) {
  const line = r.tenantLine({ status: s }, fmt)
  assert.doesNotMatch(r.statusLabel(s), /scheduled|confirmed|booked/i, s)
  assert.doesNotMatch(line, /booked for|is booked/i, s)
}
assert.match(r.tenantLine({ status: 'scheduled', scheduled_for: 'x' }, fmt), /booked for DATE/)
assert.match(r.tenantLine({ status: 'access_refused' }, fmt), /could not be confirmed/)
// the refusal line never carries the owner's words or a reason
assert.doesNotMatch(r.tenantLine({ status: 'access_refused' }, fmt), /reason|because|refus/i)

// ---- open and closed statuses match the database unique index
assert.deepEqual(r.CLOSED_STATUSES, ['completed', 'cancelled', 'expired', 'access_refused', 'closed'])
assert.equal(r.isOpen('scheduled'), true)
assert.equal(r.isOpen('cancelled'), false)
assert.ok(!r.TENANT_CANCELLABLE.includes('in_review') && !r.TENANT_CANCELLABLE.includes('completed'))

// ---- grouping
assert.equal(r.tenantGroup({ status: 'awaiting_landlord' }), 'waiting')
assert.equal(r.tenantGroup({ status: 'scheduled' }), 'scheduled')
assert.equal(r.tenantGroup({ status: 'cancelled' }), 'past')
assert.equal(r.landlordGroup({ status: 'awaiting_landlord' }), 'action')
assert.equal(r.landlordGroup({ status: 'awaiting_rescheduling' }), 'action')
assert.equal(r.landlordGroup({ status: 'ready_for_assignment' }), 'waiting')

// ---- the owner's labels never mention a report
for (const s of ['awaiting_landlord', 'ready_for_assignment', 'scheduled', 'in_review', 'completed', 'access_refused']) {
  assert.doesNotMatch(r.landlordLabel(s), /report|pass|fail/i, s)
}
assert.match(r.LANDLORD_PRIVACY_NOTE, /will not see the tenant/)

// ---- preferred time: optional, both or neither, 60 days, end after start, within 14 days
assert.equal(r.checkPreferredWindow('', '', NOW), null)
assert.match(r.checkPreferredWindow('2026-12-10T10:00', '', NOW), /both/)
assert.equal(r.checkPreferredWindow('2026-12-10T10:00', '2026-12-10T16:00', NOW), null)
assert.match(r.checkPreferredWindow('2026-12-10T16:00', '2026-12-10T10:00', NOW), /after the start/)
assert.match(r.checkPreferredWindow('2026-12-10T10:00', '2026-12-30T10:00', NOW), /within 14 days/)
assert.match(r.checkPreferredWindow('2027-03-01T10:00', '2027-03-01T12:00', NOW), /60 days/)
assert.match(r.checkPreferredWindow('2026-11-01T10:00', '2026-11-01T12:00', NOW), /60 days/)

// ---- owner time: 30 minutes to 30 days
assert.match(r.checkAccessTime('', NOW), /Choose a time/)
assert.match(r.checkAccessTime('2026-12-07T10:10', NOW), /30 minutes/)
assert.equal(r.checkAccessTime('2026-12-09T10:00', NOW), null)
assert.match(r.checkAccessTime('2027-02-20T10:00', NOW), /30 days/)

// ---- reasons
assert.match(r.checkReason('   ', 'cancelling'), /why you are cancelling/)
assert.match(r.checkReason('', 'refusing'), /kept on record|keeps this on record/)
assert.equal(r.checkReason('Travelling', 'cancelling'), null)
assert.match(r.checkReason('x'.repeat(301), 'cancelling'), /300/)

// ---- errors: database sentences pass through, technical ones are hidden
assert.equal(r.friendlyError('You already have an open inspection request for this property.'), 'You already have an open inspection request for this property.')
assert.match(r.friendlyError('relation "inspection_requests" does not exist'), /Something went wrong/)
assert.match(r.friendlyError('duplicate key value violates unique constraint'), /Something went wrong/)
assert.match(r.friendlyError(''), /Something went wrong/)

// ---- no money anywhere in the new screens or rules
const files = [
  'lib/remote-inspection.ts',
  'components/remote-inspection-request.tsx',
  'components/remote-inspections-manager.tsx',
  'components/remote-inspection-entry.tsx',
  'app/inspect/[listingId]/page.tsx',
  'app/inspections/page.tsx',
  'app/dashboard/inspection-requests/page.tsx',
]
for (const f of files) {
  const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /paystack|checkout|naira|₦|price|\bfee\b/i, `${f}: no money`)
}

// ---- screens call only the Step B functions, never the tables
const screens = files.slice(1).map((f) => readFileSync(f, 'utf8')).join('\n')
assert.doesNotMatch(screens, /\.from\('(inspection_requests|inspection_request_events|inspection_jobs|property_inspections|inspection_budget_ledger|inspection_payouts)'\)/)
for (const fn of ['tenant_request_remote_inspection', 'tenant_cancel_remote_inspection', 'landlord_respond_remote_inspection', 'my_remote_inspection_requests', 'my_landlord_inspection_requests']) {
  assert.match(screens, new RegExp(`'${fn}'`), fn)
}

// ---- the owner screen never asks for or shows the tenant
const mgr = readFileSync('components/remote-inspections-manager.tsx', 'utf8')
assert.doesNotMatch(mgr, /tenant_id|tenant_note|full_name|tenant_name/)

// ---- the request screen does not create an application or touch the listing
const req = readFileSync('components/remote-inspection-request.tsx', 'utf8')
assert.doesNotMatch(req, /\.from\('(applications|viewings)'\)\.(insert|update|upsert)|\.from\('listings'\)\.(insert|update|upsert)/)
assert.match(req, /does not apply for the property/i)
assert.match(req, /Inspected badge/)

// ---- listing page: the card is added and the old buttons are untouched
for (const f of ['app/listing/[id]/page.tsx', 'app/listing/[id]/layout.tsx']) {
  const src = readFileSync(f, 'utf8')
  assert.equal((src.match(/<RemoteInspectionEntry/g) || []).length, 1, f)
  assert.match(src, /PropertyActionsSidebar/, f)
}

// ---- navigation
const links = await load('lib/dashboard-links.ts')
assert.ok(links.TENANT_LINKS.some((l) => l.href === '/inspections'))
assert.ok(links.LANDLORD_LINKS.some((l) => l.href === '/dashboard/inspection-requests'))
assert.equal(links.isDashboardPath('/inspections'), true)

console.log('remote-inspection-pages: all checks passed')
