import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

// Regression guard for the tenant rental journey. Plain Node: transpiles the TypeScript and wires the one import.
const js = (path) => transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const viewingUrl = url(js('lib/viewing-status.ts'))
const { buildJourney, statusPanel, lockedReason } = await import(url(js('lib/rental-journey.ts').replace(/'@\/lib\/viewing-status'/, `'${viewingUrl}'`)))


const eq = (name, got, want) => assert.deepEqual(got, want, name)
const base = (o) => ({ viewings: [], tenancy: null, terms: null, ...o })
const J = (o) => buildJourney(base(o))
const st = (j) => j.steps.map((s) => s.state[0]).join('')
const lab = (j, i) => j.steps[i].label

let j = J({ app: { status: 'pending' } })
eq('pending phase', j.phase, 'under_review'); eq('pending states', st(j), 'dcuuu'); eq('pending cur', j.currentKey, 'decision')
j = J({ app: { status: 'info_requested' } }); eq('info needsYou', j.steps[1].needsYou, true)
j = J({ app: { status: 'rejected' } }); eq('rejected states', st(j), 'dsuuu'); eq('rejected lock', !!lockedReason(j, 'setup'), true)
j = J({ app: { status: 'withdrawn' } }); eq('withdrawn states', st(j), 'suuuu')
j = J({ app: { status: 'weird' } }); eq('unknown', j.phase, 'unknown')
// approved must NOT become tenancy / active
j = J({ app: { status: 'approved' } }); eq('approved no viewing', j.phase, 'v_none'); eq('approved states', st(j), 'ddcuu'); eq('approved not active', j.steps[4].state, 'upcoming')
// viewing during review does not complete anything
j = J({ app: { status: 'pending' }, viewings: [{ id: 'v', status: 'scheduled' }] }); eq('pending+scheduled stays decision', j.currentKey, 'decision'); eq('side label', lab(j, 2), 'Appointment scheduled')
j = J({ app: { status: 'pending' }, viewings: [{ id: 'v', status: 'completed', tenant_decision: 'interested' }] }); eq('pending+interested', lab(j, 2), 'You want to proceed'); eq('viewing not done', j.steps[2].state, 'upcoming')
j = J({ app: { status: 'approved' }, viewings: [{ id: 'v', status: 'completed' }] }); eq('completed no decision', j.phase, 'v_decide'); eq('viewing not done yet', j.steps[2].state, 'current')
j = J({ app: { status: 'approved' }, viewings: [{ id: 'v', status: 'completed', tenant_decision: 'interested' }] }); eq('legacy confirm', j.phase, 'v_confirm')
j = J({ app: { status: 'approved' }, viewings: [{ id: 'v', status: 'completed', tenant_decision: 'not_interested' }] }); eq('declined', j.phase, 'v_declined')
for (const [s, p] of [['requested','v_waiting'],['approved','v_waiting'],['reschedule_proposed','v_proposed'],['scheduled','v_scheduled'],['no_show','v_retry'],['cancelled','v_retry'],['rejected','v_retry']] )
  eq('viewing ' + s, J({ app: { status: 'approved' }, viewings: [{ id: 'v', status: s }] }).phase, p)
j = J({ app: { status: 'approved' }, viewings: [{ id: 'old', status: 'completed', tenant_decision: 'not_interested' }, { id: 'n', status: 'requested' }] }); eq('open viewing wins', j.phase, 'v_waiting')
j = J({ app: { status: 'approved', tenant_interest_at: 'x' } }); eq('awaiting tenancy', j.phase, 'awaiting_tenancy'); eq('awaiting states', st(j), 'dddcu'); eq('viewing done label', lab(j, 2), 'Confirmed to proceed')
// tenancy states
const T = { id: 't1', status: 'pending' }
const A = { status: 'approved', tenant_interest_at: 'x' }
j = J({ app: A, tenancy: T }); eq('terms none', j.phase, 'terms_none')
j = J({ app: A, tenancy: T, terms: { status: 'proposed' } }); eq('terms review', j.phase, 'terms_review'); eq('review needsYou', j.steps[3].needsYou, true)
j = J({ app: A, tenancy: T, terms: { status: 'proposed', tenant_accepted_at: 'x' } }); eq('terms wait', j.phase, 'terms_waiting_landlord')
j = J({ app: A, tenancy: T, terms: { status: 'accepted' } }); eq('terms accepted', j.phase, 'terms_accepted')
j = J({ app: A, tenancy: T, terms: { status: 'signed' } }); eq('terms signed NOT active', j.phase, 'terms_signed'); eq('signed step5 upcoming', j.steps[4].state, 'upcoming')
j = J({ app: A, tenancy: { id: 't1', status: 'active' }, terms: { status: 'signed' } }); eq('active', j.phase, 'active'); eq('active states', st(j), 'ddddc'.replace(' ', '')); 
j = J({ app: { status: 'approved' }, tenancy: { id: 't1', status: 'active' } }); eq('tenancy w/o interest label', lab(j, 2), 'Tenancy created')
j = J({ app: A, tenancy: { id: 't1', status: 'ended' } }); eq('ended', j.phase, 'ended'); eq('ended label', lab(j, 4), 'Tenancy ended')
j = J({ app: A, tenancy: { id: 't1', status: 'terminated' } }); eq('terminated', j.phase, 'ended')
// every phase yields a complete panel
for (const p of ['withdrawn','rejected','unknown','under_review','info_requested','v_none','v_waiting','v_proposed','v_scheduled','v_decide','v_confirm','v_declined','v_retry','awaiting_tenancy','terms_none','terms_review','terms_waiting_landlord','terms_accepted','terms_signed','active','ended'] ) {
  const x = statusPanel(p, { tenancyId: 't1' }); eq('panel ' + p, [x.heading, x.happened, x.means, x.next, x.action].every((s) => s.length > 10), true)
}
// panel never claims action for waiting states
eq('waiting needsYou false', statusPanel('under_review', {}).needsYou, false)


console.log('rental-journey: all checks passed')
