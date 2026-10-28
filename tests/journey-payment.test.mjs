import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
const js = (p) => transpileModule(readFileSync(p, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const url = (c) => 'data:text/javascript;base64,' + Buffer.from(c).toString('base64')
const vu = url(js('lib/viewing-status.ts'))
const { buildJourney, statusPanel } = await import(url(js('lib/rental-journey.ts').replace(/'@\/lib\/viewing-status'/, `'${vu}'`)))
const eq = (n, g, w) => assert.deepEqual(g, w, n)
const J = (o) => buildJourney({ viewings: [], tenancy: null, terms: null, ...o })
const app = { status: 'approved', tenant_interest_at: '2026-10-01' }
const T = { id: 't', status: 'active' }

eq('signed, no verified payment: payment is next', J({ app, tenancy: T, terms: { status: 'signed' }, paymentVerified: false }).phase, 'terms_signed')
eq('signed, no verified payment: setup is the current step', J({ app, tenancy: T, terms: { status: 'signed' }, paymentVerified: false }).currentKey, 'setup')
eq('signed, payment verified: active', J({ app, tenancy: T, terms: { status: 'signed' }, paymentVerified: true }).phase, 'active')
eq('signed, payments not loaded: old behaviour', J({ app, tenancy: T, terms: { status: 'signed' } }).phase, 'active')
eq('proposed terms still win over payment flag', J({ app, tenancy: T, terms: { status: 'proposed' }, paymentVerified: false }).phase, 'terms_review')
eq('ended tenancy stays ended', J({ app, tenancy: { id: 't', status: 'ended' }, terms: { status: 'signed' }, paymentVerified: false }).phase, 'ended')
// An 'active' tenancy with no terms record is only treated as running once EboHomes has verified a payment.
eq('no terms, payment not verified: not running', J({ app, tenancy: T, paymentVerified: false }).phase, 'terms_none')
eq('no terms, payment not loaded: not running', J({ app, tenancy: T }).phase, 'terms_none')
eq('older tenancy, no terms, payment verified: active', J({ app, tenancy: T, paymentVerified: true }).phase, 'active')
eq('payment panel text says not active until verified', /becomes active after EboHomes verifies/.test(statusPanel('terms_signed', { tenancyId: 't' }).means), true)
console.log('journey-payment: ok')