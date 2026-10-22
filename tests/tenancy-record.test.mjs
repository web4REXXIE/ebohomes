import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/tenancy-record.ts')

const base = (role) => ({
  found: true, role,
  tenancy: { id: 't1', code: 'EBO-T-1', status: 'active', start_date: '2026-11-01', end_date: '2027-10-31', rent_amount: 500000, rent_period: 'yearly', created_at: '2026-10-01T09:00:00Z' },
  property: { title: 'Self-con', location: 'Abakaliki' }, tenant_name: 'Ada', landlord_name: 'Obi',
  terms: { rent_amount: 500000, deposit_amount: 0, fees_amount: 0, payment_schedule: null, notice_days: 30, house_rules: null, signed_reference: 'S1', signed_at: '2026-10-02T09:00:00Z' },
  terms_status: 'signed',
  payments: [{ id: 'p1', type: 'rent', amount: 500000, status: 'verified', submitted_at: '2026-10-03T09:00:00Z', verified_at: '2026-10-04T09:00:00Z', confirmed_at: '2026-10-05T09:00:00Z', receipt_code: 'EBO-RCT-000001' }],
  handover: { status: 'open', tenant_confirmed_at: '2026-10-06T09:00:00Z', landlord_confirmed_at: null, disputed_at: null, disputed_role: null, completed_at: null, completed_via: null },
  payout_state: 'on_hold', hold_reason: 'Waiting for the landlord to confirm the key handover', payouts: [], renewals: [],
})

// shape guard
assert.equal(m.isRecord(base('tenant')), true)
assert.equal(m.isRecord({ found: false }), false)
assert.equal(m.isRecord(null), false)
assert.equal(m.isRecord({ ...base('tenant'), role: 'x' }), false)
assert.equal(m.isRecord({ ...base('tenant'), payments: null }), false)

// money
assert.equal(m.money(500000), '\u20A6500,000')
assert.equal(m.money(null), 'n/a')
assert.equal(m.money(undefined), 'n/a')
assert.equal(m.money('abc'), 'n/a')

// chips
const t = base('tenant')
const chips = Object.fromEntries(m.summaryChips(t).map((c) => [c.key, c]))
assert.equal(chips.agreement.tone, 'done')
assert.equal(chips.payment.value, 'Verified and confirmed')
assert.equal(chips.handover.value, 'Waiting for the landlord')
assert.equal(chips.payout.tone, 'warn')
assert.equal(chips.renewal, undefined)

// the person who still has to act is told so
assert.equal(m.handoverChip(t.handover, 'landlord', true).value, 'Waiting for you to confirm')
assert.equal(m.handoverChip({ ...t.handover, tenant_confirmed_at: null }, 'tenant', true).value, 'Waiting for the tenant and the landlord')
assert.equal(m.handoverChip(null, 'tenant', false).tone, 'neutral')
assert.equal(m.handoverChip(null, 'tenant', true).tone, 'warn')
assert.equal(m.handoverChip({ ...t.handover, status: 'disputed' }, 'tenant', true).tone, 'bad')
assert.equal(m.handoverChip({ ...t.handover, status: 'completed', completed_via: 'admin_review' }, 'tenant', true).value, 'Completed after EboHomes review')

// payment chip never claims verified before it is
const pc = (status, confirmed = null, role = 'tenant') => m.paymentChip([{ id: 'x', type: 'rent', amount: 1, status, submitted_at: null, verified_at: null, confirmed_at: confirmed, receipt_code: null }], role)
assert.equal(pc('submitted').tone, 'warn')
assert.equal(pc('under_review').value, 'Proof under review')
assert.equal(pc('rejected').tone, 'bad')
assert.equal(pc('verified').value, 'Verified. Confirm it with your code')
assert.equal(pc('verified', null, 'landlord').value, 'Verified by EboHomes')
assert.equal(m.paymentChip([], 'tenant').value, 'No payment sent yet')
assert.equal(m.paymentChip([], 'landlord').value, 'No verified payment yet')

// agreement
assert.equal(m.agreementChip(null, 'proposed').tone, 'warn')
assert.equal(m.agreementChip(null, null).tone, 'neutral')

// payout states, including unknown values
for (const s of ['not_ready', 'on_hold', 'ready', 'in_progress', 'released']) assert.ok(m.payoutChip(s).value)
assert.equal(m.payoutChip('weird').value, 'Not started')
assert.equal(m.payoutChip('released').tone, 'done')

// timeline: newest first, role wording, no payouts for tenants
const tl = m.buildTimeline(t)
assert.equal(tl[0].title, 'You confirmed the key handover')
assert.equal(tl[tl.length - 1].title, 'Tenancy created')
assert.ok(tl.some((x) => x.title.startsWith('You sent proof')))
for (let i = 1; i < tl.length; i++) assert.ok(Date.parse(tl[i - 1].at) >= Date.parse(tl[i].at))
const ll = m.buildTimeline({ ...base('landlord') })
assert.equal(ll[0].title, 'The tenant confirmed the key handover')
assert.ok(ll.some((x) => x.title.startsWith('The tenant sent proof')))

const withPayout = { ...base('tenant'), payouts: [{ id: 'q1', status: 'paid', amount: 500000, payout_code: 'P1', created_at: '2026-10-07T09:00:00Z', paid_at: '2026-10-08T09:00:00Z', landlord_responded_at: null }] }
assert.equal(m.buildTimeline(withPayout).some((x) => x.title.includes('payout')), false)                 // tenant never sees payout amounts
assert.equal(m.buildTimeline({ ...withPayout, role: 'landlord' }).some((x) => x.title.includes('payout')), true)

// disputed handover shows who raised it, and in red
const dis = { ...base('landlord'), handover: { ...base('x').handover, status: 'disputed', disputed_at: '2026-10-09T09:00:00Z', disputed_role: 'tenant' } }
const d0 = m.buildTimeline(dis)[0]
assert.equal(d0.tone, 'bad'); assert.equal(d0.title, 'The tenant raised a concern about the key handover')

// renewals
const ren = { ...base('tenant'), renewals: [{ id: 'r1', status: 'accepted', new_rent: 600000, new_end_date: '2028-10-31', created_at: '2026-10-10T09:00:00Z', responded_at: '2026-10-11T09:00:00Z', applied: false }] }
assert.equal(m.summaryChips(ren).find((c) => c.key === 'renewal').tone, 'warn')
assert.equal(m.summaryChips({ ...ren, renewals: [{ ...ren.renewals[0], applied: true }] }).find((c) => c.key === 'renewal').tone, 'done')
assert.ok(m.buildTimeline(ren).some((x) => x.title === 'Renewal accepted by the tenant'))

// bad dates are skipped, not shown as "Invalid Date"
const bad = base('tenant'); bad.tenancy.created_at = null; bad.payments[0].submitted_at = 'nonsense'
assert.equal(m.buildTimeline(bad).some((x) => x.title === 'Tenancy created'), false)
console.log('tenancy-record: all passed')