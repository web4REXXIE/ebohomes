import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

// Regression guard for the repaired payment workflow in the tenant journey (lib/rental-journey.ts and the journey component wiring).
const js = (p) => transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const url = (c) => 'data:text/javascript;base64,' + Buffer.from(c).toString('base64')
const vu = url(js('lib/viewing-status.ts'))
const { buildJourney, statusPanel, showsNoReservationNotice } = await import(url(js('lib/rental-journey.ts').replace(/'@\/lib\/viewing-status'/, `'${vu}'`)))
const eq = (n, g, w) => assert.deepEqual(g, w, n)
const J = (o) => buildJourney({ viewings: [], tenancy: null, terms: null, ...o })
const app = { status: 'approved', tenant_interest_at: '2026-10-01' }
const T = { id: 't1', status: 'active' }
const SIGNED = { status: 'signed' }

// 1. No terms: never "Your tenancy is active".
let j = J({ app, tenancy: T, paymentVerified: false })
eq('no terms: phase', j.phase, 'terms_none'); eq('no terms: setup is current', j.currentKey, 'setup'); eq('no terms: active step upcoming', j.steps[4].state, 'upcoming')
eq('no terms: payments not loaded', J({ app, tenancy: T }).phase, 'terms_none')
let p = statusPanel('terms_none', { tenancyId: 't1' })
eq('no terms heading', p.heading, 'Your rental terms are being prepared'); eq('no terms is not "active"', /tenancy is active/i.test(p.heading), false)

// 2. Payment due: signed terms, nothing verified.
j = J({ app, tenancy: T, terms: SIGNED, paymentVerified: false })
eq('payment due phase', j.phase, 'terms_signed'); eq('payment due: setup current', j.currentKey, 'setup')
p = statusPanel('terms_signed', { tenancyId: 't1' })
eq('payment due: needs pay', /Pay and submit/.test(p.action), true)
for (const ps of ['submitted', 'under_review']) {
  p = statusPanel('terms_signed', { tenancyId: 't1', proofStatus: ps })
  eq(`evidence ${ps}: nothing to do`, p.needsYou, false); eq(`evidence ${ps}: not claimed verified`, /has not confirmed/.test(p.means), true)
}
for (const ps of ['needs_info', 'rejected']) {
  p = statusPanel('terms_signed', { tenancyId: 't1', proofStatus: ps })
  eq(`evidence ${ps}: tenant must act`, p.needsYou, true); eq(`evidence ${ps}: links to pay page`, p.cta.href, '/tenancies/t1/pay')
}

// 3. Verified, code not entered: prompt for the existing confirmation page.
j = J({ app, tenancy: T, terms: SIGNED, paymentVerified: true, awaitingConfirmationId: 'sub-1' })
eq('awaiting code phase', j.phase, 'payment_confirm'); eq('awaiting code: needsYou', j.steps[3].needsYou, true); eq('awaiting code: setup current', j.currentKey, 'setup')
eq('awaiting code: active step not reached', j.steps[4].state, 'upcoming')
p = statusPanel('payment_confirm', { tenancyId: 't1', awaitingConfirmationId: 'sub-1' })
eq('awaiting code cta', p.cta.href, '/payment-confirmation/sub-1'); eq('awaiting code needsYou', p.needsYou, true)
eq('awaiting code: no cta without id', statusPanel('payment_confirm', {}).cta, null)
eq('code already used: normal active', J({ app, tenancy: T, terms: SIGNED, paymentVerified: true, awaitingConfirmationId: null }).phase, 'active')
eq('awaiting code only after signed terms', J({ app, tenancy: T, terms: { status: 'proposed' }, awaitingConfirmationId: 'x' }).phase, 'terms_review')
eq('ended stays ended', J({ app, tenancy: { id: 't1', status: 'ended' }, terms: SIGNED, awaitingConfirmationId: 'x' }).phase, 'ended')
eq('no reservation notice hidden while confirming', showsNoReservationNotice('payment_confirm'), false)

// 4. Handover and completion wording.
const ctx = (h) => statusPanel('active', { tenancyId: 't1', handover: h })
eq('handover completed', /Rental complete/.test(ctx('completed').heading), true)
for (const h of ['none', 'tenant_confirmed', 'landlord_confirmed']) eq(`handover ${h}: not complete`, /Rental complete/.test(ctx(h).heading), false)
eq('handover none: tenant acts', ctx('none').needsYou, true)
eq('handover tenant_confirmed: waiting', ctx('tenant_confirmed').needsYou, false)
eq('handover disputed: under review', /under review/.test(ctx('disputed').heading), true)
eq('handover unknown: generic active', ctx('unknown').heading, 'Your tenancy is active')

// 5. The component keeps the confirmation step wired in and only one checklist.
const comp = readFileSync('components/rental-journey.tsx', 'utf8')
eq('one checklist only', (comp.match(/<TenancyChecklist /g) ?? []).length, 1)
eq('journey reads confirmation state through the existing function', /eb_my_confirmation_state/.test(comp), true)
eq('journey links to the confirmation page', /\/payment-confirmation\//.test(comp), true)
console.log('journey-payment-workflow: ok')