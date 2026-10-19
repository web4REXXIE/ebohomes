import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/tenancy-access.ts')
const rows = [{ id: 'a1' }, { id: 'b2' }]

assert.deepEqual(m.classifyTenancyLoad({ data: rows, error: null }, 'b2'), { kind: 'ok', row: rows[1] })
assert.deepEqual(m.classifyTenancyLoad({ data: rows, error: null }, 'zzz'), { kind: 'not_found' })
assert.deepEqual(m.classifyTenancyLoad({ data: null, error: null }, 'a1'), { kind: 'not_found' })
// An error must never be treated as "not found"
assert.deepEqual(m.classifyTenancyLoad({ data: null, error: { message: 'x' } }, 'a1'), { kind: 'error' })
assert.deepEqual(m.classifyTenancyLoad({ data: rows, error: { message: 'x' } }, 'a1'), { kind: 'error' })
console.log('tenancy-access ok')