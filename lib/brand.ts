// Single source of truth for EboHomes brand wording and colours.
// Stage 2 foundation: nothing is forced onto existing pages. New and redesigned components read from
// here (or from the CSS tokens in app/globals.css) instead of hardcoding values.

/** Main brand slogan. Use for brand identity: titles, headers, footers, about copy. */
export const BRAND_SLOGAN = "Real Estate You Can Trust."

/** Supporting marketing phrase. Fine in campaigns, splash screens and promotional images. */
export const BRAND_SUPPORTING_PHRASE = "Find Homes. Skip the Stress."

/** Official colours. In CSS use the tokens (--forest, --primary, --cream) rather than these. */
export const BRAND_COLORS = {
  forest: "#0A2E1A", // primary brand surface colour  (--forest)
  green: "#0A7A3B", // supporting green: actions, links  (--primary)
  cream: "#FAF7F2", // warm page background  (--cream)
  white: "#FFFFFF",
} as const

/** Page title in the form "EboHomes | Real Estate You Can Trust" */
export const BRAND_TITLE = "EboHomes | Real Estate You Can Trust"
