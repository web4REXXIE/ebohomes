import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const q = await load('lib/admin-queues.ts')

const base = {
  listings: [], viewings: [], applications: [], terms: [], payments: [], disputes: [], settlements: [],
  tenancyApplicationIds: [], tenancyListing: { T1: 'L9' }, names: { u1: 'Ada' },
}

// Empty input gives empty queues
const empty = q.buildQueues(base)
for (const k of q.QUEUE_ORDER) assert.deepEqual(empty[k], [])

// Listings are oldest first
let r = q.buildQueues({ ...base, listings: [
  { id: 'new', created_at: '2026-10-18T00:00:00Z' }, { id: 'old', created_at: '2026-10-01T00:00:00Z' },
] })
assert.deepEqual(r.listings.map((x) => x.listingId), ['old', 'new'])

// Viewings split into the right queues; interested needs the saved decision
r = q.buildQueues({ ...base, viewings: [
  { id: 'aaaaaaaa-1', listing_id: 'L1', tenant_id: 'u1', status: 'requested', created_at: '2026-10-10T00:00:00Z' },
  { id: 'bbbbbbbb-2', listing_id: 'L2', status: 'approved', created_at: '2026-10-11T00:00:00Z' },
  { id: 'cccccccc-3', listing_id: 'L3', application_id: 'A3', status: 'completed', tenant_decision: 'interested', created_at: '2026-10-12T00:00:00Z' },
  { id: 'dddddddd-4', listing_id: 'L4', status: 'completed', tenant_decision: null },
  { id: 'eeeeeeee-5', listing_id: 'L5', status: 'completed', tenant_decision: 'not_interested' },
  { id: 'ffffffff-6', listing_id: 'L6', status: 'scheduled' },
] })
assert.equal(r.viewing_respond.length, 1)
assert.equal(r.viewing_respond[0].who, 'Ada')
assert.equal(r.viewing_respond[0].ref, 'VW-AAAAAAAA')
assert.equal(r.viewing_schedule.length, 1)
assert.equal(r.interested.length, 1)
assert.equal(r.interested[0].listingId, 'L3')
assert.ok(/not approved|reserved/i.test(r.interested[0].detail))

// An interested tenant leaves the queue once a tenancy exists for the application
r = q.buildQueues({ ...base, tenancyApplicationIds: ['A3'], viewings: [
  { id: 'cccccccc-3', listing_id: 'L3', application_id: 'A3', status: 'completed', tenant_decision: 'interested' },
] })
assert.equal(r.interested.length, 0)

// Applications: pending, or info requested AND the tenant replied
r = q.buildQueues({ ...base, applications: [
  { id: '1', status: 'pending', listing_id: 'L1', case_ref: 'APP-1' },
  { id: '2', status: 'info_requested', listing_id: 'L2', tenant_reply: '' },
  { id: '3', status: 'info_requested', listing_id: 'L3', tenant_reply: 'Here is my ID' },
  { id: '4', status: 'approved', listing_id: 'L4' },
  { id: '5', status: 'rejected', listing_id: 'L5' },
] })
assert.deepEqual(r.applications.map((x) => x.key), ['a-1', 'a-3'])
assert.equal(r.applications[0].ref, 'APP-1')

// Terms: only accepted ones need EboHomes; the tenancy gives the property
r = q.buildQueues({ ...base, terms: [
  { id: 'x', tenancy_id: 'T1', status: 'accepted', version: 2 },
  { id: 'y', tenancy_id: 'T1', status: 'proposed' },
  { id: 'z', tenancy_id: 'T1', status: 'signed' },
] })
assert.equal(r.terms.length, 1)
assert.equal(r.terms[0].listingId, 'L9')

// Payments: only recorded or pending are awaiting verification. Confirmed and rejected never appear.
r = q.buildQueues({ ...base, payments: [
  { id: '1', listing_id: 'L1', amount: 1200000, status: 'recorded', type: 'rent' },
  { id: '2', tenancy_id: 'T1', amount: 50000, status: 'pending', type: 'caution_deposit' },
  { id: '3', listing_id: 'L1', amount: 5, status: 'confirmed' },
  { id: '4', listing_id: 'L1', amount: 5, status: 'rejected' },
] })
assert.equal(r.payments.length, 2)
assert.equal(r.payments[0].detail, '₦1,200,000 · Rent')
assert.equal(r.payments[1].listingId, 'L9')
assert.ok(r.payments.every((p) => /awaiting verification/i.test(p.status)))

// Disputes and settlements
r = q.buildQueues({ ...base,
  disputes: [{ id: '1', tenancy_id: 'T1', category: 'deposit', status: 'open' }, { id: '2', tenancy_id: 'T1', status: 'resolved' }, { id: '3', tenancy_id: 'T1', status: 'under_review' }],
  settlements: [{ id: '1', tenancy_id: 'T1', status: 'agreed' }, { id: '2', tenancy_id: 'T1', status: 'proposed' }, { id: '3', tenancy_id: 'T1', status: 'disputed' }],
})
assert.equal(r.disputes.length, 2)
assert.equal(r.disputes[0].detail, 'Deposit')
assert.equal(r.settlements.length, 2)

assert.equal(q.formatNaira(null), '₦0')
console.log('admin-queues tests passed')