import type { Metadata } from 'next'

// Stage 19a: robots metadata for private and signed-in pages. Server layouts export this so the page
// carries <meta name="robots" content="noindex, nofollow">. next.config.mjs sends the same instruction
// as an X-Robots-Tag header (see lib/private-routes.mjs), which also covers client-component layouts.
export const PRIVATE_ROBOTS: NonNullable<Metadata['robots']> = { index: false, follow: false }
