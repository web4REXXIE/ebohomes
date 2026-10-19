// Pure helpers that sort a person's viewings into clear sections. No imports, so they can be unit tested directly.
// Uses only the real viewing statuses and the saved tenant_decision. Nothing new is stored.

export type ViewingGroup = 'action' | 'waiting' | 'scheduled' | 'past'

export const VIEWING_GROUP_ORDER: ViewingGroup[] = ['action', 'scheduled', 'waiting', 'past']

export const VIEWING_GROUP_TITLE: Record<'tenant' | 'landlord', Record<ViewingGroup, string>> = {
  tenant: {
    action: 'Action needed from you',
    scheduled: 'Scheduled',
    waiting: 'Waiting for EboHomes',
    past: 'Past viewings',
  },
  landlord: {
    action: 'Needs attention',
    scheduled: 'Scheduled',
    waiting: 'Being arranged by EboHomes',
    past: 'Past viewings',
  },
}

type V = { status: string; tenant_decision?: string | null; scheduled_for?: string | null }

export function viewingGroup(v: V): ViewingGroup {
  switch (v.status) {
    case 'scheduled':
      return 'scheduled'
    case 'requested':
    case 'approved':
      return 'waiting'
    case 'reschedule_proposed':
      return 'action'
    case 'completed':
      if (v.tenant_decision === 'interested') return 'waiting'
      if (v.tenant_decision === 'not_interested') return 'past'
      return 'action'
    default:
      return 'past'
  }
}

function ms(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

// Input is already newest-first. Scheduled viewings are re-ordered so the soonest appointment is on top.
export function groupViewings<T extends V>(list: T[]): Record<ViewingGroup, T[]> {
  const out: Record<ViewingGroup, T[]> = { action: [], scheduled: [], waiting: [], past: [] }
  for (const v of list) out[viewingGroup(v)].push(v)
  out.scheduled.sort((a, b) => ms(a.scheduled_for) - ms(b.scheduled_for))
  return out
}