import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  const src = readFileSync(path, 'utf8')
  const js = transpileModule(src, { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/renewal.ts')
const stages = ['offered', 'declined', 'awaiting_payment', 'payment_review', 'payment_problem', 'confirm_code', 'ready_for_admin', 'applied']

// every stage has five steps and a message for both roles
for (const s of stages) {
  assert.equal(m.renewalSteps(s).length, 5, s)
  for (const role of ['tenant', 'landlord']) {
    const i = m.stageInfo(s, role)
    assert.ok(i.heading && i.text, `${s}/${role}`)
  }
  assert.equal(m.isRenewalStage(s), true)
}
assert.equal(m.isRenewalStage('nonsense'), false)
assert.equal(m.isRenewalStage('toString'), false)

// only the tenant gets actions, and never on the landlord side
for (const s of stages) assert.equal(m.stageInfo(s, 'landlord').action, null, `landlord action ${s}`)
assert.equal(m.stageInfo('offered', 'tenant').action, 'respond')
assert.equal(m.stageInfo('awaiting_payment', 'tenant').action, 'pay')
assert.equal(m.stageInfo('payment_problem', 'tenant').action, 'fix')
assert.equal(m.stageInfo('confirm_code', 'tenant').action, 'confirm')
assert.equal(m.stageInfo('applied', 'tenant').tone, 'green')

// the timeline never shows "applied" as done before payment is verified and confirmed
for (const s of stages.filter((x) => x !== 'applied')) assert.notEqual(m.renewalSteps(s)[4].state, 'done', s)
assert.equal(m.renewalSteps('applied').every((x) => x.state === 'done'), true)
assert.equal(m.renewalSteps('offered')[2].state, 'todo')

// offer validation
const today = new Date('2026-10-22T10:00:00Z')
assert.equal(m.validateOffer({ rent: '500,000', endDate: '2027-12-31', currentEnd: '2027-06-30' }, today), null)
assert.ok(m.validateOffer({ rent: '0', endDate: '2027-12-31' }, today))
assert.ok(m.validateOffer({ rent: 'abc', endDate: '2027-12-31' }, today))
assert.ok(m.validateOffer({ rent: '500000', endDate: '' }, today))
assert.ok(m.validateOffer({ rent: '500000', endDate: '2026-10-22' }, today))        // not in the future
assert.ok(m.validateOffer({ rent: '500000', endDate: '2027-01-01', currentEnd: '2027-06-30' }, today)) // before current end
assert.ok(m.validateOffer({ rent: '500000', endDate: '2027-12-31', note: 'x'.repeat(501) }, today))
console.log('renewal: all passed')