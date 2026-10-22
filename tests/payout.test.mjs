import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/payout.ts')
const KEY = 'k'.repeat(20)
const ID = '11111111-1111-1111-1111-111111111111'

assert.equal(m.validatePrepare({ amount: '450,000', note: '', key: KEY }, 450000).ok, true)
assert.equal(m.validatePrepare({ amount: '500000', note: '', key: KEY }, 450000).ok, false)        // more than the payment
assert.equal(m.validatePrepare({ amount: '400000', note: '', key: KEY }, 450000).ok, false)        // less needs a note
assert.equal(m.validatePrepare({ amount: '400000', note: 'Agency fee deducted per agreement', key: KEY }, 450000).ok, true)
assert.equal(m.validatePrepare({ amount: '0', note: '', key: KEY }, 450000).ok, false)
assert.equal(m.validatePrepare({ amount: 'abc', note: '', key: KEY }, 450000).ok, false)
assert.equal(m.validatePrepare({ amount: '450000', note: '', key: 'short' }, 450000).ok, false)

const att = { transferred_to_shown_account: true, amount_sent: '450,000' }
const path = `payouts/${ID}/abc.pdf`
assert.equal(m.validatePaid({ reference: 'NIP12345', proof_path: path, attest: att }, ID, 450000).ok, true)
assert.equal(m.validatePaid({ reference: 'NIP', proof_path: path, attest: att }, ID, 450000).ok, false)
assert.equal(m.validatePaid({ reference: 'NIP12345', proof_path: null, attest: att }, ID, 450000).ok, false)
assert.equal(m.validatePaid({ reference: 'NIP12345', proof_path: 'payouts/other/abc.pdf', attest: att }, ID, 450000).ok, false)
assert.equal(m.validatePaid({ reference: 'NIP12345', proof_path: `payouts/${ID}/../x.pdf`, attest: att }, ID, 450000).ok, false)
assert.equal(m.validatePaid({ reference: 'NIP12345', proof_path: path, attest: { ...att, transferred_to_shown_account: false } }, ID, 450000).ok, false)
assert.equal(m.validatePaid({ reference: 'NIP12345', proof_path: path, attest: { ...att, amount_sent: '1000' } }, ID, 450000).ok, false)

assert.equal(m.validateProofMeta('application/pdf', 1000), null)
assert.notEqual(m.validateProofMeta('text/html', 1000), null)
assert.notEqual(m.validateProofMeta('image/png', 9 * 1024 * 1024), null)

assert.equal(m.validateRespond('confirm', '').ok, true)
assert.equal(m.validateRespond('dispute', 'short').ok, false)
assert.equal(m.validateRespond('dispute', 'Nothing arrived in my account').ok, true)
assert.equal(m.validateRespond('delete', 'x').ok, false)
console.log('payout: all passed')