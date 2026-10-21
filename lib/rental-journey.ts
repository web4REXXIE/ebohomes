// Pure helpers for the tenant rental journey. Everything is DERIVED from records that already exist
// (applications, viewings, tenancies, rental_terms). Nothing is stored, no status is invented and nothing is
// marked complete because a page was viewed. The only import is the existing viewing wording.

import { OPEN_STATUSES, viewingLabel, type Tone, type ViewingLike } from '@/lib/viewing-status'

export type StepKey = 'application' | 'decision' | 'viewing' | 'setup' | 'active'
export const STEP_ORDER: StepKey[] = ['application', 'decision', 'viewing', 'setup', 'active']

// done = finished, current = where the tenant is, upcoming = not reached yet, stopped = closed (declined / withdrawn).
export type StepState = 'done' | 'current' | 'upcoming' | 'stopped'

export type JourneyApp = { status: string; tenant_interest_at?: string | null }
export type JourneyViewing = ViewingLike & { id: string }
export type JourneyTenancy = { id: string; status?: string | null }
// Pass only the LIVE terms (status proposed, accepted or signed), exactly like the tenancy page does.
export type JourneyTerms = { status: string; tenant_accepted_at?: string | null; landlord_accepted_at?: string | null }

export type JourneyInput = {
  app: JourneyApp
  viewings: JourneyViewing[]
  tenancy: JourneyTenancy | null
  terms: JourneyTerms | null
}

export type Phase =
  | 'withdrawn' | 'rejected' | 'unknown' | 'under_review' | 'info_requested'
  | 'v_none' | 'v_waiting' | 'v_proposed' | 'v_scheduled' | 'v_decide' | 'v_confirm' | 'v_declined' | 'v_retry'
  | 'awaiting_tenancy'
  | 'terms_none' | 'terms_review' | 'terms_waiting_landlord' | 'terms_accepted' | 'terms_signed'
  | 'active' | 'ended'

export type JourneyStep = {
  key: StepKey
  number: string
  title: string
  state: StepState
  label: string
  tone: Tone
  needsYou: boolean
  blurb: string
}

export type Journey = {
  phase: Phase
  currentKey: StepKey
  steps: JourneyStep[]
  viewing: JourneyViewing | null
}

const ENDED = ['ended', 'terminated', 'cancelled', 'expired']

export const STEP_TITLE: Record<StepKey, string> = {
  application: 'Application',
  decision: 'EboHomes Decision',
  viewing: 'Viewing & Confirmation',
  setup: 'Tenancy Setup',
  active: 'Active Tenancy',
}

export const STEP_BLURB: Record<StepKey, string> = {
  application: 'The property you applied for and the details of your application.',
  decision: 'EboHomes reviews your application and makes the decision. The landlord may give a recommendation, but EboHomes decides.',
  viewing: 'See the property in person, then tell EboHomes that you want to proceed.',
  setup: 'The landlord sets up your tenancy. You review and accept the rental terms, then the signed agreement is recorded.',
  active: 'Your tenancy is running. Rent, payments, receipts and records are here.',
}

// Prefer a non-ended tenancy. The caller passes tenancies for ONE application.
export function pickTenancy<T extends JourneyTenancy>(list: T[]): T | null {
  return list.find((t) => !ENDED.includes(t.status ?? '')) ?? list[0] ?? null
}

// The viewing that matters now: an open one, else one the tenant is interested in, else the newest (input is newest first).
export function pickViewing<T extends JourneyViewing>(list: T[]): T | null {
  const open = list.find((v) => OPEN_STATUSES.includes(v.status))
  if (open) return open
  return list.find((v) => v.status === 'completed' && v.tenant_decision === 'interested') ?? list[0] ?? null
}

export function computePhase(inp: JourneyInput): Phase {
  const { app, tenancy, terms } = inp
  if (tenancy) {
    const s = tenancy.status ?? ''
    if (ENDED.includes(s)) return 'ended'
    if (s === 'active') return 'active'
    if (!terms) return 'terms_none'
    if (terms.status === 'proposed') return terms.tenant_accepted_at ? 'terms_waiting_landlord' : 'terms_review'
    if (terms.status === 'accepted') return 'terms_accepted'
    if (terms.status === 'signed') return 'terms_signed'
    return 'terms_none'
  }
  if (app.status === 'withdrawn') return 'withdrawn'
  if (app.status === 'rejected') return 'rejected'
  if (app.status === 'info_requested') return 'info_requested'
  if (app.status === 'pending') return 'under_review'
  if (app.status !== 'approved') return 'unknown'

  if (app.tenant_interest_at) return 'awaiting_tenancy'
  const v = pickViewing(inp.viewings)
  if (!v) return 'v_none'
  switch (v.status) {
    case 'requested':
    case 'approved': return 'v_waiting'
    case 'reschedule_proposed': return 'v_proposed'
    case 'scheduled': return 'v_scheduled'
    case 'completed':
      if (v.tenant_decision === 'interested') return 'v_confirm'
      if (v.tenant_decision === 'not_interested') return 'v_declined'
      return 'v_decide'
    case 'no_show':
    case 'cancelled':
    case 'rejected': return 'v_retry'
    default: return 'v_none'
  }
}

// Index (0-based) of the step the tenant is currently on.
function currentIndex(p: Phase): number {
  switch (p) {
    case 'withdrawn': return 0
    case 'rejected':
    case 'unknown':
    case 'under_review':
    case 'info_requested': return 1
    case 'v_none': case 'v_waiting': case 'v_proposed': case 'v_scheduled':
    case 'v_decide': case 'v_confirm': case 'v_declined': case 'v_retry': return 2
    case 'awaiting_tenancy': case 'terms_none': case 'terms_review':
    case 'terms_waiting_landlord': case 'terms_accepted': case 'terms_signed': return 3
    case 'active':
    case 'ended': return 4
  }
}

const NEEDS_YOU: Phase[] = ['info_requested', 'v_none', 'v_proposed', 'v_decide', 'v_confirm', 'v_retry', 'terms_review']

// Label for the Viewing step while it is NOT the current step (for example a viewing requested during review).
function sideViewingLabel(v: JourneyViewing | null): string {
  if (!v) return 'Not started'
  if (v.status === 'completed' && v.tenant_decision === 'interested') return 'You want to proceed'
  if (v.status === 'completed' && v.tenant_decision === 'not_interested') return 'Not continuing'
  return viewingLabel(v.status)
}

function stepLabel(key: StepKey, phase: Phase, state: StepState, v: JourneyViewing | null, app: JourneyApp): { label: string; tone: Tone } {
  switch (key) {
    case 'application':
      return phase === 'withdrawn' ? { label: 'Withdrawn', tone: 'grey' } : { label: 'Submitted', tone: 'green' }
    case 'decision':
      if (state === 'done') return { label: 'Approved', tone: 'green' }
      if (phase === 'rejected') return { label: 'Not approved', tone: 'red' }
      if (phase === 'info_requested') return { label: 'More information needed', tone: 'amber' }
      if (phase === 'under_review') return { label: 'Awaiting decision', tone: 'amber' }
      if (phase === 'unknown') return { label: 'Status not recognised', tone: 'grey' }
      return { label: 'Unavailable', tone: 'grey' }
    case 'viewing': {
      if (state === 'done') return { label: app.tenant_interest_at ? 'Confirmed to proceed' : 'Tenancy created', tone: 'green' }
      if (state === 'current') {
        const tone: Tone = phase === 'v_scheduled' ? 'green' : phase === 'v_proposed' ? 'blue' : phase === 'v_declined' ? 'grey' : phase === 'v_retry' ? 'red' : 'amber'
        const label =
          phase === 'v_none' ? 'Viewing not started'
          : phase === 'v_decide' ? 'Your decision needed'
          : phase === 'v_confirm' ? 'Confirmation needed'
          : phase === 'v_declined' ? 'Not continuing'
          : viewingLabel(v?.status)
        return { label, tone }
      }
      if (phase === 'withdrawn' || phase === 'rejected') return { label: 'Unavailable', tone: 'grey' }
      return { label: sideViewingLabel(v), tone: v ? 'blue' : 'grey' }
    }
    case 'setup': {
      if (state === 'done') return { label: 'Complete', tone: 'green' }
      if (state === 'upcoming') return { label: phase === 'withdrawn' || phase === 'rejected' ? 'Unavailable' : 'Not started', tone: 'grey' }
      switch (phase) {
        case 'awaiting_tenancy': return { label: 'Landlord setting up', tone: 'amber' }
        case 'terms_none': return { label: 'Terms being prepared', tone: 'amber' }
        case 'terms_review': return { label: 'Review your terms', tone: 'amber' }
        case 'terms_waiting_landlord': return { label: 'Waiting for landlord', tone: 'amber' }
        case 'terms_accepted': return { label: 'Agreement being recorded', tone: 'amber' }
        case 'terms_signed': return { label: 'Agreement recorded', tone: 'green' }
        default: return { label: 'In progress', tone: 'blue' }
      }
    }
    case 'active':
      if (phase === 'active') return { label: 'Tenancy active', tone: 'green' }
      if (phase === 'ended') return { label: 'Tenancy ended', tone: 'grey' }
      return { label: phase === 'withdrawn' || phase === 'rejected' ? 'Unavailable' : 'Not started', tone: 'grey' }
  }
}

export function buildJourney(inp: JourneyInput): Journey {
  const phase = computePhase(inp)
  const cur = currentIndex(phase)
  const v = pickViewing(inp.viewings)
  const closed = phase === 'withdrawn' || phase === 'rejected'
  const steps = STEP_ORDER.map((key, i): JourneyStep => {
    const state: StepState = i < cur ? 'done' : i === cur ? (closed ? 'stopped' : 'current') : 'upcoming'
    const { label, tone } = stepLabel(key, phase, state, v, inp.app)
    const needsYou = NEEDS_YOU.includes(phase) && i === cur
    return { key, number: String(i + 1).padStart(2, '0'), title: STEP_TITLE[key], state, label, tone, needsYou, blurb: STEP_BLURB[key] }
  })
  return { phase, currentKey: STEP_ORDER[cur], steps, viewing: v }
}

// Why a step cannot be used yet. Shown when the tenant opens an upcoming step.
export function lockedReason(journey: Journey, key: StepKey): string | null {
  const step = journey.steps.find((s) => s.key === key)
  if (!step || step.state !== 'upcoming') return null
  const closed = journey.phase === 'withdrawn' || journey.phase === 'rejected'
  if (closed) return 'This application is closed, so this step will not happen. No tenancy will be set up from it.'
  switch (key) {
    case 'viewing':
      return 'You can request a viewing while your application is open. Confirming that you want to proceed opens only after EboHomes approves your application.'
    case 'setup':
      return 'Tenancy setup starts after EboHomes approves your application and you confirm that you want to proceed. The landlord then creates your tenancy.'
    case 'active':
      return 'Your tenancy is shown as active only when its status is active. Until then, this stage stays locked.'
    default:
      return null
  }
}

export type PanelCta = { label: string; step?: StepKey; href?: string }
export type StatusPanelData = {
  tone: Tone
  heading: string
  happened: string
  means: string
  next: string
  action: string
  needsYou: boolean
  cta: PanelCta | null
}

export type PanelCtx = {
  submittedOn?: string | null
  decidedOn?: string | null
  interestOn?: string | null
  viewingWhen?: string | null
  viewingStatus?: string | null
  tenancyId?: string | null
  tenancyStatus?: string | null
  listingId?: string | null
  listingOpen?: boolean
  appStatus?: string | null
  // True when the tenant has an open renewal offer (renewals.status = 'offered').
  renewalOffered?: boolean
}

const on = (d?: string | null) => (d ? ` on ${d}` : '')

export function statusPanel(phase: Phase, c: PanelCtx): StatusPanelData {
  const none = 'Nothing is required from you right now.'
  const apply: PanelCta | null = c.listingOpen && c.listingId ? { label: 'Apply for this property again', href: `/journey/apply/${c.listingId}` } : { label: 'Browse other properties', href: '/search' }
  switch (phase) {
    case 'withdrawn':
      return { tone: 'grey', needsYou: false, heading: 'Application withdrawn', happened: 'You withdrew this application.', means: 'It is closed. No tenancy will be set up and nothing was charged.', next: 'You can apply again if you change your mind and the property is still listed.', action: 'Nothing to do.', cta: apply }
    case 'rejected':
      return { tone: 'red', needsYou: false, heading: 'EboHomes did not approve this application', happened: `EboHomes reviewed your application${on(c.decidedOn)} and did not approve it.`, means: 'The application is closed. No payment was taken and no tenancy will be created from it.', next: 'Read EboHomes’ note below if one was given. You can apply again or look at other properties.', action: 'Nothing to do on this application.', cta: apply }
    case 'unknown':
      return { tone: 'grey', needsYou: false, heading: 'We cannot tell where this application is', happened: `Its saved status is “${c.appStatus ?? 'unknown'}”.`, means: 'We do not recognise this status, so we are not guessing what happens next.', next: 'Contact EboHomes and quote your application reference.', action: 'Contact EboHomes if you need help.', cta: { label: 'Contact EboHomes', href: '/contact' } }
    case 'under_review':
      return { tone: 'amber', needsYou: false, heading: 'EboHomes is reviewing your application', happened: `You submitted your application${on(c.submittedOn)}.`, means: 'EboHomes decides every application. Nothing is approved yet and you do not need to pay anything.', next: 'EboHomes will approve it, ask you a question or decline it. This page updates when that happens.', action: `${none} You can request a viewing while you wait.`, cta: null }
    case 'info_requested':
      return { tone: 'amber', needsYou: true, heading: 'EboHomes needs more information', happened: 'EboHomes asked you a question about your application.', means: 'Your application is paused until you answer.', next: 'Send your answer. EboHomes then reviews your application again.', action: 'Answer EboHomes’ question.', cta: { label: 'Answer EboHomes’ question', step: 'decision' } }
    case 'v_none':
      return { tone: 'amber', needsYou: true, heading: 'Approved. Next, see the property in person', happened: `EboHomes approved your application${on(c.decidedOn)}.`, means: 'Approval is not a tenancy. The property is not reserved and nothing has been paid.', next: 'Request a viewing, visit the property, then confirm that you want to proceed.', action: 'Request a viewing. If you have already seen the property, you can confirm below.', cta: { label: 'Request a viewing', href: '/viewings' } }
    case 'v_waiting':
      return { tone: 'amber', needsYou: false, heading: 'Waiting for EboHomes to arrange your viewing', happened: 'You asked to view the property.', means: c.viewingStatus === 'approved' ? 'EboHomes approved your request but has not chosen a date and time yet.' : 'EboHomes has not confirmed your appointment yet.', next: 'EboHomes will confirm the appointment on your Viewings page and will call you.', action: `${none} Keep your phone available.`, cta: null }
    case 'v_proposed':
      return { tone: 'blue', needsYou: true, heading: 'EboHomes proposed a new viewing time', happened: 'EboHomes proposed a different time for your viewing.', means: 'The viewing is not scheduled until you accept.', next: 'Accept the proposed time, or decline it so EboHomes can offer another.', action: 'Accept or decline the proposed time.', cta: { label: 'Reply to the proposed time', step: 'viewing' } }
    case 'v_scheduled':
      return { tone: 'green', needsYou: false, heading: 'Your viewing is scheduled', happened: `EboHomes confirmed your appointment${c.viewingWhen ? ` for ${c.viewingWhen}` : ''}.`, means: 'Keep your phone available so EboHomes can coordinate your visit.', next: 'Attend the viewing. Afterwards, tell EboHomes whether you want to continue.', action: 'Attend your viewing.', cta: { label: 'See viewing details', step: 'viewing' } }
    case 'v_decide':
      return { tone: 'blue', needsYou: true, heading: 'Viewing completed. Do you want to continue?', happened: 'EboHomes recorded your viewing as completed.', means: 'Your choice is recorded. It does not reserve the property or charge you.', next: 'Say whether you want to rent this property.', action: 'Choose “I’m interested” or “I’m no longer interested”.', cta: { label: 'Make your choice', step: 'viewing' } }
    case 'v_confirm':
      return { tone: 'amber', needsYou: true, heading: 'One more step: confirm that you want to proceed', happened: 'You told EboHomes you are interested after your viewing.', means: 'Your application is approved, but your confirmation is not recorded on the application yet.', next: 'Confirm below so the landlord can set up your tenancy. Nothing is charged.', action: 'Confirm that you want to proceed.', cta: { label: 'Confirm and proceed', step: 'viewing' } }
    case 'v_declined':
      return { tone: 'grey', needsYou: false, heading: 'You chose not to continue with this property', happened: 'You told EboHomes you are no longer interested after your viewing.', means: 'Nothing more will happen on this application unless you act.', next: 'If you change your mind, request another viewing or contact EboHomes.', action: 'Nothing to do unless you change your mind.', cta: { label: 'Request another viewing', href: '/viewings' } }
    case 'v_retry':
      return { tone: 'red', needsYou: true, heading: 'Your last viewing did not go ahead', happened: 'Your last viewing was cancelled, missed or not approved.', means: 'You have not seen the property through EboHomes yet. Nothing is reserved.', next: 'Request a new viewing if you still want to see the property.', action: 'Request a new viewing.', cta: { label: 'Request a viewing', href: '/viewings' } }
    case 'awaiting_tenancy':
      return { tone: 'amber', needsYou: false, heading: 'Your tenancy is being set up', happened: `You confirmed${on(c.interestOn)} that you want to proceed.`, means: 'The landlord now creates your tenancy and proposes the rental terms. Nothing is reserved or charged yet.', next: 'You will be notified, and your tenancy will appear here.', action: none, cta: null }
    case 'terms_none':
      return { tone: 'amber', needsYou: false, heading: 'Your rental terms are being prepared', happened: 'Your tenancy record has been created.', means: 'The landlord proposes the rent, deposit, fees and dates. You will be asked to accept them.', next: 'Wait for the landlord’s proposal. You will be notified.', action: none, cta: c.tenancyId ? { label: 'Open tenancy details', href: `/tenancies/${c.tenancyId}` } : null }
    case 'terms_review':
      return { tone: 'amber', needsYou: true, heading: 'Review and accept your rental terms', happened: 'The landlord proposed rental terms for your tenancy.', means: 'Check the rent, deposit, fees and dates. Accept them only if they are right.', next: 'Accept or decline the terms.', action: 'Accept or decline the proposed terms.', cta: { label: 'Review rental terms', step: 'setup' } }
    case 'terms_waiting_landlord':
      return { tone: 'amber', needsYou: false, heading: 'Waiting for the landlord to accept', happened: 'You accepted the proposed terms.', means: 'Both sides must accept before the agreement can be recorded.', next: 'Nothing more to do now.', action: none, cta: { label: 'See the rental terms', step: 'setup' } }
    case 'terms_accepted':
      return { tone: 'amber', needsYou: false, heading: 'Terms accepted. The signed agreement is being recorded', happened: 'You and the landlord both accepted the terms.', means: 'EboHomes records the signed agreement once it has seen it. This page does not replace the signed document.', next: 'Wait for EboHomes to record the signed agreement.', action: none, cta: { label: 'See the rental terms', step: 'setup' } }
    case 'terms_signed':
      return { tone: 'green', needsYou: false, heading: 'Your agreement is recorded', happened: 'EboHomes recorded your signed agreement.', means: 'Payments are based on the agreed figures. Your tenancy shows as active only when its status becomes active.', next: 'Use the payment section when a payment is due. Open tenancy details for handover and records.', action: 'Pay what is due, if anything, in the payment section.', cta: { label: 'See agreement and payments', step: 'setup' } }
    case 'active':
      if (c.renewalOffered)
        return { tone: 'amber', needsYou: true, heading: 'Your tenancy is active. You have a renewal offer', happened: 'The landlord sent you a renewal offer.', means: 'Responding records your decision only. No payment is taken.', next: 'Open My Tenancies to accept or decline the offer.', action: 'Respond to the renewal offer.', cta: { label: 'Respond to renewal offer', href: '/tenancies' } }
      return { tone: 'green', needsYou: false, heading: 'Your tenancy is active', happened: 'Your tenancy status is active.', means: 'Your agreed rent, payments, receipts and records are kept here and in your tenancy details.', next: 'Pay rent when it is due and keep your receipts. Handover, repairs, disputes and deposit are in tenancy details.', action: 'Nothing is required unless a payment is due.', cta: c.tenancyId ? { label: 'Open tenancy details', href: `/tenancies/${c.tenancyId}` } : null }
    case 'ended':
      return { tone: 'grey', needsYou: false, heading: `This tenancy is ${c.tenancyStatus ?? 'ended'}`, happened: `Its saved status is “${c.tenancyStatus ?? 'ended'}”.`, means: 'The tenancy is no longer running. Your payment records and receipts stay available.', next: 'Open tenancy details for records, handover and deposit information.', action: 'Nothing is required unless EboHomes contacts you.', cta: c.tenancyId ? { label: 'Open tenancy details', href: `/tenancies/${c.tenancyId}` } : null }
  }
}