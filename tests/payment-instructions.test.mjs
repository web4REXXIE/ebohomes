import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const p = await load('lib/payment-instructions.ts')

// Amounts come only from the signed terms; zero, empty and invalid items are left out
assert.deepEqual(p.amountLines({ rent_amount: 50000, deposit_amount: 0, fees_amount: null }, 'monthly').map((l) => [l.key, l.amount]), [['rent', 50000]])
assert.deepEqual(p.amountLines({ rent_amount: '50000', deposit_amount: 20, fees_amount: 1500 }).map((l) => l.key), ['rent', 'deposit', 'fees'])
assert.equal(p.amountLines({ rent_amount: 50000 }, 'monthly')[0].label, 'Rent (monthly)')
assert.deepEqual(p.amountLines(null), [])
assert.deepEqual(p.amountLines({ rent_amount: -5, deposit_amount: 'abc', fees_amount: NaN }), [])

// Reference is the tenancy code, trimmed; missing means none (never invented)
assert.equal(p.transferReference(' EBO-TEN-000006 '), 'EBO-TEN-000006')
assert.equal(p.transferReference(null), null)
assert.equal(p.transferReference('  '), null)

// Bank details are present and not placeholders
assert.equal(p.BANK_TRANSFER.bankName, 'Opay')
assert.match(p.BANK_TRANSFER.accountNumber, /^\d{10}$/)