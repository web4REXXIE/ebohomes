import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/payment-submission.ts')
const now = new Date('2026-10-30T12:00:00Z')
const good = { payment_type: 'rent', amount_paid: '450,000', payer_name: ' Ada  Obi ', payer_bank: 'GTBank', transaction_reference: 'S123456', paid_at: '2026-10-30T10:00:00Z', payment_method: 'bank_transfer', notes: '' }

const ok = m.validateSubmission(good, now)
assert.equal(ok.ok, true)
assert.equal(ok.value.amount_paid, 450000)
assert.equal(ok.value.payer_name, 'Ada Obi')
assert.equal(ok.value.notes, null)

for (const [k, v] of [['amount_paid', '0'], ['amount_paid', 'abc'], ['payer_name', 'A'], ['transaction_reference', 'ab'], ['payment_type', 'refund'], ['payment_method', 'bitcoin'], ['paid_at', '2026-10-31T12:00:00Z'], ['paid_at', 'nope'], ['paid_at', '2020-01-01T00:00:00Z']]) {
  const r = m.validateSubmission({ ...good, [k]: v }, now)
  assert.equal(r.ok, false, `${k}=${v} should fail`)
  assert.ok(r.errors[k])
}
assert.equal(m.validateEvidenceMeta('application/pdf', 1000), null)
assert.ok(m.validateEvidenceMeta('text/html', 1000))
assert.ok(m.validateEvidenceMeta('image/png', 9 * 1024 * 1024))
assert.ok(m.validateEvidenceMeta('image/png', 0))

const T = '11111111-1111-4111-8111-111111111111', Y = '22222222-2222-4222-8222-222222222222', F = '33333333-3333-4333-8333-333333333333'
const p = m.evidencePathFor(T, Y, 'image/png', F)
assert.equal(m.isValidEvidencePath(p, T, Y), true)
assert.equal(m.isValidEvidencePath(p, F, Y), false)       // another tenant's folder
assert.equal(m.isValidEvidencePath(p, T, F), false)       // another tenancy
assert.equal(m.isValidEvidencePath(`${T}/${Y}/../x.png`, T, Y), false)
assert.equal(m.isValidEvidencePath(`${T}/${Y}/${F}.exe`, T, Y), false)

assert.equal(m.referenceKey('  S 12 34 '), 's1234')
assert.equal(m.timelineSteps('submitted')[2].state, 'todo')
assert.equal(m.timelineSteps('verified')[2].state, 'done')
assert.equal(m.timelineSteps('rejected')[2].state, 'bad')
console.log('payment-submission: all passed')