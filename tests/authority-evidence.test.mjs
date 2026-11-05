import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/authority-evidence.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

const U = '11111111-1111-4111-8111-111111111111', L = '22222222-2222-4222-8222-222222222222', F = '33333333-3333-4333-8333-333333333333'
assert.equal(a.validateAuthorityFileMeta('application/pdf', 1000), null)
assert.ok(a.validateAuthorityFileMeta('text/html', 1000))
assert.ok(a.validateAuthorityFileMeta('image/png', 0))
assert.ok(a.validateAuthorityFileMeta('image/png', 11 * 1024 * 1024))
const p = a.authorityPathFor(U, L, 'image/jpeg', F)
assert.equal(p, `${U}/${L}/${F}.jpg`)
assert.equal(a.isValidAuthorityPath(p, U, L), true)
assert.equal(a.isValidAuthorityPath(p, L, L), false)
assert.equal(a.isValidAuthorityPath(`${U}/${L}/../x.pdf`, U, L), false)
assert.equal(a.isValidAuthorityPath(`${U}/${L}/${F}.exe`, U, L), false)
assert.equal(a.isAuthorityDocType('tenancy_agreement'), true)
assert.equal(a.isAuthorityDocType('anything'), false)
assert.equal(a.friendlyAuthorityError('Still needed: Owner full name'), 'Still needed: Owner full name')
assert.equal(a.friendlyAuthorityError('duplicate key value violates unique constraint "x"'), 'Something went wrong. Please try again.')
console.log('authority-evidence: all passed')
