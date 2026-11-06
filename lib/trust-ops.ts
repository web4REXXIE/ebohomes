// Phase 9.5 - Trust Operations. Pure helpers, no imports, so they can be unit tested directly.
// Rule: this file never decides anything about a listing, account or property. It only describes, orders and formats.
// The database (supabase/20261120_01_trust_operations.sql) is the source of truth and enforces every rule here.

// ---------------------------------------------------------------- investigation cases
export type CaseStatus = 'open' | 'investigating' | 'info_requested' | 'escalated' | 'closed'
export type CaseOutcome = 'no_issue' | 'inconclusive' | 'action_taken_elsewhere' | 'confirmed_violation'
export type CasePriority = 'normal' | 'high'

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: 'Open', investigating: 'Investigating', info_requested: 'Waiting for lister', escalated: 'Escalated', closed: 'Closed',
}

export const CASE_STATUS_TONE: Record<CaseStatus, string> = {
  open: 'border-amber-300 bg-amber-50 text-amber-900',
  investigating: 'border-blue-300 bg-blue-50 text-blue-900',
  info_requested: 'border-slate-300 bg-slate-100 text-slate-800',
  escalated: 'border-red-300 bg-red-50 text-red-900',
  closed: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

export const OUTCOME_OPTIONS: { value: CaseOutcome; label: string; help: string }[] = [
  { value: 'no_issue', label: 'No issue found', help: 'The concern was checked and there is nothing to act on.' },
  { value: 'inconclusive', label: 'Inconclusive', help: 'Not enough evidence either way. Closed without a finding.' },
  { value: 'action_taken_elsewhere', label: 'Handled in another workflow', help: 'The owning review (authority, documents, inspection, holds or accounts) was used. Say which one in your note.' },
  { value: 'confirmed_violation', label: 'Confirmed policy violation', help: 'Records the finding only. Any account or listing action is a separate, deliberate step in its own page.' },
]

export const CASE_EVENT_LABEL: Record<string, string> = {
  opened: 'Case opened', assigned: 'Assigned', note: 'Internal note', info_requested: 'Asked the lister for information',
  escalated: 'Escalated', alert_linked: 'Risk alert linked', closed: 'Case closed', reopened: 'Case reopened',
}

export function isCaseActive(status: string): boolean { return status !== 'closed' }

// Escalated first, then high priority, then the case that has waited longest. Closed cases go last.
export function sortCases<T extends { status: string; priority?: string | null; opened_at: string }>(list: T[]): T[] {
  const rank = (c: T) => (c.status === 'closed' ? 3 : c.status === 'escalated' ? 0 : c.priority === 'high' ? 1 : 2)
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (rank(a.c) - rank(b.c)) || (new Date(a.c.opened_at).getTime() - new Date(b.c.opened_at).getTime()) || a.i - b.i)
    .map((o) => o.c)
}

// Search by reference or title. Empty text matches everything.
export function caseMatches(c: { ref: string; title: string }, text: string): boolean {
  const q = text.trim().toLowerCase()
  return !q || c.ref.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
}

export function paginate<T>(list: T[], page: number, size: number): { items: T[]; pages: number; page: number } {
  const s = Math.max(1, Math.floor(size) || 1)
  const pages = Math.max(1, Math.ceil(list.length / s))
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  return { items: list.slice((p - 1) * s, p * s), pages, page: p }
}

// A case title is what other administrators scan in a list.
export function cleanTitle(raw: string): string { return raw.replace(/\s+/g, ' ').trim().slice(0, 200) }
export function titleOk(raw: string): boolean { const t = cleanTitle(raw); return t.length >= 5 }

// ---------------------------------------------------------------- who decides what
export type Ownership = {
  decision: string
  owner: string
  where: string
  href: string
  doesNot: string
}

// One row per decision, one owner per row. This is the written rule that stops one workflow overwriting another.
export const DECISION_OWNERSHIP: Ownership[] = [
  { decision: 'Is this landlord who they say they are?', owner: 'Identity reviewer', where: 'Verify Landlords', href: '/admin/verify-landlords',
    doesNot: 'Does not decide whether they may list a particular property.' },
  { decision: 'Is a submitted document clear, relevant, or a concern?', owner: 'Document reviewer', where: 'Listing Authority', href: '/admin/listing-authority',
    doesNot: 'Does not accept or reject the listing. It only records what the document shows.' },
  { decision: 'Does the evidence support permission to list this property?', owner: 'Authority reviewer', where: 'Listing Authority', href: '/admin/listing-authority',
    doesNot: 'Is not changed by a risk score, a risk alert or an investigation case.' },
  { decision: 'May this listing go live?', owner: 'Property reviewer', where: 'Property Review', href: '/admin/property-review',
    doesNot: 'Is not triggered by closing an investigation case.' },
  { decision: 'Does the physical property match the listing?', owner: 'Inspection reviewer', where: 'Inspections', href: '/admin/inspections',
    doesNot: 'Does not decide authority or identity.' },
  { decision: 'Is a suspicious pattern real?', owner: 'Risk investigator', where: 'Risk Alerts', href: '/admin/risk',
    doesNot: 'Never bans, hides, rejects or deletes by itself.' },
  { decision: 'Does a wider concern need a tracked investigation?', owner: 'Risk investigator', where: 'Trust Operations - Investigations', href: '/admin/operations?tab=cases',
    doesNot: 'Opening or closing a case never approves or rejects a property and never resolves a risk alert.' },
  { decision: 'Should new applications, viewings and tenancies be blocked?', owner: 'Hold administrator', where: 'Property Holds', href: '/admin/holds',
    doesNot: 'Does not hide the listing or touch existing applications and tenancies.' },
  { decision: 'Should an account be restricted?', owner: 'Account administrator', where: 'Manage Users', href: '/admin/users',
    doesNot: 'Is never an automatic result of a match, an alert or a case outcome.' },
]

// ---------------------------------------------------------------- permissions (mirrors eb_staff_can in the SQL)
// staff_roles already holds: support, verifier, reviewer, finance, payout_approver, super_admin.
// No new role names are invented. Investigation case work maps to reviewer and super_admin.
export const CASE_ROLES = ['reviewer', 'super_admin']

// While enforcement is off (the default), every administrator can work cases, exactly as before.
// When it is on, an administrator needs one of CASE_ROLES. The database makes the real decision.
export function canWorkCases(enforced: boolean, roles: string[]): boolean {
  return !enforced || roles.some((r) => CASE_ROLES.includes(r))
}

// ---------------------------------------------------------------- overview and reporting
export type Overview = {
  queues: Record<string, number | null>
  period: Record<string, number | null>
  authorityAvgHours: number | null
  authorityAvgSample: number
  oldestAuthorityWaitDays: number | null
  recent: { kind: string; at: string; label: string; href: string }[]
}

export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Reads the database answer defensively. A missing number stays null and is shown as a dash, never as a made-up zero.
export function parseOverview(raw: unknown): Overview {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const pick = (o: any): Record<string, number | null> => {
    const out: Record<string, number | null> = {}
    if (o && typeof o === 'object') for (const k of Object.keys(o)) out[k] = num(o[k])
    return out
  }
  const recent = Array.isArray(r.recent) ? r.recent : []
  return {
    queues: pick(r.queues),
    period: pick(r.period),
    authorityAvgHours: num(r.authority_avg_hours),
    authorityAvgSample: num(r.authority_avg_sample) ?? 0,
    oldestAuthorityWaitDays: num(r.oldest_authority_wait_days),
    recent: recent
      .filter((x: any) => x && typeof x.kind === 'string' && typeof x.at === 'string')
      .map((x: any) => ({ kind: x.kind, at: x.at, label: typeof x.label === 'string' ? x.label : '', href: typeof x.href === 'string' && x.href.startsWith('/admin') ? x.href : '/admin' }))
      .slice(0, 12),
  }
}

export type ActionRow = { key: string; label: string; hint: string; href: string; count: number | null; urgent: boolean }

// What is waiting for a decision, in the order an administrator should look at it. Each row goes straight to the owning page.
export function buildActionRows(queues: Record<string, number | null>): ActionRow[] {
  const q = (k: string) => (k in queues ? queues[k] : null)
  return [
    { key: 'risk_high', label: 'High-priority risk alerts', hint: 'Serious signals that need a person to look', href: '/admin/risk', count: q('risk_high'), urgent: true },
    { key: 'cases_escalated', label: 'Escalated investigations', hint: 'Waiting for senior attention', href: '/admin/operations?tab=cases&status=escalated', count: q('cases_escalated'), urgent: true },
    { key: 'risk_open', label: 'Open risk investigations', hint: 'Alerts at "Investigate" level or higher', href: '/admin/risk', count: q('risk_open'), urgent: false },
    { key: 'cases_open', label: 'Open investigation cases', hint: 'Tracked investigations that are not closed', href: '/admin/operations?tab=cases', count: q('cases_open'), urgent: false },
    { key: 'duplicates', label: 'Possible duplicate properties', hint: 'Matching listings across accounts. A match is not proof.', href: '/admin/risk', count: q('duplicates'), urgent: false },
    { key: 'authority_pending', label: 'Listings awaiting authority review', hint: 'Evidence that a lister may list the property', href: '/admin/listing-authority', count: q('authority_pending'), urgent: false },
    { key: 'docs_unreviewed', label: 'Documents awaiting a review decision', hint: 'Submitted on listings that are waiting for authority review', href: '/admin/listing-authority', count: q('docs_unreviewed'), urgent: false },
    { key: 'identity_pending', label: 'Landlord identity checks', hint: 'ID and selfie submitted, waiting for a decision', href: '/admin/verify-landlords', count: q('identity_pending'), urgent: false },
    { key: 'inspections_pending', label: 'Inspections to review', hint: 'Submitted by an inspector', href: '/admin/inspections', count: q('inspections_pending'), urgent: false },
    { key: 'evidence_requests', label: 'Outstanding requests for evidence', hint: 'Authority requests plus risk alerts and cases waiting for the lister', href: '/admin/listing-authority', count: q('evidence_requests'), urgent: false },
    { key: 'holds_active', label: 'Properties on hold', hint: 'New applications, viewings and tenancies are blocked', href: '/admin/holds', count: q('holds_active'), urgent: false },
  ]
}

// ---------------------------------------------------------------- number formatting that cannot mislead
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return 'No data'
  if (hours < 1) return 'Under 1 hour'
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
  const d = Math.round(hours / 24)
  return `${d} days`
}

// "3 of 12" instead of a percentage, so a small sample is never dressed up as a trend.
export function ratioText(part: number | null | undefined, whole: number | null | undefined): string {
  if (part === null || part === undefined || whole === null || whole === undefined) return 'No data'
  if (whole <= 0) return 'None yet'
  return `${part} of ${whole}`
}

export function countText(n: number | null | undefined): string { return n === null || n === undefined ? '—' : String(n) }

export type RangePreset = '7' | '30' | '90'

export function presetRange(preset: RangePreset, now: Date): { from: string; to: string } {
  const days = Number(preset)
  return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: now.toISOString() }
}

// A custom range must run forwards and cover at most a year.
export function rangeValid(from: string, to: string): boolean {
  const a = new Date(from).getTime(), b = new Date(to).getTime()
  return Number.isFinite(a) && Number.isFinite(b) && b > a && b - a <= 366 * 86400000
}

// A date input gives "2026-11-05". Start at the beginning of that day and end at the end of the other, in the viewer's time zone.
export function dayRange(fromDay: string, toDay: string): { from: string; to: string } | null {
  const a = new Date(fromDay + 'T00:00:00'), b = new Date(toDay + 'T23:59:59.999')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return { from: a.toISOString(), to: b.toISOString() }
}

// ---------------------------------------------------------------- messages
// Our own database messages are plain sentences and pass through. Anything else is hidden behind a generic line.
export function friendlyTrustError(message: string | null | undefined): string {
  const m = (message ?? '').trim()
  if (!m) return 'Something went wrong. Please try again.'
  const own = /^(Only an administrator|You do not have the role|You cannot act|Case not found|This case|Choose |Write |A reason|Alert not found|A case needs|An investigation|Another open case|Only a closed|Only a super|Invalid |Listing not found)/i
  return own.test(m) ? m : 'Something went wrong. Please try again.'
                            }
