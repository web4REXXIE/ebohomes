import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  const src = readFileSync(path, 'utf8')
  const js = transpileModule(src, { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const c = await load('lib/confirmation-code.ts')
const k = await load('lib/confirmation-crypto.ts')

assert.equal(c.CODE_ALPHABET.length, 32)
assert.equal(c.normalizeCode('ab12-cd34'), 'AB12CD34')
assert.equal(c.normalizeCode(null), '')
assert.equal(c.isWellFormedCode('ABCD2345'), true)
assert.equal(c.isWellFormedCode('ABCD234'), false)
assert.equal(c.isWellFormedCode('ABCD234O'), false) // O is not in the alphabet
assert.equal(c.formatCode('ABCD2345'), 'ABCD-2345')

const seen = new Set()
for (let i = 0; i < 2000; i++) {
  const code = k.generateCode(c.CODE_ALPHABET, c.CODE_LENGTH)
  assert.equal(c.isWellFormedCode(code), true)
  seen.add(code)
}
assert.equal(seen.size, 2000)

const secret = 'x'.repeat(40)
const h1 = k.hashCode(secret, 'sub-1', 'ABCD2345')
assert.match(h1, /^[0-9a-f]{64}$/)
assert.equal(h1, k.hashCode(secret, 'sub-1', 'ABCD2345'))
assert.notEqual(h1, k.hashCode(secret, 'sub-2', 'ABCD2345'))   // bound to the submission
assert.notEqual(h1, k.hashCode('y'.repeat(40), 'sub-1', 'ABCD2345'))
assert.equal(k.readSecret(), null)                              // no env set in tests

assert.deepEqual(c.progressSteps('confirmed').map((s) => s.state), ['done', 'done', 'done', 'done', 'done'])
assert.equal(c.progressSteps('code_sent')[3].state, 'current')
assert.equal(c.progressSteps('awaiting_review')[1].state, 'current')
assert.equal(c.progressSteps('locked')[3].state, 'bad')
console.log('payment-confirmation: all passed')