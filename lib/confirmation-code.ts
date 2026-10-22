// Pure helpers (safe for client and server). No imports.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 characters, no I or O
export const CODE_LENGTH = 8

export function normalizeCode(input: unknown): string {
  return typeof input === 'string' ? input.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}
export function isWellFormedCode(c: string): boolean {
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch))
}
export function formatCode(c: string): string {
  return c.slice(0, 4) + '-' + c.slice(4)
}

export type ConfirmState = 'awaiting_review' | 'needs_info' | 'closed' | 'code_pending' | 'code_sent' | 'code_expired' | 'locked' | 'confirmed'
export type StepState = 'done' | 'current' | 'todo' | 'bad'

export function progressSteps(state: ConfirmState): { key: string; label: string; state: StepState }[] {
  const L = ['Payment evidence submitted', 'EboHomes bank verification completed', 'Confirmation code sent', 'Tenant confirmation pending', 'Confirmation completed']
  const S: Record<ConfirmState, StepState[]> = {
    awaiting_review: ['done', 'current', 'todo', 'todo', 'todo'],
    needs_info: ['done', 'current', 'todo', 'todo', 'todo'],
    closed: ['done', 'bad', 'todo', 'todo', 'todo'],
    code_pending: ['done', 'done', 'current', 'todo', 'todo'],
    code_sent: ['done', 'done', 'done', 'current', 'todo'],
    code_expired: ['done', 'done', 'done', 'bad', 'todo'],
    locked: ['done', 'done', 'done', 'bad', 'todo'],
    confirmed: ['done', 'done', 'done', 'done', 'done'],
  }
  return L.map((label, i) => ({ key: String(i), label, state: S[state][i] }))
}

export const REASON_MESSAGE: Record<string, string> = {
  invalid: 'That code is not correct. Check the email and try again.',
  expired: 'This code has expired. Contact EboHomes support and ask for a new one.',
  locked: 'Too many incorrect attempts, so this code is locked. Contact EboHomes support for a new one.',
  already_used: 'This payment has already been confirmed.',
  not_found: 'We could not find a code for this payment.',
  no_code: 'No active code is available for this payment yet.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
}