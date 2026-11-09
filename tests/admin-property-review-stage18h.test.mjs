// Stage 18h guard rails: the property review screen is easier to use on a phone,
// and the decision rules behind it are exactly the same.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync('app/admin/property-review/page.tsx', 'utf8')

// Shared patterns, and a failed load no longer looks like an empty list.
assert.match(src, /from '@\/components\/admin-ui'/)
assert.match(src, /<ErrorState message=\{loadError\} onRetry=\{fetchListings\}/)
assert.match(src, /listingsError\.message/)
assert.match(src, /<LoadingState/)
assert.match(src, /<EmptyState/)

// Phones: Approve and Reject stay in view above the bottom bar, and tablet width and up are not sticky.
assert.match(src, /sticky bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\][^"]*sm:contents/)

// Sections are labelled, status is not colour alone, and nothing uses fixed colours.
for (const label of ['Listing and evidence', 'Risk and location', 'Decision', 'Authority and inspection']) {
  assert.ok(src.includes(`<GroupLabel>${label}</GroupLabel>`), `section label: ${label}`)
}
assert.match(src, /<StatusChip state="success">Authority reviewed<\/StatusChip>/)
assert.doesNotMatch(src, /(amber|emerald)-\d{2,3}/, 'no fixed amber/emerald colours')
assert.doesNotMatch(src, /<img(?![^>]*\balt=)/, 'every image has an alt attribute')
assert.doesNotMatch(src, /text-\[(9|10|11)px\]/)

// Decision rules are unchanged.
assert.match(src, /rpc\('admin_review_listing'/)
assert.match(src, /p_expected_status: listing\.status \?\? 'pending'/)
assert.match(src, /error\.code === '40001'/)
assert.match(src, /disabled=\{updating \|\| !awaitingReview \|\| !canApprove\}/, 'approve stays blocked without authority')
assert.match(src, /disabled=\{updating \|\| !awaitingReview \|\| rejectReason\.trim\(\)\.length < 5\}/, 'reject still needs a reason')
assert.match(src, /reason\.length < 5/)
assert.match(src, /isAuthorityReviewed\(selected\.authority_status\) \|\| legacyOpen\.has\(selected\.id\)/)
assert.match(src, /await confirm\(\{ title: 'Reinstate listing\?'/)

console.log('admin-property-review-stage18h: ok')
