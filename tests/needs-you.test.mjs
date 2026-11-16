import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const { buildNeedsYou } = await load('lib/needs-you.ts')
const now = new Date('2026-11-16T12:00:00Z').getTime()
const hoursFromNow = (h) => new Date(now + h * 3_600_000).toISOString()
const ok = { needsAction: false, rejected: false, detail: '', actionLabel: 'Open' }
const base = { now, listingsLoaded: true, listingCount: 2, attention: [], offers: [], verification: ok, openApplications: 0 }
const keys = (r) => r.items.map((i) => i.key)

// Nothing to do: empty and complete
let r = buildNeedsYou(base)
assert.deepEqual(r.items, [])
assert.equal(r.partial, false)

// Offers come first, soonest deadline on top. Expired offers are dropped.
r = buildNeedsYou({
  ...base,
  verification: { needsAction: true, rejected: false, detail: 'Finish it.', actionLabel: 'Get verified' },
  openApplications: 3,
  offers: [
    { id: 'late', title: 'Flat B', expires_at: hoursFromNow(100) },
    { id: 'soon', title: 'Flat A', expires_at: hoursFromNow(5) },
    { id: 'gone', title: 'Flat C', expires_at: hoursFromNow(-1) },
  ],
})
assert.deepEqual(keys(r), ['offer-soon', 'offer-late', 'verify', 'applications'])
assert.match(r.items[0].text, /5 hours left/)
assert.match(r.items[1].text, /4 days left/)
assert.equal(r.items.find((i) => i.key === 'applications').optional, true)

// Listings to fix: one row each up to three, with the reason. Suspended says hidden.
r = buildNeedsYou({
  ...base,
  attention: [
    { id: 'a', title: 'Flat A', status: 'rejected', reason: 'Photos are blurry' },
    { id: 'b', title: 'Flat B', status: 'suspended', reason: null },
  ],
})
assert.deepEqual(keys(r), ['fix-a', 'fix-b'])
assert.match(r.items[0].text, /Photos are blurry/)
assert.match(r.items[1].title, /hidden/)
assert.equal(r.items[0].href, '/dashboard/listings#listing-a')

// More than three collapses into one summary row
r = buildNeedsYou({ ...base, attention: ['1', '2', '3', '4'].map((x) => ({ id: x, title: x, status: 'rejected', reason: null })) })
assert.deepEqual(keys(r), ['fix-many'])

// Verification rejected has its own wording
r = buildNeedsYou({ ...base, verification: { needsAction: true, rejected: true, detail: '', actionLabel: 'Update' } })
assert.equal(r.items[0].title, 'Update your verification details')

// No properties yet: first-property row
r = buildNeedsYou({ ...base, listingCount: 0 })
assert.deepEqual(keys(r), ['first-property'])

// Anything that could not be loaded marks the list partial, and is never shown as "none"
r = buildNeedsYou({ ...base, offers: null })
assert.equal(r.partial, true)
r = buildNeedsYou({ ...base, openApplications: null })
assert.equal(r.partial, true)
r = buildNeedsYou({ ...base, listingsLoaded: false, listingCount: 0, attention: [{ id: 'x', title: 'X', status: 'rejected', reason: null }] })
assert.equal(r.partial, true)
assert.deepEqual(r.items, [], 'listing rows are skipped when listings failed to load')

// An offer with no readable deadline still shows
r = buildNeedsYou({ ...base, offers: [{ id: 'n', title: 'Flat N', expires_at: null }] })
assert.deepEqual(keys(r), ['offer-n'])

console.log('needs-you ok')
