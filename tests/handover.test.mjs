import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/handover.ts')

assert.equal(m.validateAction('confirm', '').ok, true)
assert.equal(m.validateAction('dispute', 'short').ok, false)
assert.equal(m.validateAction('dispute', 'The keys were never handed over').ok, true)
assert.equal(m.validateAction('delete', 'x').ok, false)
assert.equal(m.validateAction('confirm', 'x'.repeat(501)).ok, false)

assert.equal(m.validateResolve('reset', 'Both parties to confirm again').ok, true)
assert.equal(m.validateResolve('reset', 'short').ok, false)
assert.equal(m.validateResolve('admin_completed', 'Short note here').ok, false)                       // needs 20+
assert.equal(m.validateResolve('admin_completed', 'Called both parties and checked the keys were handed over').ok, true)
assert.equal(m.validateResolve('', 'Long enough explanation here').ok, false)

assert.equal(m.partyState('completed', 'a', 'b'), 'Both confirmed')
assert.equal(m.partyState('disputed', 'a', null), 'Disputed, under EboHomes review')
assert.equal(m.partyState('open', 'a', null), 'You confirmed. Waiting for the other party')
assert.equal(m.partyState('open', null, 'b'), 'The other party confirmed. Waiting for you')
assert.equal(m.partyState('open', null, null), 'Waiting for both of you')

assert.equal(m.adminState('waiting', 'a', null), 'Waiting for the landlord')
assert.equal(m.adminState('waiting', null, 'b'), 'Waiting for the tenant')
assert.equal(m.adminState('waiting', null, null), 'Waiting for both')
assert.equal(m.adminState('disputed', 'a', 'b'), 'Disputed, payout on hold')
assert.equal(m.adminState('completed', 'a', 'b'), 'Both confirmed')
console.log('handover: all passed')