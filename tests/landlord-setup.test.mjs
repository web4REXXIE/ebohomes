import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
const js = transpileModule(readFileSync('lib/landlord-setup.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const { buildSetupRows } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const eq = (n, g, w) => assert.deepEqual(g, w, n)
const L = (id, status = 'approved') => ({ id, status })
const A = (id, listing_id, o = {}) => ({ id, listing_id, tenant_id: 't' + id, status: 'approved', tenant_interest_at: '2026-10-01', ...o })

eq('ready app shows and can create', buildSetupRows([A('a1', 'l1')], [], [L('l1')]).map((r) => r.canCreate), [true])
eq('tenant has not confirmed: hidden', buildSetupRows([A('a1', 'l1', { tenant_interest_at: null })], [], [L('l1')]), [])
eq('not approved: hidden', buildSetupRows([A('a1', 'l1', { status: 'pending' })], [], [L('l1')]), [])
eq('already has tenancy: hidden', buildSetupRows([A('a1', 'l1')], [{ application_id: 'a1', listing_id: 'l1', status: 'active' }], [L('l1')]), [])
// two approved applicants, one tenancy exists: the other is blocked with a waiting-list message, not hidden or rejected
let r = buildSetupRows([A('a1', 'l1'), A('a2', 'l1')], [{ application_id: 'a1', listing_id: 'l1', status: 'active' }], [L('l1')])
eq('one row left', r.length, 1); eq('waiting blocked', r[0].canCreate, false); assert.match(r[0].reason, /waiting list/)
// ended tenancy does not block
eq('ended does not block', buildSetupRows([A('a2', 'l1')], [{ application_id: 'a1', listing_id: 'l1', status: 'ended' }], [L('l1')])[0].canCreate, true)
// listing not open / missing
eq('paused listing blocked', buildSetupRows([A('a1', 'l1')], [], [L('l1', 'paused')])[0].canCreate, false)
eq('missing listing blocked', buildSetupRows([A('a1', 'l9')], [], [L('l1')])[0].canCreate, false)
// other listings unaffected
eq('other listing ok', buildSetupRows([A('a2', 'l2')], [{ application_id: 'a1', listing_id: 'l1', status: 'active' }], [L('l1'), L('l2')])[0].canCreate, true)
console.log('landlord-setup: ok')