// Stage 16 Part 3 guard rails: payouts, payout account, analytics, edit listing.
// Reads source only. No browser, no network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const payouts = readFileSync('app/dashboard/payouts/page.tsx', 'utf8')
const account = readFileSync('app/dashboard/payout-account/page.tsx', 'utf8')
const analytics = readFileSync('app/dashboard/analytics/page.tsx', 'utf8')
const edit = readFileSync('app/dashboard/edit/[id]/page.tsx', 'utf8')

// Payout logic is untouched: same endpoints, same validators, same request bodies.
assert.match(payouts, /api\('\/api\/payouts'\)/)
assert.match(payouts, /api\('\/api\/payouts', \{ method: 'POST', body: JSON\.stringify\(\{ id: p\.id, action, note \}\) \}\)/)
assert.match(payouts, /api\(`\/api\/payouts\/proof\?id=\$\{p\.id\}`\)/)
assert.match(payouts, /validateRespond\(action, note\)/)
assert.match(account, /action: 'request', \.\.\.v\.value/)
assert.match(account, /action: 'cancel', id/)
assert.match(account, /validatePayoutAccount\(/)
assert.match(account, /fetch\('\/api\/payout-account'/)

// Confirming receipt now needs a second tap, and still calls the same action.
assert.match(payouts, /setMode\('confirm'\)/)
assert.match(payouts, /respond\('confirm'\)/)
// Cancelling an account request needs a second tap.
assert.match(account, /setConfirmCancel\(true\)/)

// No browser pop-ups, no fixed colours that ignore dark mode, no tiny text.
for (const [name, src] of Object.entries({ payouts, account, analytics, edit })) {
  assert.doesNotMatch(src, /\balert\(/, `${name}: alert()`)
  assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${name}: text under 12px`)
  assert.doesNotMatch(src, /\b(bg|border|text)-(emerald|amber|red|sky)-\d{2,3}\b/, `${name}: fixed status colours`)
}

// Status is shown as text, not colour alone.
assert.match(payouts, /LANDLORD_STATUS_LABEL\[status\]/)

// Analytics: a failed query shows a dash, not a zero, and the page can retry.
assert.match(analytics, /viewsErr \? null/)
assert.match(analytics, /msgErr \? null/)
assert.match(analytics, /Try again/)
assert.match(analytics, /\.eq\('landlord_id', user\.id\)/)
assert.match(analytics, /\.in\('listing_id', listingIds\)/)

// Edit listing: the save payload and the ownership scope are unchanged.
assert.match(edit, /\.eq\('id', id\)\s*\.eq\('landlord_id', user\.id\)/)
assert.match(edit, /title: `\$\{formData\.bedrooms\} bed \$\{formData\.propertyType\} in \$\{formData\.location\}`/)
assert.match(edit, /contact_info: formData\.phoneNumber/)
assert.match(edit, /description: cleanDescription\(formData\.description\)/)
assert.match(edit, /router\.push\('\/dashboard'\)/)
// Every form control has a real label.
for (const id of ['edit-type', 'edit-beds', 'edit-desc', 'edit-location', 'edit-rent', 'edit-phone', 'edit-date']) {
  assert.match(edit, new RegExp(`htmlFor="${id}"`))
  assert.match(edit, new RegExp(`id="${id}"`))
}

console.log('landlord-dashboard-part3: ok')
