import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/listing-authority.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

// per-document status wording for the lister
assert.equal(a.documentStatusInfo('accepted').label, 'Accepted')
assert.equal(a.documentStatusInfo('rejected').tone, 'bad')
assert.equal(a.documentStatusInfo('more_evidence_requested').tone, 'warn')
assert.equal(a.documentStatusInfo('superseded').label, 'Replaced by a newer version')
assert.equal(a.documentStatusInfo('withdrawn').label, 'Withdrawn')
assert.equal(a.documentStatusInfo('pending_review').label, 'Waiting for review')
assert.equal(a.documentStatusInfo(undefined).label, 'Waiting for review')
assert.equal(a.needsDescription('other_supporting_document'), true)
assert.equal(a.needsDescription('tenancy_agreement'), false)

// a replaced (withdrawn) document never counts as active evidence
assert.deepEqual(
  a.missingForClaim({ role: 'agent', ownerName: 'A', ownerPhone: '1' }, [{ doc_type: 'signed_authorization_letter', withdrawn_at: '2026-01-01' }]),
  ['At least one supporting document', 'Signed authorization letter from the owner'])
assert.deepEqual(
  a.missingForClaim({ role: 'agent', ownerName: 'A', ownerPhone: '1' }, [{ doc_type: 'signed_authorization_letter', withdrawn_at: '2026-01-01' }, { doc_type: 'signed_authorization_letter' }]), [])

// route wiring
const rd = (f) => readFileSync(f, 'utf8')
const docs = rd('app/api/listing-authority/documents/route.ts')
assert.match(docs, /p_supersedes: supersedes, p_description: description/)
assert.match(docs, /UUID_RE\.test\(supersedes\)/)
assert.ok(docs.indexOf('sniffAuthorityMime(buf)') < docs.indexOf("rpc('eb_authority_add_document'"))
const land = rd('app/dashboard/authority/[id]/page.tsx')
assert.match(land, /supersedes_id: supersedesId/)
assert.match(land, /Replace document/)
const admin = rd('app/admin/listing-authority/page.tsx')
assert.match(admin, /p_landlord_reason: docReason/)
console.log('authority-versioning: all passed')
