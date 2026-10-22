import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/payout-account.ts')

assert.equal(m.normalizeAccountNumber('012 345-6789'), '0123456789')
assert.equal(m.maskAccount('0123456789'), '******6789')
const ok = { bank_name: 'GTBank', account_number: '0123456789', account_name: 'Chinedu  Okafor' }
const r = m.validatePayoutAccount(ok)
assert.equal(r.ok, true)
assert.equal(r.value.account_name, 'Chinedu Okafor')
assert.equal(m.validatePayoutAccount({ ...ok, account_number: '12345' }).ok, false)
assert.equal(m.validatePayoutAccount({ ...ok, account_number: '01234567AB' }).ok, false)
assert.equal(m.validatePayoutAccount({ ...ok, bank_name: '' }).ok, false)
assert.equal(m.validatePayoutAccount({ ...ok, account_name: '12345' }).ok, false)
assert.equal(m.validatePayoutAccount({ ...ok, account_name: "Ngozi O'Brien-Eze" }).ok, true)
assert.equal(m.validatePayoutAccount({}).ok, false)

const first = { has_current: false, name_match: true }
const change = { has_current: true, name_match: true }
const att = { identity_matches: true, confirmed_with_landlord: true }
assert.equal(m.validatePayoutReview('approve', '', att, first).ok, true)
assert.equal(m.validatePayoutReview('approve', '', { identity_matches: false }, first).ok, false)
assert.equal(m.validatePayoutReview('approve', '', { identity_matches: true }, change).ok, false)   // change needs landlord confirmation
assert.equal(m.validatePayoutReview('approve', '', att, change).ok, true)
assert.equal(m.validatePayoutReview('approve', '', att, { has_current: false, name_match: false }).ok, false) // mismatch needs a note
assert.equal(m.validatePayoutReview('approve', 'Landlord uses business name, checked CAC', att, { has_current: false, name_match: false }).ok, true)
assert.equal(m.validatePayoutReview('reject', '', null, first).ok, false)
assert.equal(m.validatePayoutReview('reject', 'Name does not match ID', null, first).ok, true)
assert.equal(m.validatePayoutReview('delete', 'x', null, first).ok, false)

const now = Date.parse('2026-11-02T12:00:00Z')
assert.equal(m.itemLabel({ id: 'a', status: 'approved', effective_at: '2026-11-01T00:00:00Z' }, 'a', now), 'Active')
assert.equal(m.itemLabel({ id: 'b', status: 'approved', effective_at: '2026-11-03T00:00:00Z' }, 'a', now), 'Approved, starts after waiting period')
assert.equal(m.itemLabel({ id: 'c', status: 'approved', effective_at: '2026-10-01T00:00:00Z' }, 'a', now), 'Replaced')
assert.equal(m.itemLabel({ id: 'd', status: 'pending_review', effective_at: null }, 'a', now), 'Waiting for EboHomes review')
console.log('payout-account: all passed')