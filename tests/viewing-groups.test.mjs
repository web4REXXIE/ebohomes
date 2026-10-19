import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const g = await load('lib/viewing-groups.ts')

assert.equal(g.viewingGroup({ status: 'requested' }), 'waiting')
assert.equal(g.viewingGroup({ status: 'approved' }), 'waiting')
assert.equal(g.viewingGroup({ status: 'reschedule_proposed' }), 'action')
assert.equal(g.viewingGroup({ status: 'scheduled' }), 'scheduled')
assert.equal(g.viewingGroup({ status: 'completed' }), 'action')
assert.equal(g.viewingGroup({ status: 'completed', tenant_decision: null }), 'action')
assert.equal(g.viewingGroup({ status: 'completed', tenant_decision: 'interested' }), 'waiting')
assert.equal(g.viewingGroup({ status: 'completed', tenant_decision: 'not_interested' }), 'past')
for (const s of ['no_show', 'cancelled', 'rejected', 'something_new']) assert.equal(g.viewingGroup({ status: s }), 'past')

const out = g.groupViewings([
  { id: 'a', status: 'scheduled', scheduled_for: '2026-10-25T10:00:00Z' },
  { id: 'b', status: 'scheduled', scheduled_for: '2026-10-20T10:00:00Z' },
  { id: 'c', status: 'requested' },
  { id: 'd', status: 'cancelled' },
  { id: 'e', status: 'completed' },
])
assert.deepEqual(out.scheduled.map((x) => x.id), ['b', 'a'])
assert.deepEqual(out.waiting.map((x) => x.id), ['c'])
assert.deepEqual(out.past.map((x) => x.id), ['d'])
assert.deepEqual(out.action.map((x) => x.id), ['e'])
console.log('viewing-groups tests passed')