// Pure rules for Tenant-Requested Remote Inspection screens (Phase 10.6, System B).
// No React and no Supabase, so it can be unit tested. The database is the real check. This file only
// decides wording, grouping and what to show. It never decides who is allowed to do something.
//
// This is NOT the old viewing request. A viewing is a visit by the tenant. A remote inspection is a visit by
// an EboHomes inspector, and the tenant receives a private report. It is free, so nothing here deals with
// money, prices or payment.

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'grey'

export type RequestRow = {
  id: string
  ref?: string | null
  listing_id: string
  title?: string | null
  location_text?: string | null
  status: string
  preferred_from?: string | null
  preferred_to?: string | null
  landlord_response?: string | null
  landlord_due_at?: string | null
  landlord_time?: string | null
  scheduled_for?: string | null
  report_ready?: boolean
  cancel_reason?: string | null
  created_at: string
}

// Statuses that still count as an open request. Same list as the unique index in the database.
export const CLOSED_STATUSES = ['completed', 'cancelled', 'expired', 'access_refused', 'closed']
export function isOpen(status: string): boolean {
  return !CLOSED_STATUSES.includes(status)
}

// A tenant may cancel up to the scheduled visit. The database enforces this too.
export const TENANT_CANCELLABLE = ['awaiting_landlord', 'awaiting_rescheduling', 'ready_for_assignment', 'offered', 'scheduled']
export const LANDLORD_ANSWERABLE = ['awaiting_landlord', 'awaiting_rescheduling']

export const REASON_MAX = 300
export const NOTE_MAX = 500

export const TONE_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  blue: 'bg-blue-50 text-blue-900 border-blue-300',
  amber: 'bg-amber-50 text-amber-900 border-amber-300',
  red: 'bg-red-50 text-red-900 border-red-300',
  grey: 'bg-slate-100 text-slate-800 border-slate-300',
}

const TENANT_LABEL: Record<string, string> = {
  awaiting_landlord: 'Waiting for the owner',
  awaiting_rescheduling: 'Needs a new time',
  ready_for_assignment: 'Finding an inspector',
  offered: 'Finding an inspector',
  scheduled: 'Inspection scheduled',
  in_review: 'Report being checked',
  completed: 'Report ready',
  cancelled: 'Cancelled',
  expired: 'Expired',
  access_refused: 'Access not given',
  closed: 'Closed',
}

const TENANT_TONE: Record<string, Tone> = {
  awaiting_landlord: 'amber',
  awaiting_rescheduling: 'amber',
  ready_for_assignment: 'blue',
  offered: 'blue',
  scheduled: 'green',
  in_review: 'blue',
  completed: 'green',
  cancelled: 'grey',
  expired: 'grey',
  access_refused: 'red',
  closed: 'grey',
}

export function statusLabel(status: string): string {
  return TENANT_LABEL[status] ?? status.replace(/_/g, ' ')
}

export function statusTone(status: string): Tone {
  return TENANT_TONE[status] ?? 'grey'
}

// One honest line about where things stand. Never says "confirmed" before it is scheduled.
// Never repeats the owner's own words to the tenant.
export function tenantLine(r: Pick<RequestRow, 'status' | 'scheduled_for' | 'report_ready'>, fmt: (iso: string | null | undefined) => string): string {
  switch (r.status) {
    case 'awaiting_landlord':
      return 'EboHomes asked the owner to allow access. No inspector is sent until the owner agrees.'
    case 'awaiting_rescheduling':
      return 'The owner has not answered yet. EboHomes will contact the owner again and update you here.'
    case 'ready_for_assignment':
      return 'The owner agreed to give access. EboHomes is choosing an inspector. This is not scheduled yet.'
    case 'offered':
      return 'EboHomes is waiting for an inspector to accept. This is not scheduled yet.'
    case 'scheduled':
      return r.scheduled_for ? `An inspector is booked for ${fmt(r.scheduled_for)}.` : 'An inspector is booked. EboHomes will confirm the time.'
    case 'in_review':
      return 'The inspector has finished. EboHomes is checking the report before you can read it.'
    case 'completed':
      return r.report_ready ? 'Your private report is ready.' : 'The inspection is complete. Your report will appear here.'
    case 'access_refused':
      return 'Access to the property could not be confirmed, so the inspection will not go ahead. You can still apply or look at other properties.'
    case 'expired':
      return 'The request expired before it could be arranged. You can ask again.'
    case 'cancelled':
      return 'You cancelled this request.'
    default:
      return 'This request is closed.'
  }
}

// Tenant list groups.
export type Group = 'action' | 'waiting' | 'scheduled' | 'past'
export const GROUP_ORDER: Group[] = ['action', 'scheduled', 'waiting', 'past']
export const GROUP_TITLE: Record<Group, string> = {
  action: 'Needs your attention',
  scheduled: 'Scheduled',
  waiting: 'In progress',
  past: 'Finished',
}

export function tenantGroup(r: Pick<RequestRow, 'status' | 'report_ready'>): Group {
  if (r.status === 'completed' && r.report_ready) return 'action'
  if (r.status === 'scheduled') return 'scheduled'
  if (isOpen(r.status)) return 'waiting'
  return 'past'
}

export function landlordGroup(r: Pick<RequestRow, 'status'>): Group {
  if (LANDLORD_ANSWERABLE.includes(r.status)) return 'action'
  if (r.status === 'scheduled') return 'scheduled'
  if (isOpen(r.status)) return 'waiting'
  return 'past'
}

export function landlordLabel(status: string): string {
  switch (status) {
    case 'awaiting_landlord':
      return 'Needs your answer'
    case 'awaiting_rescheduling':
      return 'Needs a new time'
    case 'ready_for_assignment':
    case 'offered':
      return 'Inspector being arranged'
    case 'scheduled':
      return 'Inspection scheduled'
    case 'in_review':
    case 'completed':
      return 'Inspection done'
    case 'access_refused':
      return 'Access declined'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
    default:
      return 'Closed'
  }
}

export function landlordTone(status: string): Tone {
  if (LANDLORD_ANSWERABLE.includes(status)) return 'amber'
  if (status === 'scheduled') return 'green'
  if (status === 'access_refused') return 'red'
  if (!isOpen(status) && status !== 'completed') return 'grey'
  return 'blue'
}

// The owner sees the property, the status and the time. Never the tenant, never any report.
export const LANDLORD_PRIVACY_NOTE =
  'This inspection is arranged by EboHomes for a prospective tenant. You will not see the tenant\'s name or the report. EboHomes tells you if anything needs your attention.'

// ---------------------------------------------------------------- the button on a property page
export type EntryInput = {
  listingId: string
  listingStatus: string | null | undefined
  signedIn: boolean
  isOwner: boolean
  onHold: boolean
  // The tenant's own request for THIS listing, if one is open.
  openRequest: { id: string; status: string } | null
}

export type Entry =
  | { kind: 'hidden' }
  | { kind: 'link'; label: string; href: string; line: string | null }
  | { kind: 'disabled'; label: string; line: string }

export function requestHref(listingId: string): string {
  return `/inspect/${listingId}`
}

// Rented, draft, suspended and every other non-approved status: no request. Same rule as the database.
export function decideEntry(i: EntryInput): Entry {
  if (i.isOwner) return { kind: 'hidden' }
  if (i.listingStatus === 'rented') return { kind: 'disabled', label: 'Inspection not available', line: 'This property has been rented.' }
  if (i.listingStatus !== 'approved' || i.onHold) {
    return { kind: 'disabled', label: 'Inspection not available', line: 'This property is not open for inspection requests right now.' }
  }
  if (!i.signedIn) {
    return { kind: 'link', label: 'Sign in to request an inspection', href: `/login?redirect=${encodeURIComponent(requestHref(i.listingId))}`, line: null }
  }
  if (i.openRequest) {
    return { kind: 'link', label: 'View my inspection request', href: '/inspections', line: `${statusLabel(i.openRequest.status)}.` }
  }
  return { kind: 'link', label: 'Request a remote inspection', href: requestHref(i.listingId), line: null }
}

// ---------------------------------------------------------------- form checks (mirror the database)
// "2026-10-20T14:30" from a datetime-local box. Returns null when empty or invalid.
export function localToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const DAY = 24 * 60 * 60 * 1000

// Preferred time is optional. Both or neither. Within 60 days. End after start, within 14 days of it.
export function checkPreferredWindow(fromLocal: string, toLocal: string, now: Date = new Date()): string | null {
  if (!fromLocal && !toLocal) return null
  if (!fromLocal || !toLocal) return 'Give both the start and the end of your preferred time, or leave both empty.'
  const from = localToIso(fromLocal)
  const to = localToIso(toLocal)
  if (!from || !to) return 'That date and time is not valid.'
  const f = new Date(from).getTime()
  const t = new Date(to).getTime()
  if (f < now.getTime() - 5 * 60 * 1000 || f > now.getTime() + 60 * DAY) return 'Choose a preferred time within the next 60 days.'
  if (t <= f || t > f + 14 * DAY) return 'The end of your preferred time must be after the start, and within 14 days of it.'
  return null
}

// Owner time: between 30 minutes and 30 days from now.
export function checkAccessTime(local: string, now: Date = new Date()): string | null {
  const iso = localToIso(local)
  if (!iso) return 'Choose a time when someone can let the inspector in.'
  const t = new Date(iso).getTime()
  if (t < now.getTime() + 30 * 60 * 1000 || t > now.getTime() + 30 * DAY) {
    return 'Choose a time between 30 minutes and 30 days from now when someone can let the inspector in.'
  }
  return null
}

export function checkReason(text: string, what: 'cancelling' | 'refusing'): string | null {
  const t = text.trim()
  if (!t) return what === 'cancelling' ? 'Tell us briefly why you are cancelling.' : 'Say briefly why access cannot be given. EboHomes keeps this on record.'
  if (t.length > REASON_MAX) return `Please keep this under ${REASON_MAX} characters.`
  return null
}

// Database errors are already written for people. Pass those through. Hide anything technical.
export function friendlyError(message: string | null | undefined): string {
  const m = (message ?? '').trim()
  if (!m) return 'Something went wrong. Please try again.'
  const technical = /relation|column|function|syntax|violates|permission denied|jwt|schema|pg_|uuid/i.test(m)
  return technical ? 'Something went wrong. Please try again.' : m
                      }

// ---------------------------------------------------------------- Step D: admin queue and inspector offers (pure helpers)
export type QueueRow = {
  id: string
  ref: string
  status: string
  title?: string | null
  location_text?: string | null
  landlord_time?: string | null
  landlord_note?: string | null
  ready_at?: string | null
  assign_due_at?: string | null
  escalated_at?: string | null
  offered_inspector?: string | null
  inspector_name?: string | null
  offer_due_at?: string | null
  scheduled_for?: string | null
}

export type Suggestion = {
  user_id: string
  name?: string | null
  areas?: string | null
  area_match: boolean
  workload: number
  approved_work: number
  declined_this: boolean
}

export const QUEUE_ORDER = ['ready_for_assignment', 'offered', 'scheduled', 'awaiting_rescheduling', 'awaiting_landlord']
export const QUEUE_TITLE: Record<string, string> = {
  ready_for_assignment: 'Needs an inspector',
  offered: 'Waiting for the inspector to answer',
  scheduled: 'Booked',
  awaiting_rescheduling: 'Waiting for a new time from the landlord',
  awaiting_landlord: 'Waiting for the landlord',
}

// "in 25 min", "in 3 h", "overdue by 40 min". Only wording; the database owns every deadline.
export function dueText(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.round((t - now.getTime()) / 60000)
  const abs = Math.abs(mins)
  const span = abs < 90 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`
  return mins >= 0 ? `in ${span}` : `overdue by ${span}`
}

export function isOverdue(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t < now.getTime()
}

export function checkAdminReason(text: string): string | null {
  const t = text.trim()
  if (t.length < 3) return 'Give a short reason.'
  if (t.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`
  return null
}

export function checkBudgetAmount(text: string): string | null {
  const n = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 'Enter an amount above zero.'
  if (n > 1_000_000_000) return 'That amount is too large.'
  return null
}

// Suggestion line shown to the admin. The admin still decides.
export function suggestionLine(s: Suggestion): string {
  const parts = [s.area_match ? 'Works in this area' : 'Area not matched', `${s.workload} open`, `${s.approved_work} approved before`]
  if (s.declined_this) parts.push('declined or missed this one')
  return parts.join(' · ')
}
