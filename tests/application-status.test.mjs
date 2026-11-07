import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/application-status.ts')

assert.equal(m.applicationStage({ status: 'pending' }), 'submitted')
assert.equal(m.applicationStage({ status: 'pending', landlord_recommendation: 'recommend' }), 'under_review')
assert.equal(m.applicationStage({ status: 'info_requested' }), 'more_information_required')
assert.equal(m.applicationStage({ status: 'approved' }), 'approved')
assert.equal(m.applicationStage({ status: 'rejected' }), 'rejected')
assert.equal(m.applicationStage({ status: 'withdrawn' }), 'withdrawn')
assert.equal(m.applicationStage({ status: 'accepted' }), 'accepted')
assert.equal(m.applicationStage({ status: 'not_selected' }), 'not_selected')

for (const s of ['accepted', 'not_selected', 'approved', 'rejected', 'withdrawn']) {
  const stage = m.applicationStage({ status: s })
  assert.ok(m.STAGE_LABEL[stage], `${s} label`)
  assert.ok(m.STAGE_TONE[stage], `${s} tone`)
  assert.ok(m.STAGE_HELP[stage], `${s} help`)
}
assert.match(m.STAGE_HELP.not_selected, /not a rejection/i)
assert.notEqual(m.STAGE_LABEL.not_selected, m.STAGE_LABEL.rejected)

console.log('application-status ok')
