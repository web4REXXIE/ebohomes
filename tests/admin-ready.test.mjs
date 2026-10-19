import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const r = await load('lib/admin-ready.ts')
const out = r.readyForTenancy({
  names: { u1: 'Ada' },
  tenancyApplicationIds: ['A4'],
  applications: [
    { id: 'A1', status: 'approved', listing_id: 'L1', tenant_id: 'u1', case_ref: 'APP-1', tenant_interest_at: '2026-10-18T10:00:00Z' },
    { id: 'A0', status: 'approved', listing_id: 'L0', tenant_interest_at: '2026-10-10T10:00:00Z' },
    { id: 'A2', status: 'approved', listing_id: 'L2', tenant_interest_at: null },
    { id: 'A3', status: 'pending', listing_id: 'L3', tenant_interest_at: '2026-10-18T10:00:00Z' },
    { id: 'A4', status: 'approved', listing_id: 'L4', tenant_interest_at: '2026-10-18T10:00:00Z' },
  ],
})
assert.deepEqual(out.map((x) => x.listingId), ['L0', 'L1'])
assert.equal(out[1].who, 'Ada')
assert.equal(out[1].ref, 'APP-1')
assert.ok(/Nothing is reserved/.test(out[0].detail))
console.log('admin-ready tests passed')