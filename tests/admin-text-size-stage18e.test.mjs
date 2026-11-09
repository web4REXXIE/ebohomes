// Stage 18e guard rails: admin pages in this batch have no text under 12px, and their decision calls are unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pages = ['applications', 'cases', 'inspections', 'messages', 'offers', 'support', 'users']
for (const p of pages) {
  const src = readFileSync(`app/admin/${p}/page.tsx`, 'utf8')
  assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${p}: no text under 12px`)
  assert.ok(src.trimEnd().endsWith('}'), `${p}: file is complete (ends with a closing brace)`)
}

const apps = readFileSync('app/admin/applications/page.tsx', 'utf8')
assert.match(apps, /rpc\('admin_decide_application'/)
assert.match(apps, /rpc\('eb_admin_override_application'/)
assert.match(apps, /window\.confirm\(confirmText\)/)

const cases = readFileSync('app/admin/cases/page.tsx', 'utf8')
for (const fn of ['admin_review_legacy_decision', 'schedule_viewing', 'complete_viewing', 'cancel_viewing', 'record_signed_agreement', 'maintenance_action', 'admin_update_dispute', 'admin_review_settlement', 'admin_apply_renewal']) {
  assert.ok(cases.includes(`'${fn}'`), `cases: ${fn} call kept`)
}

const insp = readFileSync('app/admin/inspections/page.tsx', 'utf8')
for (const fn of ['admin_review_inspection_file', 'admin_review_inspection', 'admin_request_inspection_supplement', 'admin_cancel_inspection_supplement', 'admin_waive_second_inspector', 'admin_add_inspector', 'admin_set_inspection_gps_threshold', 'eb_inspection_approval_blockers']) {
  assert.ok(insp.includes(`'${fn}'`), `inspections: ${fn} call kept`)
}

const offers = readFileSync('app/admin/offers/page.tsx', 'utf8')
for (const fn of ['eb_issue_rental_offer', 'eb_withdraw_rental_offer']) {
  assert.ok(offers.includes(`'${fn}'`), `offers: ${fn} call kept`)
}

console.log('admin-text-size-stage18e: ok')
