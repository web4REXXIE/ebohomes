// Single source of truth for EboHomes brand wording, colours and logo files.
// Full rules: docs/BRAND.md. In CSS, use the tokens in app/globals.css (bg-primary, bg-forest,
// text-success ...) rather than these values. Use these constants in TypeScript, metadata and emails.

/** Main brand slogan. Brand identity: titles, headers, footers, about copy. */
export const BRAND_SLOGAN = "Real Estate You Can Trust."

/** Supporting marketing phrase. Campaigns, splash screen, share images, promotional sections. */
export const BRAND_SUPPORTING_PHRASE = "Find Homes. Skip the Stress."

/** Page title in the form "EboHomes | Real Estate You Can Trust" */
export const BRAND_TITLE = "EboHomes | Real Estate You Can Trust"

/** Official colours (light mode). */
export const BRAND_COLORS = {
  primary: "#0A2E1A", // brand colour: key actions, links, brand surfaces  (--primary, --forest)
  support: "#0A7A3B", // supporting green: success, verified, focus ring, charts  (--support)
  cream: "#FAF7F2", // warm section background  (--cream)
  white: "#FFFFFF",
  gold: "#F59E0B", // "Featured" accent only  (--featured)
  iconSurface: "#062D1A", // background baked into the supplied icon, splash and share artwork
} as const

/**
 * Logo files. All are raster (PNG/WebP/JPEG), not vector. Pick by the background they sit on.
 * The transparent files in /brand were prepared from the originals; see public/brand/README.md.
 */
export const BRAND_LOGOS = {
  /** White lockup (mark + wordmark + tagline), transparent. Use on forest or dark surfaces. */
  onDark: "/brand/logo-white-transparent.png",
  /** White mark only, transparent. Use on forest or dark surfaces. */
  markOnDark: "/brand/icon-white-transparent.png",
  /** Green lockup with tagline, transparent. Use on white or cream surfaces. */
  onLight: "/brand/logo-horizontal-compact-transparent.png",
  /** Square app icon (white mark on forest). Favicons, structured data, install prompts. */
  appIcon: "/icons/icon-512.png",
  /** 1200x630 share image. Open Graph and Twitter cards. */
  shareImage: "/og-image.jpg",
} as const
