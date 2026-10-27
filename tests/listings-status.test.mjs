import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const m = await load('lib/listing-status.ts')

assert.equal(m.listingGroup('approved'), 'live')
assert.equal(m.listingGroup('pending'), 'review')
assert.equal(m.listingGroup(null), 'review')
assert.equal(m.listingGroup('rejected'), 'attention')
assert.equal(m.listingGroup('suspended'), 'attention')
// A rented listing is not live: tenants cannot see it.
assert.equal(m.listingGroup('rented'), 'other')

const r = m.listingStatusInfo('rented')
assert.equal(r.label, 'Rented')
// Rented means payment verified AND key handover confirmed. A signed agreement alone is not enough, so the text must not say so.
assert.match(r.meaning, /payment is verified/i)
assert.match(r.meaning, /key handover is confirmed/i)
assert.doesNotMatch(r.meaning, /agreement/i)
assert.equal(r.tone, 'blue')
// Other statuses keep their meanings.
assert.equal(m.listingStatusInfo('paused').label, 'Paused by you')
assert.equal(m.listingStatusInfo('suspended').label, 'Hidden by EboHomes')
assert.equal(m.listingStatusInfo('approved').tone, 'green')
assert.equal(m.listingStatusInfo(undefined).label, 'Waiting for EboHomes review')

const g = m.groupListings([
  { status: 'approved', reviewed_at: '2026-10-01T00:00:00Z' },
  { status: 'approved', reviewed_at: '2026-10-05T00:00:00Z' },
  { status: 'rented', created_at: '2026-09-01T00:00:00Z' },
])
assert.equal(g.live[0].reviewed_at, '2026-10-05T00:00:00Z')
assert.equal(g.other.length, 1)
assert.equal(m.isNewlyApproved({ status: 'approved', reviewed_at: '2026-10-05T00:00:00Z' }, new Date('2026-10-01').getTime()), true)
assert.equal(m.isNewlyApproved({ status: 'rented', reviewed_at: '2026-10-05T00:00:00Z' }, 0), false)
console.log('listing-status ok')