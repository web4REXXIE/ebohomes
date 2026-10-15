// Smart Install settings for EboHomes.
// Change values here; no other file needs editing.

export const INSTALL_CONFIG = {
  // Where we remember the visitor's choices in the browser
  storageKey: 'ebohomes_install_v1',

  // "Not now", the X, or closing the install guide hides the banner for this many days
  dismissDays: 7,

  // The "installed" flag is only trusted for this long, then the browser is asked again.
  // This lets the banner come back if someone uninstalls the app.
  installedTrustDays: 30,

  // First visit: the banner appears after this long on the page...
  showAfterMs: 15000,
  // ...or after this many pages in one visit
  showAfterPageViews: 2,

  // Returning visitors (seen on a previous visit or after being away) get it sooner
  returnShowAfterMs: 4000,

  // Coming back to an open tab after this many minutes counts as a new visit
  awayMinutes: 30,

  // Pages where the banner is allowed (exact paths).
  // Listing pages are left out on purpose: they have a sticky action bar.
  bannerPaths: ['/', '/search'],
} as const