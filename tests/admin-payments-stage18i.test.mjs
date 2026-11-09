// Stage 18i guard rails: payout accounts, payment evidence review and inspector payouts use the
// shared admin patterns, and every money or review action behind them is unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pa = readFileSync('app/admin/payout-accounts/page.tsx', 'utf8')
const ps = readFileSync('app/admin/payment-submissions/page.tsx', 'utf8')
const ip = readFileSync('app/admin/inspection-payouts/page.tsx', 'utf8')

for (const [name, src] of [['payout-accounts', pa], ['payment-submissions', ps], ['inspection-payouts', ip]]) {
  assert.match(src, /from '@\/components\/admin-ui'/, `${name}: shared patterns`)
  assert.match(src, /<AdminPageHeader/, `${name}: page header`)
  assert.match(src, /<StatusChip state=/, `${name}: status is text plus icon`)
  assert.doesNotMatch(src, /(amber|emerald|red|sky|slate)-\d{2,3}/, `${name}: no fixed colours`)
  assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${name}: no tiny text`)
}
for (const [name, src] of [['payout-accounts', pa], ['payment-submissions', ps]]) {
  assert.match(src, /<ErrorState message=\{err\} onRetry=\{load\}/, `${name}: failed load can be retried`)
  assert.match(src, /<LoadingState/, `${name}: loading state`)
  assert.match(src, /<EmptyState/, `${name}: empty state`)
  assert.match(src, /role="tablist" aria-label=/, `${name}: tabs are labelled`)
  assert.match(src, /<button[^>]*className=\{?[`"]focus-ring/, `${name}: visible focus`)
}
assert.match(ps, /<SearchBox id="submission-search"/)
assert.match(ps, /paged\.slice\.map/)

// Money and review actions are unchanged.
assert.match(pa, /\/api\/admin\/payout-accounts/)
assert.match(pa, /validatePayoutReview\(action, note/)
assert.match(pa, /body: JSON\.stringify\(\{ id: s\.id, action, note, attest/)
assert.match(ps, /\/api\/admin\/payment-submissions\/review/)
assert.match(ps, /\/api\/admin\/payment-submissions\/issue-code/)
assert.match(ps, /validateReview\(action, note/)
assert.match(ps, /if \(action === 'verify'\) \{ setMode\(null\); await sendCode\(\); return \}/)
assert.match(ps, /eb_admin_code_status/)
for (const fn of ['admin_inspection_payouts_overview', 'admin_inspection_record_payout', 'admin_inspection_mark_paid', 'admin_inspection_void_payout', 'admin_remote_add_budget', 'admin_verification_add_budget']) {
  assert.ok(ip.includes(`'${fn}'`), `inspection-payouts still calls ${fn}`)
}
// The two inspection budgets stay separate, and every input has an accessible name.
assert.match(ip, /\['verification', 'remote'\] as const/)
assert.match(ip, /aria-label="Payment reference"/)
assert.match(ip, /aria-label="Payment method"/)

console.log('admin-payments-stage18i: ok')
