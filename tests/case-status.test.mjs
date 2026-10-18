import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const c = await load('lib/case-status.ts')
assert.equal(c.label('in_progress'), 'in progress')
assert.equal(c.toIso(''), null)
assert.equal(c.toIso('not a date'), null)
assert.match(c.toIso('2026-10-20T14:30'), /^2026-10-20T/)
assert.equal(c.fmtDate(null), '—')
assert.equal(c.naira('abc'), '—')
assert.equal(c.refundPreview(100000, 20000), 80000)
assert.equal(c.refundPreview(100000, 150000), null)
assert.equal(c.refundPreview(100000, -1), null)
assert.equal(c.tenancyPath('tenant', 'x'), '/tenancies/x')
assert.equal(c.tenancyPath('landlord', 'x'), '/dashboard/tenancies/x')

const p = await load('lib/payment-status.ts')
assert.equal(p.isVerified({ status: 'confirmed', verified_by: 'a' }), true)
assert.equal(p.isVerified({ status: 'confirmed', verified_by: null }), false)
assert.equal(p.getPaymentState({ status: 'confirmed' }), 'legacy_confirmed')
assert.equal(p.getPaymentState({ status: 'recorded' }), 'awaiting_verification')
console.log('case-status + payment-status tests passed')