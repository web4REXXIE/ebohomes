// Pure helpers for what a tenant is told about a property's availability. No imports, so they can be unit tested directly.
// It uses only facts the system already holds: the listing status, and whether the server says that SOMEONE ELSE
// has an application in progress. It never uses a count or a name, so no other applicant's details can leak.

export const OTHER_APPLICATION_TITLE = 'Another application is in progress'
export const OTHER_APPLICATION_TEXT =
  'This property has received an application, but it has not yet been confirmed as rented. You may still apply while it remains available.'
// Short version for property cards.
export const OTHER_APPLICATION_SHORT = 'Another application is in progress. You may still apply while it remains available.'

export type AvailabilityKind = 'available' | 'other_application' | 'rented' | 'unavailable'
export type AvailabilityTone = 'amber' | 'grey'

export type AvailabilityNote = {
  kind: Exclude<AvailabilityKind, 'available'>
  tone: AvailabilityTone
  title: string
  text: string
  short: string
}

// listingStatus: listings.status. otherInProgress: true / false from the server, or null when it is not known.
// "Live" means status = 'approved', the same rule search, home and the listing page use.
export function availabilityKind(listingStatus: string | null | undefined, otherInProgress: boolean | null): AvailabilityKind {
  if (listingStatus === 'rented') return 'rented'
  if (listingStatus !== 'approved') return 'unavailable'
  return otherInProgress === true ? 'other_application' : 'available'
}

// Nothing is shown for a plain available property, so a normal listing stays clean.
export function availabilityNote(kind: AvailabilityKind): AvailabilityNote | null {
  switch (kind) {
    case 'available':
      return null
    case 'other_application':
      return { kind, tone: 'amber', title: OTHER_APPLICATION_TITLE, text: OTHER_APPLICATION_TEXT, short: OTHER_APPLICATION_SHORT }
    case 'rented':
      return {
        kind, tone: 'grey', title: 'This property has been rented',
        text: 'It is marked as rented, so it is not open for new applications.',
        short: 'This property has been rented.',
      }
    case 'unavailable':
      return {
        kind, tone: 'grey', title: 'Not open for applications',
        text: 'This property is not open for applications right now.',
        short: 'Not open for applications right now.',
      }
  }
}