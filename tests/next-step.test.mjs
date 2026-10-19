import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const n = await load('lib/next-step.ts')
const now = new Date('2026-10-18T12:00:00Z').getTime()
const base = { userId: 'me', now, viewings: [], applications: [], tenancies: [], terms: [], handovers: [], payments: [] }
const keys = (s) => s.map((x) => x.key)

// Nothing in the records means nothing to show
assert.deepEqual(n.buildSteps(base), [])

// A proposed viewing time beats everything else, then an information request, then the post-viewing choice
let s = n.buildSteps({ ...base,
  viewings: [
    { id: 'v1', listing_id: 'L1', application_id: 'A1', status: 'completed', tenant_decision: null },
    { id: 'v2', listing_id: 'L2', application_id: 'A2', status: 'reschedule_proposed' },
  ],
  applications: [
    { id: 'A1', listing_id: 'L1', status: 'approved' },
    { id: 'A2', listing_id: 'L2', status: 'approved' },
    { id: 'A3', listing_id: 'L3', status: 'info_requested' },
  ],
})
assert.deepEqual(keys(n.splitSteps(s).action).slice(0, 3), ['v-v2', 'a-A3', 'v-v1'])
assert.equal(s[0].listingId, 'L2')

// Interested does not claim approval, reservation or payment
s = n.buildSteps({ ...base,
  viewings: [{ id: 'v1', listing_id: 'L1', application_id: 'A1', status: 'completed', tenant_decision: 'interested' }],
  applications: [{ id: 'A1', listing_id: 'L1', status: 'pending' }],
})
assert.equal(s.length, 2)
assert.ok(s.every((x) => x.owner === 'ebohomes'))
assert.ok(s.some((x) => /Nothing is reserved/i.test(x.body)))

// Interested + approved application but no confirmation yet: the tenant must confirm on the application
s = n.buildSteps({ ...base,
  viewings: [{ id: 'v1', listing_id: 'L1', application_id: 'A1', status: 'completed', tenant_decision: 'interested' }],
  applications: [{ id: 'A1', listing_id: 'L1', status: 'approved', tenant_interest_at: null }],
})
assert.equal(s[0].href, '/applications')
assert.equal(s[0].owner, 'you')

// Once confirmed, the tenant only waits. No payment is asked for.
s = n.buildSteps({ ...base,
  viewings: [{ id: 'v1', listing_id: 'L1', application_id: 'A1', status: 'completed', tenant_decision: 'interested' }],
  applications: [{ id: 'A1', listing_id: 'L1', status: 'approved', tenant_interest_at: '2026-10-18T10:00:00Z' }],
})
assert.ok(s.every((x) => x.owner === 'ebohomes'))
assert.ok(s.every((x) => !/pay now/i.test(x.title + x.body)))

// Closed applications never ask the tenant to act
s = n.buildSteps({ ...base,
  viewings: [{ id: 'v1', listing_id: 'L1', application_id: 'A1', status: 'completed', tenant_decision: null }],
  applications: [{ id: 'A1', listing_id: 'L1', status: 'rejected' }],
})
assert.deepEqual(s, [])

// Past scheduled viewings are not shown as upcoming
s = n.buildSteps({ ...base, viewings: [
  { id: 'old', listing_id: 'L1', status: 'scheduled', scheduled_for: '2026-10-10T10:00:00Z' },
  { id: 'new', listing_id: 'L2', status: 'scheduled', scheduled_for: '2026-10-20T10:00:00Z' },
] })
assert.deepEqual(keys(s), ['v-new'])

// Approved application with no viewing: request one
s = n.buildSteps({ ...base, applications: [{ id: 'A1', listing_id: 'L1', status: 'approved' }] })
assert.equal(s[0].href, '/viewings')
assert.equal(s[0].owner, 'you')

// Tenancy: terms, handover and payments
const ten = { id: 'T1', listing_id: 'L9', title: 'Modern House', status: 'active', application_id: 'A1' }
s = n.buildSteps({ ...base, tenancies: [ten] })
assert.equal(s[0].owner, 'ebohomes')
s = n.buildSteps({ ...base, tenancies: [ten], terms: [{ id: 'x', tenancy_id: 'T1', status: 'proposed', tenant_accepted_at: null }] })
assert.equal(s[0].owner, 'you')
assert.equal(s[0].href, '/tenancies/T1')
s = n.buildSteps({ ...base, tenancies: [ten], terms: [{ id: 'x', tenancy_id: 'T1', status: 'proposed', tenant_accepted_at: '2026-10-18' }] })
assert.equal(s[0].owner, 'ebohomes')
s = n.buildSteps({ ...base, tenancies: [ten], terms: [{ id: 'x', tenancy_id: 'T1', status: 'signed' }],
  handovers: [{ id: 'h1', tenancy_id: 'T1', kind: 'move_in', status: 'submitted', submitted_by: 'landlord' }, { id: 'h2', tenancy_id: 'T1', kind: 'move_out', status: 'submitted', submitted_by: 'me' }] })
assert.deepEqual(keys(s), ['h-h1'])

// Payments: verified or confirmed ones need nothing; recorded ones wait; rejected ones ask the tenant to look
s = n.buildSteps({ ...base, tenancies: [ten], terms: [{ id: 'x', tenancy_id: 'T1', status: 'signed' }], payments: [
  { id: 'p1', tenancy_id: 'T1', amount: 1200000, status: 'confirmed', verified_by: 'admin' },
  { id: 'p2', tenancy_id: 'T1', amount: 50000, status: 'recorded' },
  { id: 'p3', tenancy_id: 'T1', amount: 5000, status: 'rejected' },
] })
assert.deepEqual(keys(s), ['p-p3', 'p-p2'])
assert.ok(/₦50,000/.test(s[1].title))
assert.equal(s[0].owner, 'you')

// Ended tenancies are ignored
s = n.buildSteps({ ...base, tenancies: [{ ...ten, status: 'ended' }] })
assert.deepEqual(s, [])

console.log('next-step tests passed')