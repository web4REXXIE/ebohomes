import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/rental-offer.ts')
const now = new Date('2026-11-10T12:00:00Z')

const good = {
  rent_amount: '450,000', rent_period: 'monthly', duration_months: '12', start_date: '2026-11-20', deposit_amount: '100000',
  charges: [{ label: 'Service charge', amount: '50000' }, { label: '', amount: '' }],
  payment_schedule: ' Monthly in advance ', notice_days: '30', house_rules: '', note: '', hours: '72',
}

// valid input
const ok = m.validateOfferInput(good, now)
assert.equal(ok.ok, true)
assert.equal(ok.value.rent_amount, 450000)
assert.equal(ok.value.charges.length, 1)
assert.equal(ok.value.payment_schedule, 'Monthly in advance')
assert.equal(ok.value.house_rules, null)
assert.equal(ok.value.notice_days, 30)
assert.equal(m.chargesTotal(ok.value.charges), 50000)

// invalid input, one field at a time
for (const [k, v] of [
  ['rent_amount', '0'], ['rent_amount', 'abc'], ['rent_period', 'weekly'], ['duration_months', '0'], ['duration_months', '61'],
  ['duration_months', '1.5'], ['start_date', '2026-11-09'], ['start_date', '2027-06-01'], ['start_date', 'nope'],
  ['start_date', '2026-02-30'], ['deposit_amount', '-1'], ['notice_days', '400'], ['hours', '12'], ['hours', '400'],
  ['charges', [{ label: 'x', amount: '5' }]], ['charges', [{ label: 'Levy', amount: '0' }]],
]) {
  const r = m.validateOfferInput({ ...good, [k]: v }, now)
  assert.equal(r.ok, false, `${k}=${JSON.stringify(v)} should fail`)
  assert.ok(r.errors[k], `${k} should have an error`)
}
assert.equal(m.validateOfferInput({ ...good, charges: Array.from({ length: 9 }, (_, i) => ({ label: `Charge ${i}`, amount: '10' })) }, now).ok, false)

// counter-offers
const offer = { rent_amount: 450000, deposit_amount: 100000, start_date: '2026-11-20', duration_months: 12 }
const c1 = m.validateCounter({ rent_amount: '400000', deposit_amount: '100000', start_date: '2026-11-20', duration_months: '12' }, offer, 'Budget is tight this year', now)
assert.equal(c1.ok, true)
assert.equal(c1.value.rent_amount, 400000)
assert.equal(m.validateCounter({ rent_amount: '450000', deposit_amount: '100000', start_date: '2026-11-20', duration_months: '12' }, offer, 'Same terms again', now).ok, false)
assert.equal(m.validateCounter({ rent_amount: '400000', deposit_amount: '100000', start_date: '2026-11-20', duration_months: '12' }, offer, 'short', now).ok, false)
assert.equal(m.validateCounter({ rent_amount: '0', deposit_amount: '100000', start_date: '2026-11-20', duration_months: '12' }, offer, 'A long enough reason', now).ok, false)

// matches the listing (decides whether the landlord must confirm)
const listing = { price_monthly: 450000, caution_deposit: 100000, service_charge: 50000 }
assert.equal(m.offerMatchesListing({ rent_period: 'monthly', rent_amount: 450000, deposit_amount: 100000, charges: [{ label: 'Service charge', amount: 50000 }] }, listing), true)
assert.equal(m.offerMatchesListing({ rent_period: 'monthly', rent_amount: 460000, deposit_amount: 100000, charges: [] }, listing), false)
assert.equal(m.offerMatchesListing({ rent_period: 'yearly', rent_amount: 450000, deposit_amount: 0, charges: [] }, listing), false)
assert.equal(m.offerMatchesListing({ rent_period: 'monthly', rent_amount: 450000, deposit_amount: 200000, charges: [] }, listing), false)
assert.equal(m.offerMatchesListing({ rent_period: 'monthly', rent_amount: 450000, deposit_amount: 0, charges: [{ label: 'Levy', amount: 60000 }] }, listing), false)
assert.equal(m.offerMatchesListing({ rent_period: 'monthly', rent_amount: 1, deposit_amount: 0, charges: [] }, { price_monthly: null, caution_deposit: null, service_charge: null }), false)

// expiry and who acts next
assert.equal(m.isOfferExpired('2026-11-10T11:59:00Z', now), true)
assert.equal(m.isOfferExpired('2026-11-10T12:01:00Z', now), false)
assert.equal(m.offerTimeLeft('2026-11-10T11:00:00Z', now), 'Expired')
assert.equal(m.offerTimeLeft('2026-11-10T15:00:00Z', now), '3 hours left')
assert.equal(m.offerTimeLeft('2026-11-15T12:00:00Z', now), '5 days left')
const base = { status: 'offered', offered_by_role: 'admin', landlord_confirmed_at: null, expires_at: '2026-11-12T12:00:00Z' }
assert.equal(m.offerWaitingOn(base, now), 'landlord')
assert.equal(m.offerWaitingOn({ ...base, landlord_confirmed_at: '2026-11-10T10:00:00Z' }, now), 'tenant')
assert.equal(m.offerWaitingOn({ ...base, expires_at: '2026-11-10T11:00:00Z' }, now), 'none')
assert.equal(m.offerWaitingOn({ ...base, status: 'countered' }, now), 'admin')
assert.equal(m.offerWaitingOn({ ...base, status: 'accepted' }, now), 'admin')
assert.equal(m.offerWaitingOn({ ...base, status: 'declined' }, now), 'none')

// dates
assert.equal(m.addDaysIso('2026-11-10', 180), '2027-05-09')
assert.equal(m.todayIso(now), '2026-11-10')

console.log('rental-offer ok')
