// Pure helpers for the tenancy record page. No imports, so the page and the tests share one source of truth.

export type RecordRole = 'tenant' | 'landlord' | 'admin'
export type Tone = 'done' | 'warn' | 'bad' | 'neutral'

export type RecordPayment = {
  id: string; type: string; amount: number; status: string
  submitted_at: string | null; verified_at: string | null; confirmed_at: string | null; receipt_code: string | null
}
export type RecordHandover = {
  status: string; tenant_confirmed_at: string | null; landlord_confirmed_at: string | null
  disputed_at: string | null; disputed_role: string | null; completed_at: string | null; completed_via: string | null
}
export type RecordPayout = {
  id: string; status: string; amount: number; payout_code: string | null
  created_at: string | null; paid_at: string | null; landlord_responded_at: string | null
}
export type RecordRenewal = {
  id: string; status: string; new_rent: number; new_end_date: string | null
  created_at: string | null; responded_at: string | null; applied: boolean
}
export type RecordTerms = {
  rent_amount: number; deposit_amount: number; fees_amount: number; payment_schedule: string | null
  notice_days: number | null; house_rules: string | null; signed_reference: string | null; signed_at: string | null
}
export type PayoutState = 'not_ready' | 'on_hold' | 'ready' | 'in_progress' | 'released'

export type TenancyRecord = {
  found: true
  role: RecordRole
  tenancy: { id: string; code: string | null; status: string | null; start_date: string | null; end_date: string | null; rent_amount: number | null; rent_period: string | null; created_at: string | null }
  property: { title: string | null; location: string | null }
  tenant_name: string | null
  landlord_name: string | null
  terms: RecordTerms | null
  terms_status: string | null
  payments: RecordPayment[]
  handover: RecordHandover | null
  payout_state: PayoutState
  hold_reason: string | null
  payouts: RecordPayout[]
  renewals: RecordRenewal[]
}

export function isRecord(d: unknown): d is TenancyRecord {
  const r = d as any
  return !!r && r.found === true && ['tenant', 'landlord', 'admin'].includes(r.role) && !!r.tenancy && typeof r.tenancy.id === 'string'
    && Array.isArray(r.payments) && Array.isArray(r.payouts) && Array.isArray(r.renewals)
}

export function money(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return 'n/a'
  const v = Number(n)
  return Number.isFinite(v) ? '\u20A6' + v.toLocaleString('en-NG', { maximumFractionDigits: 2 }) : 'n/a'
}

export const TYPE_NAME: Record<string, string> = { rent: 'Rent', deposit: 'Deposit', fees: 'Fees', fee: 'Fees', other: 'Other' }
export const typeName = (t: string) => TYPE_NAME[t] ?? 'Payment'

const SUB_LABEL: Record<string, string> = {
  submitted: 'Proof sent, awaiting review', under_review: 'Being reviewed by EboHomes',
  needs_info: 'EboHomes needs a correction', rejected: 'Not accepted', verified: 'Verified by EboHomes',
}
export function paymentLabel(p: Pick<RecordPayment, 'status' | 'confirmed_at'>): string {
  if (p.status === 'verified' && p.confirmed_at) return 'Verified and confirmed'
  return SUB_LABEL[p.status] ?? 'Unknown'
}

export type Chip = { key: string; label: string; value: string; tone: Tone }

export function paymentChip(payments: RecordPayment[], role: RecordRole): Chip {
  const label = 'Payment'
  const verified = payments.filter((p) => p.status === 'verified')
  if (verified.some((p) => p.confirmed_at)) return { key: 'payment', label, value: 'Verified and confirmed', tone: 'done' }
  if (verified.length) {
    return role === 'tenant'
      ? { key: 'payment', label, value: 'Verified. Confirm it with your code', tone: 'warn' }
      : { key: 'payment', label, value: 'Verified by EboHomes', tone: 'done' }
  }
  if (payments.some((p) => p.status === 'needs_info' || p.status === 'rejected')) return { key: 'payment', label, value: 'Needs a correction', tone: 'bad' }
  if (payments.some((p) => p.status === 'submitted' || p.status === 'under_review')) return { key: 'payment', label, value: 'Proof under review', tone: 'warn' }
  return { key: 'payment', label, value: role === 'tenant' ? 'No payment sent yet' : 'No verified payment yet', tone: 'neutral' }
}

export function handoverChip(h: RecordHandover | null, role: RecordRole, hasVerifiedPayment: boolean): Chip {
  const label = 'Key handover'
  if (!h) {
    return hasVerifiedPayment
      ? { key: 'handover', label, value: 'Waiting for the tenant and the landlord to confirm', tone: 'warn' }
      : { key: 'handover', label, value: 'Opens after a verified payment', tone: 'neutral' }
  }
  if (h.status === 'disputed') return { key: 'handover', label, value: 'Disputed. EboHomes is reviewing', tone: 'bad' }
  if (h.status === 'completed') return { key: 'handover', label, value: h.completed_via === 'admin_review' ? 'Completed after EboHomes review' : 'Completed by both parties', tone: 'done' }
  const t = !!h.tenant_confirmed_at, l = !!h.landlord_confirmed_at
  if (t && l) return { key: 'handover', label, value: 'Both confirmed', tone: 'done' }
  if (!t && !l) return { key: 'handover', label, value: 'Waiting for the tenant and the landlord', tone: 'warn' }
  const waitingFor = t ? 'landlord' : 'tenant'
  if (role === waitingFor) return { key: 'handover', label, value: 'Waiting for you to confirm', tone: 'warn' }
  return { key: 'handover', label, value: `Waiting for the ${waitingFor}`, tone: 'warn' }
}

const PAYOUT_TEXT: Record<PayoutState, { value: string; tone: Tone }> = {
  not_ready: { value: 'Not started', tone: 'neutral' },
  on_hold: { value: 'On hold until the handover is complete', tone: 'warn' },
  ready: { value: 'Ready for EboHomes to prepare', tone: 'neutral' },
  in_progress: { value: 'Being processed by EboHomes', tone: 'warn' },
  released: { value: 'Sent to the landlord', tone: 'done' },
}
export function payoutChip(state: PayoutState): Chip {
  const x = PAYOUT_TEXT[state] ?? PAYOUT_TEXT.not_ready
  return { key: 'payout', label: 'Landlord payout', value: x.value, tone: x.tone }
}

export function agreementChip(terms: RecordTerms | null, termsStatus: string | null): Chip {
  if (terms) return { key: 'agreement', label: 'Agreement', value: 'Signed and recorded', tone: 'done' }
  if (termsStatus === 'accepted') return { key: 'agreement', label: 'Agreement', value: 'Accepted, waiting for EboHomes to record the signing', tone: 'warn' }
  if (termsStatus === 'proposed') return { key: 'agreement', label: 'Agreement', value: 'Terms proposed, not accepted yet', tone: 'warn' }
  return { key: 'agreement', label: 'Agreement', value: 'No agreement recorded yet', tone: 'neutral' }
}

export function summaryChips(r: TenancyRecord): Chip[] {
  const out = [
    agreementChip(r.terms, r.terms_status),
    paymentChip(r.payments, r.role),
    handoverChip(r.handover, r.role, r.payments.some((p) => p.status === 'verified')),
    payoutChip(r.payout_state),
  ]
  const open = r.renewals[0]
  if (open) {
    const v = open.applied ? 'Applied to the tenancy' : open.status === 'offered' ? 'Offer waiting for the tenant' : open.status === 'accepted' ? 'Accepted. Payment and verification pending' : open.status === 'declined' ? 'Declined' : 'In progress'
    out.push({ key: 'renewal', label: 'Renewal', value: v, tone: open.applied ? 'done' : open.status === 'declined' ? 'neutral' : 'warn' })
  }
  return out
}

export type TimelineItem = { key: string; at: string; title: string; tone: Tone }

export function buildTimeline(r: TenancyRecord): TimelineItem[] {
  const out: TimelineItem[] = []
  const add = (key: string, at: string | null | undefined, title: string, tone: Tone = 'done') => {
    if (!at || Number.isNaN(Date.parse(at))) return
    out.push({ key, at, title, tone })
  }
  const me = (role: 'tenant' | 'landlord') => (r.role === role ? 'You' : role === 'tenant' ? 'The tenant' : 'The landlord')
  const tenantWords = r.role === 'tenant'

  add('tenancy', r.tenancy.created_at, 'Tenancy created')
  if (r.terms) add('terms', r.terms.signed_at, 'Agreement signed and recorded by EboHomes')

  for (const p of r.payments) {
    const n = `${typeName(p.type).toLowerCase()} payment of ${money(p.amount)}`
    add(`ps-${p.id}`, p.submitted_at, tenantWords ? `You sent proof of your ${n}` : `The tenant sent proof of the ${n}`, 'neutral')
    if (p.status === 'verified') add(`pv-${p.id}`, p.verified_at, `EboHomes verified the ${n}`)
    if (p.confirmed_at) add(`pc-${p.id}`, p.confirmed_at, tenantWords ? `You confirmed the ${n} with your code` : `The tenant confirmed the ${n}`)
  }

  const h = r.handover
  if (h) {
    add('h-t', h.tenant_confirmed_at, `${me('tenant')} confirmed the key handover`)
    add('h-l', h.landlord_confirmed_at, `${me('landlord')} confirmed the key handover`)
    if (h.disputed_at) {
      const who = h.disputed_role === 'tenant' || h.disputed_role === 'landlord' ? me(h.disputed_role) : 'A party'
      add('h-d', h.disputed_at, `${who} raised a concern about the key handover`, 'bad')
    }
    if (h.status === 'completed') add('h-c', h.completed_at, h.completed_via === 'admin_review' ? 'Key handover completed after EboHomes review' : 'Key handover completed')
  }

  if (r.role !== 'tenant') {
    for (const q of r.payouts) {
      if (q.status === 'paid' || q.status === 'confirmed' || q.status === 'disputed') add(`po-${q.id}`, q.paid_at, `EboHomes sent a payout of ${money(q.amount)}`)
      if (q.status === 'confirmed') add(`pc2-${q.id}`, q.landlord_responded_at, r.role === 'landlord' ? 'You confirmed you received the payout' : 'The landlord confirmed receiving the payout')
      if (q.status === 'disputed') add(`pd-${q.id}`, q.landlord_responded_at, r.role === 'landlord' ? 'You raised a problem with the payout' : 'The landlord raised a problem with the payout', 'bad')
    }
  }

  for (const n of r.renewals) {
    add(`rn-${n.id}`, n.created_at, `Renewal offered: ${money(n.new_rent)} rent`, 'neutral')
    if (n.status === 'accepted' || n.status === 'declined') add(`rr-${n.id}`, n.responded_at, n.status === 'accepted' ? 'Renewal accepted by the tenant' : 'Renewal declined by the tenant', n.status === 'accepted' ? 'done' : 'warn')
  }

  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.key.localeCompare(b.key))
}