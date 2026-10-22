import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  let src = readFileSync(path, 'utf8').replace(/^import type .*$/m, '')
  const js = transpileModule(src, { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/payment-review.ts')
const sub = { amount_paid: 450000, expected_amount: 450000, transaction_reference: 'S 12345' }
const att = { checked_bank_account: true, correct_tenant_and_property: true, amount_received: '450,000', bank_reference: 's12345', mismatch_acknowledged: false }

assert.equal(m.validateReview('verify', '', att, sub).ok, true)
assert.equal(m.validateReview('verify', '', { ...att, checked_bank_account: false }, sub).ok, false)
assert.equal(m.validateReview('verify', '', { ...att, correct_tenant_and_property: false }, sub).ok, false)
assert.equal(m.validateReview('verify', '', { ...att, amount_received: '400000' }, sub).ok, false)
assert.equal(m.validateReview('verify', '', { ...att, bank_reference: 'X999' }, sub).ok, false)
assert.equal(m.validateReview('verify', '', null, sub).ok, false)
const mm = { ...sub, expected_amount: 500000 }
assert.equal(m.validateReview('verify', '', att, mm).ok, false)                                   // mismatch needs ack + note
assert.equal(m.validateReview('verify', 'Tenant paid part; landlord agreed', { ...att, mismatch_acknowledged: true }, mm).ok, true)
assert.equal(m.validateReview('reject', '', null, sub).ok, false)
assert.equal(m.validateReview('reject', 'Not in statement', null, sub).ok, true)
assert.equal(m.validateReview('request_info', 'abc', null, sub).ok, false)
assert.equal(m.validateReview('delete', 'x', null, sub).ok, false)
assert.equal(m.adminStatusLabel('submitted', 'abc'), 'Resubmitted, awaiting review')
assert.equal(m.adminStatusLabel('submitted', null), 'Awaiting review')
assert.equal(m.amountMismatch(500000, 450000), true)
assert.equal(m.amountMismatch(null, 450000), false)
assert.deepEqual(m.filterStatuses('awaiting'), ['submitted', 'under_review'])
console.log('payment-review: all passed')