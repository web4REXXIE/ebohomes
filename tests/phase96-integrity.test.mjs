import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const read = (p) => readFileSync(p, 'utf8')

// ---- repository layout: migrations live directly in supabase/, with clean names
assert.equal(existsSync('supabase/supabase'), false, 'no nested supabase/supabase folder')
assert.equal(existsSync('supabase/20261120_01_trust_operations.sql'), true, '9.5 migration is in supabase/')
const bad = readdirSync('supabase').filter((f) => /\.sql$/.test(f) === false && /^\d{8}_/.test(f) && !f.endsWith('.DRAFT'))
assert.deepEqual(bad, [], 'migration files must end exactly in .sql (no stray characters): ' + bad.join(', '))

// ---- the 9.6 migration (text checks only; real behaviour needs a database)
const sql = read('supabase/20261121_01_phase96_integrity.sql')
assert.match(sql, /^begin;/m)
assert.match(sql, /^commit;/m)
assert.match(sql, /ROLLBACK:/)
for (const t of [
  'a00_profiles_trust_fields_guard',
  'a10_profiles_reverify_on_identity_change',
  'a00_listings_trust_fields_guard',
  'zz_listings_status_audit',
  'aa_verification_file_history_guard',
]) assert.ok(sql.includes(t), 'migration creates ' + t)

// it must not change or delete any existing data
const live = sql.split('-- CHECK (read only')[0]
assert.doesNotMatch(live, /\bdelete\s+from\b/i)
assert.doesNotMatch(live, /\btruncate\b/i)
assert.doesNotMatch(live, /\bdrop\s+table\b/i)
for (const table of ['applications', 'tenancies', 'payments', 'property_holds', 'property_inspections', 'listing_authority_documents']) {
  assert.doesNotMatch(live, new RegExp('update\\s+public\\.' + table + '\\b', 'i'), 'migration does not update ' + table)
}
assert.doesNotMatch(live, /set\s+authority_status/i, 'migration never changes authority_status')

// profiles guard: role, verified, status, rejection_reason are locked; user may only go to pending
assert.match(live, /locked text\[\] := array\['role','verified','status','rejection_reason'\]/)
assert.match(live, /<> 'pending'/)
assert.match(live, /auth\.uid\(\) is null or public\.eb_is_admin\(\)/)
assert.match(live, /watched text\[\] := array\['full_name','business_name','business_address','cac_number'\]/)

// listings guard: admin-owned fields locked, new listings start pending, resume needs a prior admin approval
for (const f of ['featured', 'reviewed_by', 'reviewed_at', 'suspended_at', 'suspension_reason', 'rejection_reason']) {
  assert.ok(live.includes("'" + f + "'"), 'listings guard locks ' + f)
}
assert.match(live, /new\.status := 'pending'/)
assert.match(live, /old\.status = 'paused' and new\.status = 'approved'[\s\S]*?old\.reviewed_at is not null[\s\S]*?old\.authority_status = 'accepted'/)
assert.doesNotMatch(live, /old\.status = 'rejected' and new\.status = '(paused|approved)'/)

// admin_review_listing: locked, stale-safe, no self review, reasons, reinstate goes to review only
const fn = live.slice(live.indexOf('function public.admin_review_listing'), live.indexOf('-- Audit every status change'))
assert.match(fn, /for update/)
assert.match(fn, /eb_is_admin\(\)/)
assert.match(fn, /l\.landlord_id = auth\.uid\(\)/)
assert.match(fn, /40001/)
assert.match(fn, /'rented'/)
assert.match(fn, /length\(v_reason\) < 5/)
assert.match(fn, /set status = 'pending', suspension_reason = null, suspended_at = null/)
assert.match(fn, /exception when others then null/, 'audit failure does not block the decision')
assert.match(live, /revoke all on function public\.admin_review_listing\(uuid, text, text, text\) from public, anon/)

// ---- Property Review page: no direct status writes from the browser
const page = read('app/admin/property-review/page.tsx')
assert.ok(page.includes("supabase.rpc('admin_review_listing'"))
assert.doesNotMatch(page, /\.from\('listings'\)\s*\.update\(\{\s*status/)
assert.doesNotMatch(page, /status:\s*'approved',\s*\n\s*reviewed_by/)
assert.ok(page.includes('p_expected_status'), 'page sends the status the admin was looking at')

// ---- cleanup: history counts as evidence, and the flag is still default-off
const lib = transpileModule(read('lib/verification-files.ts'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const v = await import('data:text/javascript;base64,' + Buffer.from(lib).toString('base64'))
assert.deepEqual(v.pathsFromHistory(null), [])
assert.deepEqual(v.pathsFromHistory([{ id_document_url: 'u/govid-1700000000000-a.jpg', selfie_url: null, ownership_doc_url: '' }]), ['u/govid-1700000000000-a.jpg'])
assert.equal(v.pathsFromHistory([{ selfie_url: 'u/selfie-1700000000001-b.jpg' }, { id_document_url: 'u/govid-1700000000002-c.jpg' }]).length, 2)
const old = 'govid-1700000000000-a.jpg'
assert.deepEqual(v.orphanedIdentityFiles([old], [], Date.now()), [old], 'an unreferenced old file is a candidate')
assert.deepEqual(v.orphanedIdentityFiles([old], v.pathsFromHistory([{ id_document_url: 'u/' + old }]), Date.now()), [], 'a file in history is kept')
assert.equal(v.identityDeletionEnabled(undefined), false)
assert.equal(v.identityDeletionEnabled('TRUE'), false)
assert.equal(v.identityDeletionEnabled('true'), true)

const route = read('app/api/verification-files/cleanup/route.ts')
assert.ok(route.includes('landlord_verification_file_history'))
assert.ok(route.includes('pathsFromHistory(hist)'))
assert.match(route, /histErr \|\| count === null \|\| \(hist \?\? \[\]\)\.length < count/, 'unreadable or partial history deletes nothing')

console.log('phase96-integrity: all assertions passed')
