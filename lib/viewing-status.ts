// Pure helpers for the viewing workflow. No imports, so they can be unit tested directly.

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'grey'

export const OPEN_STATUSES = ['requested', 'approved', 'reschedule_proposed', 'scheduled']

const LABELS: Record<string, string> = {
  requested: 'Awaiting EboHomes response',
  approved: 'Approved — scheduling required',
  reschedule_proposed: 'New time proposed',
  scheduled: 'Appointment scheduled',
  completed: 'Viewing completed',
  no_show: 'Viewing missed',
  cancelled: 'Cancelled',
  rejected: 'Request not approved',
}

const TONES: Record<string, Tone> = {
  requested: 'amber',
  approved: 'amber',
  reschedule_proposed: 'blue',
  scheduled: 'green',
  completed: 'green',
  no_show: 'red',
  cancelled: 'red',
  rejected: 'red',
}

export function viewingLabel(status: string | null | undefined): string {
  return LABELS[status ?? ''] ?? (status ?? '').replace(/_/g, ' ')
}

export function viewingTone(status: string | null | undefined): Tone {
  return TONES[status ?? ''] ?? 'grey'
}

export const TONE_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  blue: 'bg-blue-50 text-blue-900 border-blue-300',
  amber: 'bg-amber-50 text-amber-900 border-amber-300',
  red: 'bg-red-50 text-red-900 border-red-300',
  grey: 'bg-slate-100 text-slate-800 border-slate-300',
}

// Nigerian mobile numbers. Mirrors eb_normalise_ng_phone in the database, which is the real check.
export function normaliseNgPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/[\s\-()]/g, '')
  if (/^\+234[789][01]\d{8}$/.test(d)) return d
  if (/^234[789][01]\d{8}$/.test(d)) return '+' + d
  if (/^0[789][01]\d{8}$/.test(d)) return '+234' + d.slice(1)
  return null
}

export type ViewingLike = {
  status: string
  scheduled_for?: string | null
  proposed_at?: string | null
  preferred_at?: string | null
  admin_response?: string | null
  tenant_decision?: string | null
}

// The tenant's application, when known. Optional so the helper still works from the viewing alone.
export type ApplicationLike = {
  status?: string | null
  tenant_interest_at?: string | null
}

export type Panel = {
  tone: Tone
  heading: string
  body: string
  next: string
  owner: 'tenant' | 'ebohomes' | 'none'
  href?: string
  cta?: string
}

// What the tenant sees after choosing "I'm interested", based on where the application really is.
function interestedPanel(app: ApplicationLike | undefined): Panel {
  if (app && app.status === 'approved' && app.tenant_interest_at) {
    return {
      tone: 'blue',
      heading: 'YOU WANT TO PROCEED — YOUR APPLICATION IS APPROVED',
      body: 'Your decision is recorded and your application is approved. The landlord now sets up your tenancy and rental terms. Nothing is reserved or charged yet.',
      next: 'Wait for your tenancy to be created. You will be notified, and it will appear under My Tenancy.',
      owner: 'none',
      href: '/tenancies',
      cta: 'Open My Tenancy',
    }
  }
  if (app && app.status === 'approved') {
    return {
      tone: 'amber',
      heading: 'ONE MORE STEP — CONFIRM YOU WANT TO PROCEED',
      body: 'Your application is approved and you told us you are interested. Please confirm on My Applications so the landlord can set up your tenancy.',
      next: 'Open My Applications and tap "Proceed with EboHomes".',
      owner: 'tenant',
      href: '/applications',
      cta: 'Open My Applications',
    }
  }
  if (app && app.status === 'info_requested') {
    return {
      tone: 'amber',
      heading: 'EBOHOMES NEEDS MORE INFORMATION',
      body: 'Your decision is recorded, but EboHomes has a question about your application.',
      next: 'Answer the question on My Applications.',
      owner: 'tenant',
      href: '/applications',
      cta: 'Answer on My Applications',
    }
  }
  if (app && app.status === 'pending') {
    return {
      tone: 'amber',
      heading: 'YOU WANT TO CONTINUE — EBOHOMES IS REVIEWING YOUR APPLICATION',
      body: 'Your decision is recorded. EboHomes is reviewing your application. When it is approved, your wish to proceed is applied automatically. Nothing is reserved or approved yet.',
      next: 'Wait for EboHomes to review your application.',
      owner: 'ebohomes',
      href: '/applications',
      cta: 'View my application',
    }
  }
  if (app && app.status) {
    return {
      tone: 'grey',
      heading: 'THIS APPLICATION IS CLOSED',
      body: 'Your decision is recorded, but this application is no longer open, so nothing more will happen on it.',
      next: 'Browse other properties if you are still looking.',
      owner: 'none',
    }
  }
  // No application information: the original wording.
  return {
    tone: 'amber',
    heading: 'YOU WANT TO CONTINUE — EBOHOMES IS REVIEWING',
    body: 'Your decision is recorded. EboHomes is reviewing your application and confirming the property and rental terms. Nothing is reserved or approved yet.',
    next: 'Wait for EboHomes to review your application.',
    owner: 'ebohomes',
  }
}

// The tenant-facing message for the viewing's real state. `fmt` formats an ISO date for display.
export function tenantPanel(v: ViewingLike, fmt: (iso: string | null | undefined) => string, app?: ApplicationLike): Panel {
  switch (v.status) {
    case 'requested':
      return {
        tone: 'amber',
        heading: 'AWAITING EBOHOMES RESPONSE',
        body: 'Your request has been received. EboHomes has not yet confirmed your appointment.',
        next: 'Wait for EboHomes to respond. Keep your phone available.',
        owner: 'ebohomes',
      }
    case 'approved':
      return {
        tone: 'amber',
        heading: 'REQUEST APPROVED — TIME NOT SET YET',
        body: 'EboHomes approved your request but has not yet chosen a date and time. Your viewing is not scheduled yet.',
        next: 'Wait for EboHomes to confirm the appointment.',
        owner: 'ebohomes',
      }
    case 'reschedule_proposed':
      return {
        tone: 'blue',
        heading: 'EBOHOMES HAS PROPOSED A NEW VIEWING TIME',
        body: `The administrator has proposed ${fmt(v.proposed_at)}.`,
        next: 'Accept the proposed time or decline it so EboHomes can offer another.',
        owner: 'tenant',
      }
    case 'scheduled':
      return {
        tone: 'green',
        heading: 'YOUR VIEWING HAS BEEN SCHEDULED',
        body: `Your appointment has been confirmed for ${fmt(v.scheduled_for)}. Please keep your phone available so EboHomes can coordinate your visit.`,
        next: 'Attend your scheduled viewing.',
        owner: 'tenant',
      }
    case 'completed':
      if (v.tenant_decision === 'interested') return interestedPanel(app)
      if (v.tenant_decision === 'not_interested') {
        return {
          tone: 'grey',
          heading: 'YOU ARE NO LONGER INTERESTED',
          body: 'Your decision is recorded. The property may remain available to others if it has not been reserved or rented.',
          next: 'No further action needed.',
          owner: 'none',
        }
      }
      return {
        tone: 'blue',
        heading: 'VIEWING COMPLETED — WHAT WOULD YOU LIKE TO DO NEXT?',
        body: 'Have you decided whether you would like to rent this property?',
        next: 'Choose one of the options below.',
        owner: 'tenant',
      }
    case 'no_show':
      return {
        tone: 'red',
        heading: 'YOUR VIEWING WAS MARKED AS MISSED',
        body: 'EboHomes recorded that the viewing did not take place.',
        next: 'Request a new viewing if you still want to see the property.',
        owner: 'tenant',
      }
    case 'cancelled':
      return {
        tone: 'red',
        heading: 'THIS VIEWING WAS CANCELLED',
        body: 'This appointment will not go ahead.',
        next: 'Request a new viewing if you still want to see the property.',
        owner: 'tenant',
      }
    case 'rejected':
      return {
        tone: 'red',
        heading: 'YOUR VIEWING REQUEST WAS NOT APPROVED',
        body: 'EboHomes could not approve this request. Read the reason below.',
        next: 'Request a new viewing at a different time if you still want to see the property.',
        owner: 'tenant',
      }
    default:
      return { tone: 'grey', heading: 'VIEWING', body: '', next: '', owner: 'none' }
  }
}

// Short "what should staff do" line for the admin list.
export function staffNext(v: ViewingLike): string {
  switch (v.status) {
    case 'requested': return 'Review the request: approve with a time, propose another time, or reject with a reason.'
    case 'approved': return 'Choose and confirm a date and time.'
    case 'reschedule_proposed': return 'Waiting for the tenant to accept or decline the proposed time.'
    case 'scheduled': return 'Contact the tenant, then record the outcome after the visit.'
    case 'completed':
      if (v.tenant_decision === 'interested') return 'Tenant wants to proceed. Open Applications to approve, ask a question or decline. Once approved, the landlord sets up the tenancy.'
      if (v.tenant_decision === 'not_interested') return 'Tenant is no longer interested. No action needed.'
      return 'Waiting for the tenant to say whether they want to continue.'
    default: return 'Closed.'
  }
}

const EVENT_LABELS: Record<string, string> = {
  viewing_requested: 'Tenant requested a viewing',
  request_approved: 'EboHomes approved the request',
  appointment_scheduled: 'EboHomes scheduled the appointment',
  appointment_rescheduled: 'EboHomes rescheduled the appointment',
  alternative_proposed: 'EboHomes proposed a new time',
  request_rejected: 'EboHomes did not approve the request',
  proposal_accepted: 'Tenant accepted the proposed time',
  proposal_declined: 'Tenant declined the proposed time',
  viewing_completed: 'Viewing completed',
  viewing_missed: 'Viewing marked as missed',
  viewing_cancelled: 'Viewing cancelled',
  contact_attempted: 'EboHomes tried to reach the tenant',
  contact_reached: 'EboHomes reached the tenant',
  contact_not_attempted: 'Contact status reset',
  tenant_interested: 'Tenant wants to continue with renting',
  tenant_declined: 'Tenant is no longer interested',
}

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, ' ')
}