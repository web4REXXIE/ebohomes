// Pure helpers that work out what a tenant should do next. No imports, so they can be unit tested directly.
// Everything is read from records that already exist (viewings, applications, tenancies, rental_terms,
// handover_records, payments). Nothing new is stored and no status is invented.

export type StepOwner = 'you' | 'ebohomes'

export type Step = {
  key: string
  priority: number
  owner: StepOwner
  listingId: string | null
  // Used only when the property record cannot be found from listingId.
  label: string | null
  title: string
  body: string
  cta: string | null
  href: string
}

export type NextStepInput = {
  userId: string
  now: number
  viewings: { id: string; listing_id: string; application_id?: string | null; status: string; tenant_decision?: string | null; scheduled_for?: string | null }[]
  applications: { id: string; listing_id: string; status: string; tenant_interest_at?: string | null }[]
  tenancies: { id: string; listing_id?: string | null; title?: string | null; status?: string | null; application_id?: string | null }[]
  terms: { id: string; tenancy_id: string; status: string; tenant_accepted_at?: string | null }[]
  handovers: { id: string; tenancy_id: string; kind: string; status: string; submitted_by?: string | null }[]
  payments: { id: string; tenancy_id: string; amount?: number | null; status?: string | null; verified_by?: string | null }[]
}

const ENDED = ['ended', 'terminated', 'cancelled', 'expired']

function naira(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0)
  return '₦' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function when(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return 'the confirmed time'
  return d.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export function buildSteps(inp: NextStepInput): Step[] {
  const out: Step[] = []
  const appById = new Map(inp.applications.map((a) => [a.id, a]))
  const tenancyApps = new Set(inp.tenancies.filter((t) => !ENDED.includes(t.status ?? '')).map((t) => t.application_id).filter(Boolean) as string[])
  const hasViewingFor = new Set<string>()

  for (const v of inp.viewings) {
    const app = v.application_id ? appById.get(v.application_id) : undefined
    // A closed application needs nothing from the tenant.
    if (app && (app.status === 'rejected' || app.status === 'withdrawn')) continue
    if (v.application_id && ['requested', 'approved', 'reschedule_proposed', 'scheduled', 'completed'].includes(v.status)) hasViewingFor.add(v.application_id)
    const base = { listingId: v.listing_id, label: null as string | null, href: '/viewings' }

    if (v.status === 'reschedule_proposed') {
      out.push({ ...base, key: 'v-' + v.id, priority: 10, owner: 'you', title: 'EboHomes suggested a new viewing time', body: 'Accept the new time, or tell EboHomes what time suits you.', cta: 'Reply now' })
    } else if (v.status === 'completed' && !v.tenant_decision) {
      out.push({ ...base, key: 'v-' + v.id, priority: 30, owner: 'you', title: 'Tell EboHomes if you want to rent this property', body: 'You have seen it. Choose whether to continue. Nothing is reserved or charged yet.', cta: 'Make your choice' })
    } else if (v.status === 'completed' && v.tenant_decision === 'interested') {
      const needsConfirm = !!app && app.status === 'approved' && !app.tenant_interest_at && !tenancyApps.has(app.id)
      if (needsConfirm) {
        out.push({ ...base, key: 'vi-' + v.id, priority: 35, owner: 'you', href: '/applications', title: 'Confirm you want to proceed', body: 'Your application is approved. Confirm on your application so the landlord can set up your tenancy. No payment is taken.', cta: 'Open my application' })
      } else if (!(app && tenancyApps.has(app.id))) {
        out.push({ ...base, key: 'vw-' + v.id, priority: 90, owner: 'ebohomes', title: 'EboHomes is reviewing your choice', body: 'EboHomes will confirm the property is available and agree the rent and terms. Nothing is reserved yet.', cta: null })
      }
    } else if (v.status === 'scheduled') {
      const past = v.scheduled_for ? new Date(v.scheduled_for).getTime() < inp.now - 6 * 3600 * 1000 : false
      if (!past) {
        out.push({ ...base, key: 'v-' + v.id, priority: 60, owner: 'you', title: 'Attend your viewing on ' + when(v.scheduled_for), body: 'Keep your phone available so EboHomes can coordinate the visit.', cta: 'See details' })
      }
    } else if (v.status === 'requested' || v.status === 'approved') {
      out.push({ ...base, key: 'v-' + v.id, priority: 80, owner: 'ebohomes', title: v.status === 'requested' ? 'Waiting for EboHomes to answer your viewing request' : 'EboHomes is choosing a viewing time', body: 'Nothing to do. The answer will appear on your Viewings page.', cta: null })
    }
  }

  for (const a of inp.applications) {
    const base = { listingId: a.listing_id, label: null as string | null }
    if (a.status === 'info_requested') {
      out.push({ ...base, key: 'a-' + a.id, priority: 20, owner: 'you', href: '/applications', title: 'EboHomes needs more information', body: 'Answer EboHomes’ question so your application can continue.', cta: 'Answer now' })
    } else if (a.status === 'pending') {
      out.push({ ...base, key: 'a-' + a.id, priority: 85, owner: 'ebohomes', href: '/applications', title: 'EboHomes is reviewing your application', body: 'Nothing is approved yet and you do not need to pay anything.', cta: null })
    } else if (a.status === 'approved' && !tenancyApps.has(a.id)) {
      if (a.tenant_interest_at) {
        out.push({ ...base, key: 'a-' + a.id, priority: 88, owner: 'ebohomes', href: '/applications', title: 'Your tenancy is being set up', body: 'You confirmed you want to proceed. The landlord sets up your tenancy and rental terms next. Nothing is due yet.', cta: null })
      } else if (!hasViewingFor.has(a.id)) {
        out.push({ ...base, key: 'a-' + a.id, priority: 70, owner: 'you', href: '/viewings', title: 'Request a viewing', body: 'Your application is approved. See the property in person before you pay anything.', cta: 'Request a viewing' })
      }
    }
  }

  for (const t of inp.tenancies) {
    if (ENDED.includes(t.status ?? '')) continue
    const base = { listingId: t.listing_id ?? null, label: t.title ?? null, href: '/tenancies/' + t.id }
    const live = inp.terms.find((x) => x.tenancy_id === t.id && ['proposed', 'accepted', 'signed'].includes(x.status))

    if (!live) {
      out.push({ ...base, key: 't-' + t.id, priority: 86, owner: 'ebohomes', title: 'Your rental terms are being prepared', body: 'The landlord proposes the rent, deposit and dates. You will be asked to accept them.', cta: null })
    } else if (live.status === 'proposed' && !live.tenant_accepted_at) {
      out.push({ ...base, key: 't-' + t.id, priority: 25, owner: 'you', title: 'Review and accept your rental terms', body: 'Check the rent, deposit, fees and dates. Accept them only if they are right.', cta: 'Review terms' })
    } else if (live.status === 'proposed') {
      out.push({ ...base, key: 't-' + t.id, priority: 87, owner: 'ebohomes', title: 'Waiting for the landlord to accept the terms', body: 'You have accepted. Nothing more to do now.', cta: null })
    } else if (live.status === 'accepted') {
      out.push({ ...base, key: 't-' + t.id, priority: 89, owner: 'ebohomes', title: 'EboHomes is recording your signed agreement', body: 'Both sides accepted. EboHomes records the signed agreement once it has seen it.', cta: null })
    }

    for (const h of inp.handovers) {
      if (h.tenancy_id !== t.id) continue
      if (h.status === 'submitted' && h.submitted_by && h.submitted_by !== inp.userId) {
        out.push({ ...base, key: 'h-' + h.id, priority: 40, owner: 'you', title: h.kind === 'move_in' ? 'Check your move-in record' : 'Check your move-out record', body: 'The landlord recorded the condition of the property. Acknowledge it if it is correct, or dispute it.', cta: 'Open record' })
      }
    }

    for (const p of inp.payments) {
      if (p.tenancy_id !== t.id) continue
      if (p.status === 'recorded' || p.status === 'pending') {
        out.push({ ...base, key: 'p-' + p.id, priority: 84, owner: 'ebohomes', title: 'A payment of ' + naira(p.amount) + ' is recorded', body: 'It counts only after EboHomes verifies it. You do not need to do anything.', cta: null })
      } else if (p.status === 'rejected') {
        out.push({ ...base, key: 'p-' + p.id, priority: 50, owner: 'you', title: 'A payment record of ' + naira(p.amount) + ' was rejected', body: 'EboHomes could not verify it. Open your tenancy to read why, or contact EboHomes.', cta: 'Open tenancy' })
      }
    }
  }

  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.priority - b.s.priority || a.i - b.i)
    .map((o) => o.s)
}

export function splitSteps(steps: Step[]): { action: Step[]; waiting: Step[] } {
  return { action: steps.filter((s) => s.owner === 'you'), waiting: steps.filter((s) => s.owner === 'ebohomes') }
}