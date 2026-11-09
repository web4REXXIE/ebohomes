// Stage 18e guard rails: admin pages in this batch have no text under 12px, and their decision calls are unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pages = ['applications', 'cases']
for (const p of pages) {
  const src = readFileSync(`app/admin/${p}/page.tsx`, 'utf8')
  assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${p}: no text under 12px`)
}

const apps = readFileSync('app/admin/applications/page.tsx', 'utf8')
assert.match(apps, /rpc\('admin_decide_application'/)
assert.match(apps, /rpc\('eb_admin_override_application'/)
assert.match(apps, /window\.confirm\(confirmText\)/)

const cases = readFileSync('app/admin/cases/page.tsx', 'utf8')
for (const fn of ['admin_review_legacy_decision', 'schedule_viewing', 'complete_viewing', 'cancel_viewing', 'record_signed_agreement', 'maintenance_action', 'admin_update_dispute', 'admin_review_settlement', 'admin_apply_renewal']) {
  assert.ok(cases.includes(`'${fn}'`), `cases: ${fn} call kept`)
}

console.log('admin-text-size-stage18e: ok')
