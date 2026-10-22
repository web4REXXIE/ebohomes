// Pure helpers (safe for client and server). No imports.
export const COOLING_OFF_HOURS = 24
export type PayoutStatus = 'pending_review' | 'approved' | 'rejected' | 'cancelled'

export function normalizeAccountNumber(s: unknown): string {
  return typeof s === 'string' ? s.replace(/[\s-]/g, '') : ''
}
export function maskAccount(n: string): string {
  return '******' + n.slice(-4)
}

export type AccountInput = { bank_name: string; account_number: string; account_name: string }

export function validatePayoutAccount(i: { bank_name?: unknown; account_number?: unknown; account_name?: unknown }):
  { ok: true; value: AccountInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const bank = typeof i.bank_name === 'string' ? i.bank_name.trim() : ''
  const num = normalizeAccountNumber(i.account_number)
  const name = typeof i.account_name === 'string' ? i.account_name.trim().replace(/\s+/g, ' ') : ''
  if (bank.length < 2 || bank.length > 80) errors.bank_name = 'Enter the bank name.'
  if (!/^[0-9]{10}$/.test(num)) errors.account_number = 'The account number must be exactly 10 digits.'
  if (!/^[\p{L}][\p{L}\s.'-]{1,119}$/u.test(name)) errors.account_name = 'Enter the account name exactly as the bank shows it (letters only).'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { bank_name: bank, account_number: num, account_name: name } }
}

export type PayoutItem = {
  id: string; bank_name: string; masked: string; account_name: string; status: PayoutStatus
  requested_at: string; effective_at: string | null; review_note: string | null
}

export function itemLabel(it: Pick<PayoutItem, 'id' | 'status' | 'effective_at'>, currentId: string | null, nowMs: number): string {
  if (it.status === 'pending_review') return 'Waiting for EboHomes review'
  if (it.status === 'rejected') return 'Not approved'
  if (it.status === 'cancelled') return 'Cancelled'
  if (it.id === currentId) return 'Active'
  if (it.effective_at && new Date(it.effective_at).getTime() > nowMs) return 'Approved, starts after waiting period'
  return 'Replaced'
}

export function validatePayoutReview(
  action: unknown, note: unknown,
  attest: { identity_matches?: boolean; confirmed_with_landlord?: boolean } | null | undefined,
  ctx: { has_current: boolean; name_match: boolean },
): { ok: true; note: string | null } | { ok: false; error: string } {
  if (action !== 'approve' && action !== 'reject') return { ok: false, error: 'Unknown action.' }
  const n = typeof note === 'string' ? note.trim() : ''
  if (n.length > 1000) return { ok: false, error: 'Keep the note under 1000 characters.' }
  if (action === 'reject') {
    if (n.length < 5) return { ok: false, error: 'Write a clear reason for the landlord.' }
    return { ok: true, note: n }
  }
  if (!attest?.identity_matches) return { ok: false, error: 'Confirm the account name matches the landlord\'s verified identity.' }
  if (ctx.has_current && !attest?.confirmed_with_landlord) return { ok: false, error: 'Confirm the landlord approved this change through a separate trusted channel.' }
  if (!ctx.name_match && n.length < 10) return { ok: false, error: 'The account name does not match the profile name. Explain in the note.' }
  return { ok: true, note: n || null }
}