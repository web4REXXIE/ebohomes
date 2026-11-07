import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/application-documents.ts')

const T = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const F = '33333333-3333-4333-8333-333333333333'

// file metadata
assert.equal(m.validateAppDocMeta('application/pdf', 1000), null)
assert.equal(m.validateAppDocMeta('image/png', 8 * 1024 * 1024), null)
assert.ok(m.validateAppDocMeta('text/html', 1000))
assert.ok(m.validateAppDocMeta('image/png', 8 * 1024 * 1024 + 1))
assert.ok(m.validateAppDocMeta('image/png', 0))
assert.ok(m.validateAppDocMeta('image/png', '100'))

// kinds and labels
for (const k of ['government_id', 'proof_of_income', 'employment_letter', 'reference_letter', 'proof_of_address']) {
  const r = m.validateAppDocKind(k, 'ignored')
  assert.equal(r.ok, true)
  assert.equal(r.label, null)
}
assert.equal(m.validateAppDocKind('selfie', '').ok, false)
assert.equal(m.validateAppDocKind(undefined, '').ok, false)
assert.equal(m.validateAppDocKind('other', '').ok, false)
assert.equal(m.validateAppDocKind('other', 'x').ok, false)
assert.equal(m.validateAppDocKind('other', 'a'.repeat(61)).ok, false)
const other = m.validateAppDocKind('other', '  Bank   letter ')
assert.equal(other.ok, true)
assert.equal(other.label, 'Bank letter')

// paths: tenant and application are part of the path, the server names the file
const p = m.appDocPathFor(T, A, 'application/pdf', F)
assert.equal(p, `${T}/${A}/${F}.pdf`)
assert.equal(m.isValidAppDocPath(p, T, A), true)
assert.equal(m.isValidAppDocPath(p, '99999999-9999-4999-8999-999999999999', A), false)
assert.equal(m.isValidAppDocPath(p, T, '99999999-9999-4999-8999-999999999999'), false)
assert.equal(m.isValidAppDocPath(`${T}/${A}/../${F}.pdf`, T, A), false)
assert.equal(m.isValidAppDocPath(`${T}/${A}/${F}.exe`, T, A), false)
assert.equal(m.isValidAppDocPath(`${T}/${A}/x/${F}.pdf`, T, A), false)
assert.equal(m.isValidAppDocPath(null, T, A), false)
assert.equal(m.isValidAppDocPath('a'.repeat(300), T, A), false)

// ids
assert.equal(m.isUuid(A), true)
assert.equal(m.isUuid('nope'), false)
assert.equal(m.isUuid(undefined), false)

// every kind has a label
for (const k of m.APP_DOC_KINDS) assert.ok(m.APP_DOC_LABEL[k])

console.log('application-documents ok')
