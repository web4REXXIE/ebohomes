import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const s = await load('lib/viewing-status.ts')
const fmt = (x) => (x ? 'DATE' : '—')

// Phone validation
assert.equal(s.normaliseNgPhone('0803 123 4567'), '+2348031234567')
assert.equal(s.normaliseNgPhone('+234 803 123 4567'), '+2348031234567')
assert.equal(s.normaliseNgPhone('2348031234567'), '+2348031234567')
assert.equal(s.normaliseNgPhone('12345'), null)
assert.equal(s.normaliseNgPhone(''), null)
assert.equal(s.normaliseNgPhone('0603 123 4567'), null)

// Approval WITHOUT a time must never say "scheduled"
const approved = s.tenantPanel({ status: 'approved' }, fmt)
assert.ok(!/SCHEDULED/.test(approved.heading))
assert.match(approved.body, /not scheduled yet/)
assert.equal(approved.owner, 'ebohomes')

// Request with no response
const requested = s.tenantPanel({ status: 'requested' }, fmt)
assert.equal(requested.heading, 'AWAITING EBOHOMES RESPONSE')
assert.equal(requested.tone, 'amber')

// Scheduled shows the confirmed time in green
const scheduled = s.tenantPanel({ status: 'scheduled', scheduled_for: '2026-11-01T10:00:00Z' }, fmt)
assert.equal(scheduled.heading, 'YOUR VIEWING HAS BEEN SCHEDULED')
assert.equal(scheduled.tone, 'green')
assert.match(scheduled.body, /DATE/)

// Proposed time asks the tenant to act
const proposed = s.tenantPanel({ status: 'reschedule_proposed', proposed_at: '2026-11-02T10:00:00Z' }, fmt)
assert.equal(proposed.owner, 'tenant')
assert.equal(proposed.tone, 'blue')

// Completed: decision prompt, then pending review is amber (never green), declined is grey
assert.match(s.tenantPanel({ status: 'completed' }, fmt).heading, /WHAT WOULD YOU LIKE TO DO NEXT/)
const interested = s.tenantPanel({ status: 'completed', tenant_decision: 'interested' }, fmt)
assert.equal(interested.tone, 'amber')
assert.match(interested.body, /Nothing is reserved or approved/)
assert.equal(s.tenantPanel({ status: 'completed', tenant_decision: 'not_interested' }, fmt).tone, 'grey')

// Rejected / missed / cancelled are red
for (const st of ['rejected', 'no_show', 'cancelled']) assert.equal(s.tenantPanel({ status: st }, fmt).tone, 'red')

// Open statuses match the database unique index
assert.deepEqual(s.OPEN_STATUSES, ['requested', 'approved', 'reschedule_proposed', 'scheduled'])

// Every status has a text label (never colour alone)
for (const st of ['requested', 'approved', 'reschedule_proposed', 'scheduled', 'completed', 'no_show', 'cancelled', 'rejected']) {
  assert.ok(s.viewingLabel(st).length > 3)
}
assert.equal(s.eventLabel('tenant_interested'), 'Tenant wants to continue with renting')
console.log('viewing-status tests passed')