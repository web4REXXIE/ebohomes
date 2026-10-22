// Pure helpers (safe for client and server). No imports.
export type PayoutState = 'on_hold' | 'ready' | 'in_progress' | 'released'

export const PAYOUT_STATE_TEXT: Record<PayoutState, string> = {
  on_hold: 'The landlord payout is on hold',
  ready: 'The handover is complete. EboHomes can now process the landlord payout',
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

export function partyState(status: string, mine: string | null, other: string | null): string {
  if (status === 'disputed') return 'Disputed, under EboHomes review'
  if (status === 'completed') return 'Both confirmed'
  if (mine && !other) return 'You confirmed. Waiting for the other party'
  if (!mine && other) return 'The other party confirmed. Waiting for you'
  return 'Waiting for both of you'
}

export function adminState(state: string, tenantAt: string | null, landlordAt: string | null): string {
  if (state === 'disputed') return 'Disputed, payout on hold'
  if (state === 'completed') return 'Both confirmed'
  if (tenantAt && !landlordAt) return 'Waiting for the landlord'
  if (landlordAt && !tenantAt) return 'Waiting for the tenant'
  return 'Waiting for both'
}