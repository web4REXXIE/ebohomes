import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/trust-ops.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const t = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

// ---- case ordering: escalated first, then high priority, then longest waiting; closed last
const cases = [
  { id: 'closed', status: 'closed', priority: 'high', opened_at: '2026-10-01T00:00:00Z' },
  { id: 'normal-new', status: 'open', priority: 'normal', opened_at: '2026-11-04T00:00:00Z' },
  { id: 'normal-old', status: 'investigating', priority: 'normal', opened_at: '2026-11-01T00:00:00Z' },
  { id: 'high', status: 'open', priority: 'high', opened_at: '2026-11-03T00:00:00Z' },
  { id: 'escalated', status: 'escalated', priority: 'normal', opened_at: '2026-11-05T00:00:00Z' },
]
assert.deepEqual(t.sortCases(cases).map((c) => c.id), ['escalated', 'high', 'normal-old', 'normal-new', 'closed'])
assert.equal(cases[0].id, 'closed', 'sorting does not change the input list')
assert.equal(t.isCaseActive('open'), true)
assert.equal(t.isCaseActive('closed'), false)

// ---- search, paging, titles
assert.equal(t.caseMatches({ ref: 'INV-000007', title: 'Duplicate Flat X' }, 'inv-7'), false)
assert.equal(t.caseMatches({ ref: 'INV-000007', title: 'Duplicate Flat X' }, 'flat x'), true)
assert.equal(t.caseMatches({ ref: 'INV-000007', title: 'Duplicate Flat X' }, '  '), true)
const pg = t.paginate([1, 2, 3, 4, 5], 2, 2)
assert.deepEqual(pg, { items: [3, 4], pages: 3, page: 2 })
assert.equal(t.paginate([], 9, 15).page, 1, 'empty list is page 1')
assert.equal(t.paginate([1, 2, 3], 99, 2).page, 2, 'a page past the end is clamped')
assert.equal(t.cleanTitle('  Duplicate   photos \n at Flat X '), 'Duplicate photos at Flat X')
assert.equal(t.titleOk('abc'), false)
assert.equal(t.titleOk('Check Flat X'), true)

// ---- outcomes: a "confirmed violation" is a record, and every outcome is explained
assert.deepEqual(t.OUTCOME_OPTIONS.map((o) => o.value), ['no_issue', 'inconclusive', 'action_taken_elsewhere', 'confirmed_violation'])
assert.ok(t.OUTCOME_OPTIONS.every((o) => o.label && o.help))
assert.match(t.OUTCOME_OPTIONS.find((o) => o.value === 'confirmed_violation').help, /Records the finding only/)
for (const s of ['open', 'investigating', 'info_requested', 'escalated', 'closed']) {
  assert.ok(t.CASE_STATUS_LABEL[s] && t.CASE_STATUS_TONE[s], 'label and colour for ' + s)
}

// ---- who decides what: one owner per decision, every link goes to an admin page, no decision is approved by an investigation
const names = t.DECISION_OWNERSHIP.map((o) => o.decision)
assert.equal(new Set(names).size, names.length, 'each decision listed once')
assert.ok(t.DECISION_OWNERSHIP.every((o) => o.owner && o.where && o.doesNot && o.href.startsWith('/admin')))
const caseRow = t.DECISION_OWNERSHIP.find((o) => o.href.includes('tab=cases'))
assert.match(caseRow.doesNot, /never approves or rejects a property/i)
assert.match(caseRow.doesNot, /never resolves a risk alert/i)
const authRow = t.DECISION_OWNERSHIP.find((o) => /permission to list/.test(o.decision))
assert.match(authRow.doesNot, /risk score/i, 'a risk score cannot replace authority review')

// ---- permissions mirror the database: off = every admin, on = reviewer or super_admin only
assert.equal(t.canWorkCases(false, []), true)
assert.equal(t.canWorkCases(true, []), false)
assert.equal(t.canWorkCases(true, ['support', 'finance']), false)
assert.equal(t.canWorkCases(true, ['reviewer']), true)
assert.equal(t.canWorkCases(true, ['finance', 'super_admin']), true)
assert.deepEqual(t.CASE_ROLES, ['reviewer', 'super_admin'], 'only roles that already exist in Staff Roles')

// ---- overview parsing never invents numbers
const o = t.parseOverview({
  queues: { authority_pending: 4, risk_high: 'oops', cases_open: 2 }, period: { risk_resolved: 10, risk_false_positive: 3 },
  authority_avg_hours: 15.5, authority_avg_sample: 2, oldest_authority_wait_days: null,
  recent: [{ kind: 'Case closed', at: '2026-11-05T10:00:00Z', label: 'Flat X', href: '/admin/risk' }, { kind: 'bad' }, { kind: 'x', at: 'y', label: 'evil', href: 'https://evil.example' }],
})
assert.equal(o.queues.authority_pending, 4)
assert.equal(o.queues.risk_high, null, 'a non-number becomes null, not 0')
assert.equal(o.authorityAvgHours, 15.5)
assert.equal(o.oldestAuthorityWaitDays, null)
assert.equal(o.recent.length, 2, 'malformed rows are dropped')
assert.equal(o.recent[1].href, '/admin', 'an outside link is replaced by a safe admin link')
const empty = t.parseOverview(null)
assert.deepEqual(empty.queues, {}); assert.equal(empty.authorityAvgSample, 0); assert.deepEqual(empty.recent, [])

// ---- action rows: each goes to the page that owns the decision; missing data shows a dash, not zero
const rows = t.buildActionRows({ risk_high: 2, authority_pending: 0 })
assert.equal(rows[0].key, 'risk_high'); assert.equal(rows[0].urgent, true)
assert.equal(rows.find((r) => r.key === 'authority_pending').count, 0)
assert.equal(rows.find((r) => r.key === 'holds_active').count, null)
assert.ok(rows.every((r) => r.href.startsWith('/admin/')))
assert.equal(rows.find((r) => r.key === 'identity_pending').href, '/admin/verify-landlords')
assert.equal(rows.find((r) => r.key === 'inspections_pending').href, '/admin/inspections')
assert.equal(rows.find((r) => r.key === 'authority_pending').href, '/admin/listing-authority')
assert.equal(t.countText(null), '—'); assert.equal(t.countText(0), '0')

// ---- numbers that cannot mislead
assert.equal(t.formatDuration(null), 'No data')
assert.equal(t.formatDuration(-3), 'No data')
assert.equal(t.formatDuration(0.4), 'Under 1 hour')
assert.equal(t.formatDuration(1), '1 hour')
assert.equal(t.formatDuration(15), '15 hours')
assert.equal(t.formatDuration(72), '3 days')
assert.equal(t.ratioText(3, 12), '3 of 12')
assert.equal(t.ratioText(0, 0), 'None yet', 'no divide-by-zero percentage')
assert.equal(t.ratioText(null, 5), 'No data')

// ---- date ranges
const now = new Date('2026-11-06T00:00:00Z')
const r30 = t.presetRange('30', now)
assert.equal(r30.to, '2026-11-06T00:00:00.000Z'); assert.equal(r30.from, '2026-10-07T00:00:00.000Z')
assert.equal(t.rangeValid(r30.from, r30.to), true)
assert.equal(t.rangeValid(r30.to, r30.from), false, 'backwards range')
assert.equal(t.rangeValid('2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), false, 'longer than a year')
assert.equal(t.rangeValid('nope', r30.to), false)
assert.equal(t.dayRange('x', '2026-11-05'), null)
const dr = t.dayRange('2026-11-01', '2026-11-05')
assert.ok(new Date(dr.to) > new Date(dr.from))

// ---- error wording
assert.equal(t.friendlyTrustError('Write a short note.'), 'Write a short note.')
assert.equal(t.friendlyTrustError('Another open case already covers this listing. Add to that case instead.'), 'Another open case already covers this listing. Add to that case instead.')
assert.equal(t.friendlyTrustError('You do not have the role needed for investigation cases.'), 'You do not have the role needed for investigation cases.')
assert.equal(t.friendlyTrustError('duplicate key value violates unique constraint "x"'), 'Something went wrong. Please try again.')
assert.equal(t.friendlyTrustError(null), 'Something went wrong. Please try again.')

// ---- SQL safety rules: the migration records and reports. It never decides.
const sqlFile = 'supabase/20261120_01_trust_operations.sql'
assert.ok(existsSync(sqlFile) && existsSync('supabase/20261120_00_trust_ops_readonly_checks.sql'), 'both SQL files are present')
const sql = readFileSync(sqlFile, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
assert.ok(!/update\s+public\.(listings|profiles|applications|tenancies|viewings|properties|property_holds|property_inspections)\b/i.test(sql), 'must not update listings, accounts, applications, tenancies, properties, holds or inspections')
assert.ok(!/update\s+public\.risk_alerts\b/i.test(sql), 'must not change a risk alert; those are resolved in Risk Alerts')
assert.ok(!/(insert\s+into|update|delete\s+from)\s+public\.(listing_authority_\w+|listing_document_reviews|risk_alert_events|risk_alert_evidence)\b/i.test(sql), 'must not write to authority, document-review or risk history tables')
assert.ok(!/delete\s+from\s+public\.(listings|profiles|applications|tenancies)\b/i.test(sql), 'must not delete listings or accounts')
assert.ok(!/eb\.authority_write|authority_status\s*=\s*p_|set\s+authority_status/i.test(sql), 'must not write authority_status')
assert.ok(!/admin_place_property_hold|admin_release_property_hold|admin_review_|admin_risk_resolve/i.test(sql), 'must not call another workflow\'s decision functions')
assert.ok(!/storage_path|createSignedUrl/i.test(sql), 'must not copy file paths into case records')
assert.ok(/enforce_permissions boolean not null default false/.test(sql), 'role gate is off by default so nobody is locked out')
// every admin function checks the caller on the server
for (const fn of ['admin_case_open', 'admin_case_assign', 'admin_case_add_note', 'admin_case_request_info', 'admin_case_escalate', 'admin_case_link_alert', 'admin_case_close', 'admin_case_reopen']) {
  const body = sql.split(new RegExp('create or replace function public\\.' + fn + '\\(')).pop().split('end $f$;')[0]
  assert.ok(/eb_case_load\(|eb_is_admin\(\)/.test(body), fn + ' checks the caller on the server')
}
assert.ok(/for update/.test(sql.split('function public.eb_case_load')[1].split('end $f$;')[0]), 'case row is locked so two admins cannot act at once')
assert.ok(/You cannot act on a case about your own account/.test(sql), 'an admin cannot work a case about themselves')
assert.ok(/aa_trust_case_events_guard/.test(sql) && /aa_trust_cases_no_delete/.test(sql), 'history is append-only and cases cannot be deleted')
assert.ok(/enable row level security/.test(sql) && /eb_is_admin\(\)/.test(sql), 'row security is on, admin read only')

// ---- the page and nav use the real routes
const page = readFileSync('app/admin/operations/page.tsx', 'utf8')
assert.ok(/from '@\/lib\/trust-ops'/.test(page))
assert.ok(/<Suspense/.test(page), 'useSearchParams is inside Suspense')
for (const fn of ['admin_case_open', 'admin_case_assign', 'admin_case_add_note', 'admin_case_request_info', 'admin_case_escalate', 'admin_case_link_alert', 'admin_case_close', 'admin_case_reopen', 'admin_trust_overview', 'admin_trust_my_access', 'admin_trust_set_enforcement']) {
  assert.ok(page.includes("'" + fn + "'"), 'page calls ' + fn)
}
assert.ok(readFileSync('app/admin/layout.tsx', 'utf8').includes("'/admin/operations'"), 'nav links to Trust Operations')

console.log('trust-ops tests passed')
