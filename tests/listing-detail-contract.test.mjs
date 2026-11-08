// Stage 12 guard rails for the property detail page. Plain Node, reads source files only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync('app/listing/[id]/layout.tsx', 'utf8')
const page = readFileSync('app/listing/[id]/page.tsx', 'utf8')
const sitemap = readFileSync('app/sitemap.ts', 'utf8')
const actions = readFileSync('components/property-actions.tsx', 'utf8')
const trust = readFileSync('components/property-trust.tsx', 'utf8')

// Stage 2 fix stays: the layout only adds metadata and renders its children. The page holds the listing.
assert.ok(!/^['"]use client['"]/m.test(layout), 'layout must stay a server component (metadata)')
assert.ok(/return <>\{children\}<\/>/.test(layout), 'layout must render its children only')
assert.ok(/export default function ListingDetailPage/.test(page), 'page.tsx holds the listing page')
assert.ok(!/generateMetadata/.test(page), 'metadata lives in the layout, not the client page')

// Only approved listings are described or listed, and only valid ids are queried.
assert.ok(/data\.status !== "approved"\) return FALLBACK/.test(layout), 'unapproved listings get the generic result')
assert.ok(/isValidListingId\(id\)\) return FALLBACK/.test(layout), 'invalid ids get the generic result')
assert.ok(/index: false/.test(layout), 'the generic result is not indexed')
assert.ok(/canonical/.test(layout), 'canonical URL is set')
assert.ok(/\.eq\("status", "approved"\)/.test(sitemap), 'sitemap lists approved listings only')
assert.ok(/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(layout) && !/SERVICE_ROLE/i.test(layout + sitemap), 'public metadata uses the anon key only')

// The page itself refuses to show anything that is not approved.
assert.ok(/data\.status !== 'approved'/.test(page), 'page checks the approved status')

// Tenant actions still come from the one decision function, and the owner never sees them.
assert.ok(/decidePropertyActions\(/.test(page), 'actions come from decidePropertyActions')
assert.ok(/actions\.canSave/.test(page), 'save button respects canSave')

// No tenant inspection fee or payment wording on the property page and its action components.
for (const [name, src] of [['page', page], ['actions', actions], ['trust', trust]]) {
  assert.ok(!/inspection fee|pay for (an |the )?inspection|paystack/i.test(src), `${name} must not mention an inspection fee or payment`)
}

// Trust wording: the identity, document, inspection rows stay separate, and the limits stay visible.
assert.ok(/Landlord identity checked/.test(trust))
assert.ok(/Inspected by EboHomes/.test(trust))
assert.ok(/cannot guarantee/.test(trust), 'trust block says verification is not a guarantee')

console.log('listing-detail-contract: ok')
