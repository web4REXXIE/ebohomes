import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const m = await load('lib/admin-awaiting-terms.ts')
const ten = (id, status, at) => ({ id, listing_id: 'L' + id, tenant_id: 'u' + id, status, created_at: at })
const names = { u1: 'Ada', u2: 'Bola', u3: 'Chi', u4: 'Dayo' }

const out = m.tenanciesAwaitingTerms({
  tenancies: [
    ten('2', 'active', '2026-10-10T00:00:00Z'),
    ten('1', 'active', '2026-10-05T00:00:00Z'),
    ten('3', 'active', '2026-10-06T00:00:00Z'),
    ten('4', 'ended', '2026-10-01T00:00:00Z'),
  ],
  terms: [
    { tenancy_id: '1', status: 'proposed' },
    { tenancy_id: '3', status: 'signed' },
  ],
  names,
})
// 3 has signed terms, 4 is ended: only 1 and 2 remain, oldest first.
assert.deepEqual(out.map((i) => i.key), ['t-1', 't-2'])
assert.match(out[0].status, /proposed/i)
assert.match(out[1].status, /no rental terms/i)
assert.equal(out[0].who, 'Ada')
assert.equal(out[0].href, '/admin/cases')

// Accepted terms also leave the queue (they appear in the existing "awaiting signed record" queue).
const acc = m.tenanciesAwaitingTerms({ tenancies: [ten('1', 'active', null)], terms: [{ tenancy_id: '1', status: 'accepted' }], names })
assert.equal(acc.length, 0)
// A declined or superseded proposal does not count as agreed.
const dec = m.tenanciesAwaitingTerms({ tenancies: [ten('1', 'active', null)], terms: [{ tenancy_id: '1', status: 'declined' }], names })
assert.equal(dec.length, 1)
assert.match(dec[0].status, /no rental terms/i)
console.log('admin-awaiting-terms ok')
