import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/payee-authorization.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

const U = '11111111-1111-4111-8111-111111111111', L = '22222222-2222-4222-8222-222222222222', F = '33333333-3333-4333-8333-333333333333'
assert.equal(a.validatePayeeFileMeta('application/pdf', 1000), null)
assert.ok(a.validatePayeeFileMeta('text/html', 1000))
assert.ok(a.validatePayeeFileMeta('image/png', 0))
assert.ok(a.validatePayeeFileMeta('image/png', 11 * 1024 * 1024))

const p = a.payeePathFor(U, L, 'application/pdf', F)
assert.equal(p, `payee/${U}/${L}/${F}.pdf`)
assert.equal(a.isValidPayeePath(p, U, L), true)
assert.equal(a.isValidPayeePath(p, L, L), false)            // someone else's folder
assert.equal(a.isValidPayeePath(p, U, U), false)            // wrong listing
assert.equal(a.isValidPayeePath(`${U}/${L}/${F}.pdf`, U, L), false)  // the authority-evidence path shape is not accepted
assert.equal(a.isValidPayeePath(`payee/${U}/${L}/../x.pdf`, U, L), false)
assert.equal(a.isValidPayeePath(`payee/${U}/${L}/${F}.exe`, U, L), false)
assert.equal(a.isValidPayeePath(`payee/${U}/${L}/ABCDEF12-3456-4789-8ABC-DEF123456789.pdf`, U, L), false)

const ok = a.validatePayeeInput({ payee_kind: 'agent', payee_name: '  Ada   Obi ', bank_name: 'GTBank', account_number: '0123 456-789'.replace(/ /g, ''), account_name: 'Ada Obi' })
assert.equal(ok.ok, true)
assert.equal(ok.value.payee_name, 'Ada Obi')
assert.equal(ok.value.account_number, '0123456789')
assert.equal(a.validatePayeeInput({ payee_kind: 'owner', payee_name: 'Ada Obi', bank_name: 'GTBank', account_number: '0123456789', account_name: 'Ada Obi' }).ok, false)
assert.equal(a.validatePayeeInput({ payee_kind: 'company', payee_name: 'X', bank_name: 'GTBank', account_number: '0123456789', account_name: 'Ada Obi' }).ok, false)
assert.equal(a.validatePayeeInput({ payee_kind: 'agent', payee_name: 'Ada Obi', bank_name: 'GTBank', account_number: '12345', account_name: 'Ada Obi' }).ok, false)
assert.equal(a.validatePayeeInput({ payee_kind: 'agent', payee_name: 'Ada Obi', bank_name: 'GTBank', account_number: '0123456789', account_name: '12345' }).ok, false)
const co = a.validatePayeeInput({ payee_kind: 'company', payee_name: 'Obi & Sons Ltd', bank_name: 'Zenith', account_number: '0123456789', account_name: 'Obi & Sons Ltd' })
assert.equal(co.ok, true)

assert.equal(a.friendlyPayeeError('You already have a request waiting for review. Cancel it first to send a new one.'), 'You already have a request waiting for review. Cancel it first to send a new one.')
assert.equal(a.friendlyPayeeError('duplicate key value violates unique constraint "x"'), 'Something went wrong. Please try again.')
assert.equal(a.friendlyPayeeError(null, 'fallback'), 'fallback')
console.log('payee-authorization: ok')
