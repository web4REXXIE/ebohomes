// Stage 18d guard rails: admin review pages show errors inline, and decisions still go through the same database functions.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const vl = readFileSync('app/admin/verify-landlords/page.tsx', 'utf8')
const pr = readFileSync('app/admin/property-review/page.tsx', 'utf8')

for (const [name, src] of [['verify-landlords', vl], ['property-review', pr]]) {
  assert.doesNotMatch(src, /\balert\(/, `${name}: no browser alert()`)
  assert.match(src, /role="alert"/, `${name}: inline error is announced`)
  assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${name}: no text under 12px`)
}

// Decision paths are unchanged.
assert.match(vl, /rpc\('admin_decide_landlord_verification'/)
assert.match(vl, /missingItems\(target\)\.length > 0/)
assert.match(vl, /p_reason: decision === 'reject' \? reason : null/)
assert.match(pr, /rpc\('admin_review_listing'/)
assert.match(pr, /p_expected_status: listing\.status \?\? 'pending'/)
assert.match(pr, /error\.code === '40001'/)
assert.match(pr, /window\.confirm\('Reinstate this listing/)
assert.match(pr, /reason\.length < 5/)

console.log('admin-alerts-stage18d: ok')
