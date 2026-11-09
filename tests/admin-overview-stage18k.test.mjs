// Stage 18k guard rails: the admin overview counts. Every number comes from the same table or
// function the page it links to uses, and a count that fails shows a dash, never a zero.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const home = readFileSync('app/admin/page.tsx', 'utf8')

// The original five counts and their queries are unchanged.
assert.match(home, /\.eq\('status', 'pending'\)\.eq\('authority_status', 'accepted'\)/)
assert.match(home, /\.eq\('authority_status', 'submitted'\)/)
assert.match(home, /from\('risk_alerts'\)/)
assert.match(home, /from\('trust_cases'\)/)

// New counts use real status values found in the owning pages.
assert.match(home, /from\('property_inspections'\)[^)]*\)\.eq\('service_type', 'verification'\)\.eq\('review_status', 'submitted'\)/)
assert.match(home, /rpc\('admin_remote_queue'\)/)
assert.match(home, /r\.status === 'ready_for_assignment'/)
assert.match(home, /rpc\('admin_remote_review_queue'\)/)
assert.match(home, /from\('applications'\)[^)]*\)\.in\('status', \['pending', 'info_requested'\]\)/)
assert.match(home, /from\('payments'\)[^)]*\)\.in\('status', \['recorded', 'pending'\]\)/)
assert.match(home, /\/api\/admin\/payment-submissions\?filter=awaiting/)

// Overview only reads: no inserts, updates, deletes or timers, and no invented numbers.
assert.doesNotMatch(home, /\.(insert|update|delete|upsert)\(/)
assert.doesNotMatch(home, /admin_remote_run_timers/)
assert.match(home, /return error \? null : count \?\? 0/)
assert.match(home, /value=\{i\.count\}/)
assert.match(home, /Try again/)

// Every card links to a page that exists.
for (const h of [...home.matchAll(/href: '(\/admin[^'?]*)/g)].map((m) => m[1])) {
  assert.ok(existsSync(`app${h}/page.tsx`) || h === '/admin', `card links to a missing page: ${h}`)
}
assert.equal([...home.matchAll(/href: '\/admin/g)].length, 11, 'eleven counts')
for (const label of ['Properties and verification', 'Inspections', 'Applications and payments', 'Risk and cases']) assert.ok(home.includes(`heading: '${label}'`), label)

console.log('admin-overview-stage18k: ok')
