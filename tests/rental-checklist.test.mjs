// Targeted tests for the final-rental checklist. Plain Node: transpiles the TypeScript, no imports to wire.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/rental-checklist.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const { buildChecklist, isVerifiedPayment } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

const eq = (name, got, want) => assert.deepEqual(got, want, name)
const keys = (c) => c.items.map((i) => i.state).join(',')

// No signed agreement: nothing downstream is done.
let c = buildChecklist({ terms: { status: 'accepted' } })
eq('accepted is not signed', c.agreementRecorded, false); eq('stage', c.stage, 'agreement_pending'); eq('states', keys(c), 'current,upcoming,upcoming,upcoming')

// Signed agreement alone: not rented, not paid, not complete.
c = buildChecklist({ terms: { status: 'signed' }, payments: [], submissions: [] })
eq('signed recorded', c.agreementRecorded, true); eq('signed not paid', c.paymentVerified, false); eq('signed not complete', c.rentalCompleted, false)
eq('signed stage', c.stage, 'agreement_recorded')

// Uploaded evidence is NOT verified.
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'submitted' }] })
eq('evidence not verified', c.paymentVerified, false); eq('evidence stage', c.stage, 'payment_awaiting_check'); eq('handover locked', c.items[2].state, 'upcoming')
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'under_review' }] })
eq('under review not verified', c.paymentVerified, false)

// Rejected / needs_info are visible actions, not paid.
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'rejected' }] })
eq('rejected stage', c.stage, 'payment_needs_attention'); eq('rejected blocked', c.items[1].state, 'blocked')
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'rejected' }, { status: 'submitted' }] })
eq('corrected evidence is awaiting', c.stage, 'payment_awaiting_check')

// A payment row counts only when confirmed AND verified_by is set.
eq('recorded not verified', isVerifiedPayment({ status: 'recorded', verified_by: null }), false)
eq('confirmed without verifier', isVerifiedPayment({ status: 'confirmed', verified_by: null }), false)
eq('confirmed with verifier', isVerifiedPayment({ status: 'confirmed', verified_by: 'u1' }), true)

// Payment verified, handover not done.
c = buildChecklist({ terms: { status: 'signed' }, payments: [{ status: 'confirmed', verified_by: 'a1' }], handover: null })
eq('verified stage', c.stage, 'handover_pending'); eq('not complete', c.rentalCompleted, false); eq('handover current', c.items[2].state, 'current')
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'verified' }], handover: { status: 'open' } })
eq('verified submission counts', c.paymentVerified, true); eq('open handover', c.stage, 'handover_pending')

// Disputed handover blocks completion.
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'verified' }], handover: { status: 'disputed' } })
eq('disputed stage', c.stage, 'handover_disputed'); eq('disputed not complete', c.rentalCompleted, false); eq('disputed blocked', c.items[2].state, 'blocked')

// All three records: complete.
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'verified' }], handover: { status: 'completed' } })
eq('complete', c.rentalCompleted, true); eq('complete stage', c.stage, 'rental_completed'); eq('all done', keys(c), 'done,done,done,done')

// Handover marked completed without a verified payment must NOT complete the rental.
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'submitted' }], handover: { status: 'completed' } })
eq('handover without payment', c.rentalCompleted, false)
// ...and a verified payment with an unsigned agreement must not either.
c = buildChecklist({ terms: { status: 'accepted' }, submissions: [{ status: 'verified' }], handover: { status: 'completed' } })
eq('payment without signed agreement', c.rentalCompleted, false)

// Listing label is never an input to completion, but a mismatch is reported.
c = buildChecklist({ terms: { status: 'signed' }, listingStatus: 'rented' })
eq('rented label does not complete', c.rentalCompleted, false); eq('mismatch flagged', c.listingMismatch, true)
c = buildChecklist({ terms: { status: 'signed' }, submissions: [{ status: 'verified' }], handover: { status: 'completed' }, listingStatus: 'rented' })
eq('no mismatch when complete', c.listingMismatch, false)
c = buildChecklist({ terms: null, listingStatus: 'approved' })
eq('null terms safe', c.stage, 'agreement_pending')

console.log('rental-checklist: ok')