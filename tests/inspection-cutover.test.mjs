import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('app/admin/inspections/page.tsx', 'utf8')
assert.match(page, /admin_review_inspection_file/)
assert.match(page, /admin_request_inspection_supplement/)
assert.match(page, /admin_cancel_inspection_supplement/)
assert.match(page, /admin_waive_second_inspector/)
assert.match(page, /eb_inspection_approval_blockers/)
assert.match(page, /\/api\/admin\/inspection-evidence\/open/)
assert.match(page, /Legacy inspection — no file integrity hashes/)
assert.match(page, /never proof/)
assert.doesNotMatch(page, /assigned_at: new Date/)                  // server stamps assignment time
assert.doesNotMatch(page, /storage\.from\('inspection-files'\)/)    // new bucket is only reached through the server route

const sql = readFileSync('supabase/20261203_05_inspection_cutover.sql', 'utf8')
assert.match(sql, /revoke insert, delete, truncate on public\.property_inspections/)
assert.match(sql, /inspection_cutover_policy_backup/)
assert.match(sql, /cmd = 'ALL'/)
assert.doesNotMatch(sql, /revoke[^;]*update[^;]*property_inspections/i)  // admin summary edits keep working
assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ''), /inspection-files/)   // new bucket untouched (comments ignored)

console.log('inspection-cutover: all checks passed')
