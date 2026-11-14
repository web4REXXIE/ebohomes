// Pure rules for the tenant action buttons on the property details page (Apply, Viewing).
// One decision feeds both the desktop sidebar and the mobile bar, so they can never disagree.
// No React and no Supabase, so it can be unit tested. It only reads state the page already loaded.
//
// A viewing is only ever a REQUEST until EboHomes schedules it. The wording below never says
// "booked" or "confirmed" before the viewing status is "scheduled".

import { OPEN_STATUSES as VIEWING_OPEN_STATUSES, viewingLabel } from '@/lib/viewing-status'

export type ApplicationRef = { id: string; status: string }
export type ViewingRef = { status: string }

export type ActionInput = {
  listingId: string
  listingStatus: string | null | undefined
  signedIn: boolean
  isOwner: boolean
  onHold: boolean
  // Another tenant is completing a reservation for this property. Optional so existing callers keep working.
  reserved?: boolean
  // The tenant's own open application for this listing, if any (pending, info_requested or approved).
  application: ApplicationRef | null
  // The tenant's own open viewing on that application, if any.
  viewing: ViewingRef | null
}

export type ActionButton = {
  label: string
  shortLabel: string
  // null means the button is shown but disabled.
  href: string | null
  // One short line under the button saying where things really stand.
  statusLine: string | null
}

export type PropertyActions = {
  // When set, show only this message. The owner never sees tenant actions.
  ownerMessage: string | null
  canSave: boolean
  apply: ActionButton | null
  viewing: ActionButton | null
  // A single reason shown when something is paused or unavailable.
  note: string | null
  // Plain explanation shown near the buttons.
  helper: string | null
}

export const HOLD_NOTE =
  "This property is on hold and can't take new applications or viewing requests right now. You can still chat with EboHomes."

export const RESERVED_NOTE =
  'Another tenant is completing a reservation for this property. It may become available again, so check back in a few days.'

export const NOT_OPEN_NOTE = 'This property is not open for applications right now.'

export const OWNER_MESSAGE =
  'This is your listing. Tenant actions such as saving, applying and requesting a viewing are hidden from you.'

export const REQUEST_HELPER =
  'Applying is free and no payment is taken here. Applying does not book a viewing. A viewing stays a request until EboHomes schedules it and you see "Viewing scheduled".'

export function loginHref(listingId: string): string {
  return `/login?redirect=${encodeURIComponent(`/listing/${listingId}`)}`
}

function applyHref(listingId: string): string {
  return `/journey/apply/${listingId}`
}

function journeyHref(applicationId: string): string {
  return `/journey/${applicationId}`
}

// The button for a viewing that is already open. Wording follows the real status.
function openViewingButton(status: string, href: string): ActionButton {
  switch (status) {
    case 'requested':
      return {
        label: 'Viewing requested',
        shortLabel: 'Viewing requested',
        href,
        statusLine: `${viewingLabel(status)}. Not confirmed yet.`,
      }
    case 'approved':
      return {
        label: 'Viewing request approved',
        shortLabel: 'Request approved',
        href,
        statusLine: `${viewingLabel(status)}. No time is set yet.`,
      }
    case 'reschedule_proposed':
      return {
        label: 'Respond to the proposed time',
        shortLabel: 'Respond to time',
        href,
        statusLine: 'EboHomes proposed a new time. Open to accept or decline.',
      }
    default:
      // scheduled
      return {
        label: 'Viewing scheduled',
        shortLabel: 'Viewing scheduled',
        href,
        statusLine: 'EboHomes has scheduled your appointment. Open for details.',
      }
  }
}

export function decidePropertyActions(input: ActionInput): PropertyActions {
  const { listingId, listingStatus, signedIn, isOwner, onHold, reserved = false, application, viewing } = input

  if (isOwner) {
    return { ownerMessage: OWNER_MESSAGE, canSave: false, apply: null, viewing: null, note: null, helper: null }
  }

  const none = { ownerMessage: null, canSave: true }

  if (listingStatus !== 'approved') {
    return {
      ...none,
      apply: { label: 'Not open for applications', shortLabel: 'Unavailable', href: null, statusLine: null },
      viewing: { label: 'Viewing not available', shortLabel: 'Unavailable', href: null, statusLine: null },
      note: NOT_OPEN_NOTE,
      helper: null,
    }
  }

  const hasApplication = signedIn && application !== null
  const openViewing =
    hasApplication && viewing !== null && VIEWING_OPEN_STATUSES.includes(viewing.status) ? viewing : null

  // A hold stops NEW applications and viewings. Someone already in the process can still open it.
  if (onHold && !hasApplication) {
    return {
      ...none,
      apply: { label: 'Applications paused', shortLabel: 'Paused', href: null, statusLine: null },
      viewing: { label: 'Viewing requests paused', shortLabel: 'Paused', href: null, statusLine: null },
      note: HOLD_NOTE,
      helper: null,
    }
  }

  // A reservation stops NEW applications (the database enforces it). The reserved tenant already has an application, so they can still open theirs.
  if (reserved && !hasApplication) {
    return {
      ...none,
      apply: { label: 'Reserved', shortLabel: 'Reserved', href: null, statusLine: null },
      viewing: { label: 'Viewing not available', shortLabel: 'Unavailable', href: null, statusLine: null },
      note: RESERVED_NOTE,
      helper: null,
    }
  }

  if (!signedIn) {
    const href = loginHref(listingId)
    return {
      ...none,
      apply: { label: 'Sign in to apply', shortLabel: 'Sign in to apply', href, statusLine: null },
      viewing: {
        label: 'Sign in to request a viewing',
        shortLabel: 'Sign in',
        href,
        statusLine: null,
      },
      note: null,
      helper: REQUEST_HELPER,
    }
  }

  if (!application) {
    const href = applyHref(listingId)
    return {
      ...none,
      apply: { label: 'Apply now', shortLabel: 'Apply now', href, statusLine: null },
      viewing: {
        label: 'Apply to request a viewing',
        shortLabel: 'Apply to view',
        href,
        statusLine: 'You apply first. Then you can ask for a viewing.',
      },
      note: null,
      helper: REQUEST_HELPER,
    }
  }

  const href = journeyHref(application.id)
  const apply: ActionButton = {
    label: 'Continue my application',
    shortLabel: 'My application',
    href,
    statusLine: null,
  }

  if (openViewing) {
    return { ...none, apply, viewing: openViewingButton(openViewing.status, href), note: null, helper: REQUEST_HELPER }
  }

  if (onHold) {
    return {
      ...none,
      apply,
      viewing: { label: 'Viewing requests paused', shortLabel: 'Paused', href: null, statusLine: null },
      note: HOLD_NOTE,
      helper: null,
    }
  }

  return {
    ...none,
    apply,
    viewing: {
      label: 'Request a viewing',
      shortLabel: 'Request viewing',
      href,
      statusLine: 'Opens your application, where you choose a date and time.',
    },
    note: null,
    helper: REQUEST_HELPER,
  }
}
