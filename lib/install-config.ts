// Smart Install settings for EboHomes.
// Change values here; no other file needs editing.

export const INSTALL_CONFIG = {
  // Where we remember the visitor's choices in the browser
  storageKey: 'ebohomes_install_v1',

  // "Not now" hides the banner for this many days
  dismissDays: 7,

  // After this many dismissals, hide it for longer
  longDismissAfter: 2,
  longDismissDays: 30,

  // The banner appears once the visitor has browsed for this long...
  showAfterMs: 15000,
  // ...or has opened this many pages in one visit
  showAfterPageViews: 2,

  // Pages where the banner is allowed (exact paths).
  // Listing pages are left out on purpose: they have a sticky action bar.
  bannerPaths: ['/', '/search'],
} as const