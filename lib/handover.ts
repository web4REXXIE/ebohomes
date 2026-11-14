// Pure helpers (safe for client and server). No imports.
export type PayoutState = 'on_hold' | 'ready' | 'in_progress' | 'released'
// 'none' = the tenant has not confirmed yet. 'running' = inside the 48 hours. 'passed' = payout may go ahead.
export type WindowState = 'none' | 'running' | 'passed'

// Display only. The real rule lives in the database (eb_handover_window), so this number must match it.
export const HANDOVER_WINDOW_HOURS = 48

export const PAYOUT_STATE_TEXT: Record<PayoutState, string> = {
  on_hold: 'The landlord payout is on hold',
  ready: `The ${HANDOVER_WINDOW_HOURS}-hour window passed with no problem raised. EboHomes can now process the landlord payout`,
  in_progress: 'EboHomes is processing the landlord payout',
  released: 'The landlord payout has been sent',
}

export function validateAction(action: unknown, note: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (action !== 'confirm' && action !== 'dispute') return { ok: false, error: 'Unknown action.' }
  const n = typeof note === 'string' ? note.trim() : ''
  if (n.length > 500) return { ok: false, error: 'Keep the note under 500 characters.' }
  if (action === 'dispute' && n.length < 10) return { ok: false, error: 'Tell EboHomes what is wrong (at least 10 characters).' }
  return { ok: true, note: n || null }
}

export function validateResolve(outcome: unknown, note: unknown): { ok: true; note: string } | { ok: false; error: string } {
  if (outcome !== 'reset' && outcome !== 'admin_completed') return { ok: false, error: 'Choose an outcome.' }
  const n = typeof note === 'string' ? note.trim() : ''
  if (n.length > 1000) return { ok: false, error: 'Keep the note under 1000 characters.' }
  if (outcome === 'reset' && n.length < 10) return { ok: false, error: 'Write a clear explanation (at least 10 characters).' }
  if (outcome === 'admin_completed' && n.length < 20) return { ok: false, error: 'Completing a handover after review needs a detailed note (at least 20 characters).' }
  return { ok: true, note: n }
}

// One line that says where the handover stands for this person.
// Pass the role to get wording that matches the 48-hour rule (the landlord's tap never holds up the payout).
// Without a role the older, role-neutral wording is used.
export function partyState(status: string, mine: string | null, other: string | null, role?: 'tenant' | 'landlord'): string {
  if (status === 'disputed') return 'Disputed, under EboHomes review'
  if (status === 'completed') return 'Both confirmed'
  if (role === 'tenant') {
    if (mine && !other) return 'You confirmed. The 48-hour window to raise a problem has started'
    if (!mine && other) return 'The landlord confirmed. Waiting for you'
    return 'Waiting for you to confirm you have the keys'
  }
  if (role === 'landlord') {
    if (other && !mine) return 'The tenant confirmed. Your own confirmation is optional'
    if (mine && !other) return 'You confirmed. Waiting for the tenant'
    return 'Waiting for the tenant to confirm they have the keys'
  }
  if (mine && !other) return 'You confirmed. Waiting for the other party'
  if (!mine && other) return 'The other party confirmed. Waiting for you'
  return 'Waiting for both of you'
}

export function adminState(state: string, tenantAt: string | null, landlordAt: string | null, windowState?: WindowState): string {
  if (state === 'disputed') return 'Disputed, payout on hold'
  if (state === 'completed') return windowState === 'running' ? 'Both confirmed. Window open' : 'Completed'
  if (tenantAt) return windowState === 'passed' ? 'Window passed. Ready for payout review' : 'Tenant confirmed. Window open'
  if (landlordAt) return 'Waiting for the tenant'
  return 'Waiting for both'
}

export type EligibilityInput = {
  state: string
  window_state?: string | null
  payout_eligible_at?: string | null
  completed_via?: string | null
}

// The three lines the admin sees: "Payout eligible from", "Reason", "Status". Null when there is nothing to say yet.
export function eligibilityNote(s: EligibilityInput): { from: string; reason: string; status: string } | null {
  if (s.state === 'disputed' || !s.payout_eligible_at) return null
  if (s.completed_via === 'admin_review') {
    return { from: s.payout_eligible_at, reason: 'EboHomes completed the handover after reviewing a dispute', status: 'Ready for admin review' }
  }
  if (s.window_state === 'passed') {
    return { from: s.payout_eligible_at, reason: `Tenant confirmed the handover and no problem was raised in ${HANDOVER_WINDOW_HOURS} hours`, status: 'Ready for admin review' }
  }
  return { from: s.payout_eligible_at, reason: `Tenant confirmed the handover. The ${HANDOVER_WINDOW_HOURS}-hour window to raise a problem is still open`, status: 'Not yet. Window open' }
}

// Who may still raise a problem. A payout that was already sent, or a case EboHomes already reviewed, goes to support instead.
export function canRaiseProblem(h: { eligible?: boolean; status?: string; payout_state?: string; completed_via?: string | null }): boolean {
  return !!h.eligible && h.status !== 'disputed' && h.payout_state !== 'released' && h.completed_via !== 'admin_review'
}
