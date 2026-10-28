import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
const js = (p) => transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const url = (c) => 'data:text/javascript;base64,' + Buffer.from(c).toString('base64')
const vu = url(js('lib/viewing-status.ts'))
const { buildJourney, statusPanel, showsNoReservationNotice } = await import(url(js('lib/rental-journey.ts').replace(/'@\/lib\/viewing-status'/, `'${vu}'`)))
const eq = (n, g, w) => assert.deepEqual(g, w, n)
const J = (o) => buildJourney({ viewings: [], tenancy: null, terms: null, ...o })
const app = { status: 'approved', tenant_interest_at: '2026-10-01' }

// A brand-new tenancy is 'active' in the database. With proposed/accepted terms the journey must show the terms steps.
eq('active + proposed terms', J({ app, tenancy: { id: 't', status: 'active' }, terms: { status: 'proposed' } }).phase, 'terms_review')
eq('active + proposed accepted by tenant', J({ app, tenancy: { id: 't', status: 'active' }, terms: { status: 'proposed', tenant_accepted_at: 'x' } }).phase, 'terms_waiting_landlord')
eq('active + accepted terms', J({ app, tenancy: { id: 't', status: 'active' }, terms: { status: 'accepted' } }).phase, 'terms_accepted')
eq('terms step is current, active step is upcoming', J({ app, tenancy: { id: 't', status: 'active' }, terms: { status: 'proposed' } }).steps.map((s) => s.state[0]).join(''), 'dddcu')
// Signed agreement on an active tenancy still reaches the Active Tenancy step (payment and handover live there). Unchanged.
eq('active + signed terms', J({ app, tenancy: { id: 't', status: 'active' }, terms: { status: 'signed' } }).phase, 'active')
// Older tenancies with no terms record keep the old behaviour.
eq('legacy active, no terms', J({ app, tenancy: { id: 't', status: 'active' } }).phase, 'active')
eq('ended stays ended', J({ app, tenancy: { id: 't', status: 'ended' }, terms: { status: 'proposed' } }).phase, 'ended')
eq('non-active tenancy, no terms', J({ app, tenancy: { id: 't', status: 'pending' } }).phase, 'terms_none')

// Waiting list: approved, no tenancy, another applicant agreed.
let j = J({ app, waitlisted: true })
eq('waitlisted phase', j.phase, 'waitlisted'); eq('waitlisted step label', j.steps[3].label, 'On the waiting list'); eq('waitlisted needs nothing', j.steps[3].needsYou, false)
eq('waitlisted is not active', j.steps[4].state, 'upcoming')
eq('waitlisted panel mentions not rejected', /not been rejected/.test(statusPanel('waitlisted', {}).means), true)
eq('waitlisted keeps the no-reservation notice', showsNoReservationNotice('waitlisted'), true)
// Waiting-list flag never overrides a closed or unapproved application, and never overrides an existing tenancy of your own.
eq('rejected stays rejected', J({ app: { status: 'rejected' }, waitlisted: true }).phase, 'rejected')
eq('withdrawn stays withdrawn', J({ app: { status: 'withdrawn' }, waitlisted: true }).phase, 'withdrawn')
eq('pending stays under review', J({ app: { status: 'pending' }, waitlisted: true }).phase, 'under_review')
eq('own tenancy beats waitlist', J({ app, waitlisted: true, tenancy: { id: 't', status: 'active' }, terms: { status: 'proposed' } }).phase, 'terms_review')
eq('waitlisted false behaves as before', J({ app, waitlisted: false }).phase, 'awaiting_tenancy')
console.log('journey-stage2: ok')
