import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

import { createHmac } from 'node:crypto'
const p = await load('lib/paystack.ts')

// Off by default.
assert.deepEqual(p.paystackConfig({}), { ok: false, reason: 'disabled' })
assert.deepEqual(p.paystackConfig({ PAYSTACK_ENABLED: 'true' }), { ok: false, reason: 'missing_key' })
assert.deepEqual(p.paystackConfig({ PAYSTACK_ENABLED: 'false', PAYSTACK_SECRET_KEY: 'sk_test_x' }), { ok: false, reason: 'disabled' })
assert.deepEqual(p.paystackConfig({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_x' }), { ok: true, secret: 'sk_test_x', live: false })
// A live key needs a second, explicit switch.
assert.deepEqual(p.paystackConfig({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_live_x' }), { ok: false, reason: 'live_not_allowed' })
assert.equal(p.paystackConfig({ PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_live_x', PAYSTACK_ALLOW_LIVE: 'true' }).ok, true)

// Money.
assert.equal(p.toKobo(150000), 15000000)
assert.equal(p.toKobo('2500.5'), 250050)
assert.equal(p.toKobo(0), null)
assert.equal(p.toKobo(-5), null)
assert.equal(p.toKobo('abc'), null)
assert.equal(p.toKobo(10.123), null)
assert.equal(p.toKobo(null), null)
const terms = { rent_amount: 100000, deposit_amount: 50000, fees_amount: 0 }
assert.equal(p.amountForPurpose(terms, 'rent'), 10000000)
assert.equal(p.amountForPurpose(terms, 'deposit'), 5000000)
assert.equal(p.amountForPurpose(terms, 'fees'), null)
assert.equal(p.isPurpose('rent'), true)
assert.equal(p.isPurpose('refund'), false)

// References are unique and well formed.
const a = p.newReference(), b = p.newReference()
assert.match(a, /^EBO-[0-9A-F]{32}$/)
assert.notEqual(a, b)

// Webhook signature.
const body = JSON.stringify({ event: 'charge.success', data: { reference: 'EBO-1' } })
const sig = createHmac('sha512', 'sk_test_x').update(body).digest('hex')
assert.equal(p.signatureValid(body, sig, 'sk_test_x'), true)
assert.equal(p.signatureValid(body + ' ', sig, 'sk_test_x'), false)
assert.equal(p.signatureValid(body, sig, 'sk_test_y'), false)
assert.equal(p.signatureValid(body, null, 'sk_test_x'), false)
assert.equal(p.signatureValid(body, 'short', 'sk_test_x'), false)

// Charge must match what we stored.
const row = { reference: 'EBO-1', amount_kobo: 10000000, currency: 'NGN' }
const ok = { status: 'success', reference: 'EBO-1', amount: 10000000, currency: 'NGN' }
assert.equal(p.chargeMatches(ok, row), true)
assert.equal(p.chargeMatches({ ...ok, amount: 5000 }, row), false)
assert.equal(p.chargeMatches({ ...ok, currency: 'USD' }, row), false)
assert.equal(p.chargeMatches({ ...ok, status: 'failed' }, row), false)
assert.equal(p.chargeMatches({ ...ok, reference: 'EBO-2' }, row), false)
assert.equal(p.chargeMatches(null, row), false)
console.log('paystack ok')

// ---------- settlement rules ----------
const srow = { reference: 'EBO-9', amount_kobo: 10000000, currency: 'NGN' }
const sd = (o) => p.decideSettlement(srow, { reference: 'EBO-9', amount: 10000000, currency: 'NGN', ...o })
assert.equal(sd({ status: 'success' }), 'paid')
assert.equal(sd({ status: 'success', amount: 1 }), 'mismatch') // paid the wrong amount: never auto-accepted
assert.equal(sd({ status: 'success', currency: 'USD' }), 'mismatch')
assert.equal(sd({ status: 'failed' }), 'failed')
assert.equal(sd({ status: 'reversed' }), 'failed')
assert.equal(sd({ status: 'abandoned' }), 'abandoned') // customer cancelled / closed the page
for (const s of ['ongoing', 'pending', 'processing', 'queued', 'weird']) assert.equal(sd({ status: s }), 'pending')
assert.equal(p.decideSettlement(srow, null), 'pending')
assert.equal(p.decideSettlement(srow, {}), 'pending')

// Final states cannot be changed, so duplicates and late events are harmless.
assert.equal(p.nextStatus('paid', 'failed'), null)
assert.equal(p.nextStatus('paid', 'paid'), null)
assert.equal(p.nextStatus('paid', 'abandoned'), null)
assert.equal(p.nextStatus('mismatch', 'paid'), null)
assert.equal(p.nextStatus('initiated', 'pending'), null)
assert.equal(p.nextStatus('initiated', 'paid'), 'paid')
assert.equal(p.nextStatus('initiated', 'abandoned'), 'abandoned')
assert.equal(p.nextStatus('abandoned', 'paid'), 'paid') // an abandoned attempt can still be completed later
assert.equal(p.nextStatus('failed', 'failed'), null)
assert.equal(p.paymentTypeFor('fees'), 'fee')
assert.equal(p.paymentTypeFor('rent'), 'rent')
console.log('paystack settlement ok')
