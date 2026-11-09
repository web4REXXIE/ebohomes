// Stage 18f guard rails: the shared confirmation dialog is accessible, and pages that use it
// only run their action after the person confirms.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dlg = readFileSync('components/confirm-dialog.tsx', 'utf8')
assert.match(dlg, /export function useConfirm/)
assert.match(dlg, /role="alertdialog"/)
assert.match(dlg, /aria-modal="true"/)
assert.match(dlg, /aria-labelledby=\{titleId\}/)
assert.match(dlg, /aria-describedby=\{bodyId\}/)
assert.match(dlg, /e\.key === 'Escape'/, 'Escape cancels')
assert.match(dlg, /e\.key !== 'Tab'/, 'Tab is trapped')
assert.match(dlg, /cancelRef\.current\?\.focus\(\)/, 'focus starts on Cancel')
assert.match(dlg, /previous\?\.focus/, 'focus returns to the opener')
assert.match(dlg, /document\.body\.style\.overflow = 'hidden'/, 'page scroll is locked')
assert.match(dlg, /min-h-11/, 'buttons are at least 44px tall')
assert.doesNotMatch(dlg, /text-\[(9|10|11)px\]/)

// Pages that have been moved to the dialog: no browser confirm(), and the action comes after the answer.
const moved = {
  'app/admin/finalization/page.tsx': 'eb_admin_retry_finalization',
  'app/admin/applications/page.tsx': 'admin_decide_application',
  'app/admin/cases/page.tsx': 'supabase.rpc(fn, args)',
  'app/admin/inspections/page.tsx': "update({ status: 'cancelled' })",
  'app/admin/listing-authority/page.tsx': 'admin_decide_listing_authority',
  'app/admin/offers/page.tsx': 'eb_issue_rental_offer',
  'app/admin/operations/page.tsx': 'admin_trust_set_enforcement',
  'app/admin/payments/page.tsx': "review(p.id, 'confirmed', null)",
  'app/admin/property-review/page.tsx': "reviewListing(l, 'reinstate', null)",
  'app/admin/reservations/page.tsx': 'supabase.rpc(fn, args)',
  'app/admin/risk/page.tsx': 'admin_risk_scan_batch',
  'app/admin/users/page.tsx': "from('profiles').update({ status: newStatus })",
  'app/admin/viewings/page.tsx': 'supabase.rpc(fn, args)',
}
for (const [file, rpc] of Object.entries(moved)) {
  const src = readFileSync(file, 'utf8')
  assert.doesNotMatch(src, /window\.confirm\(/, `${file}: no window.confirm left`)
  assert.match(src, /useConfirm\(\)/, `${file}: uses the shared dialog`)
  assert.match(src, /\{dialog\}/, `${file}: renders the dialog`)
  const asked = src.indexOf('await confirm(')
  const acted = src.indexOf(rpc.includes('(') ? rpc : `'${rpc}'`)
  assert.ok(asked > -1 && acted > asked, `${file}: ${rpc} runs only after the confirmation`)
}

console.log('confirm-dialog-stage18f: ok')
