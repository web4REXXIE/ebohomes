import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/authority-evidence.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

const U = '11111111-1111-4111-8111-111111111111', L = '22222222-2222-4222-8222-222222222222', F = '33333333-3333-4333-8333-333333333333'
assert.equal(a.validateAuthorityFileMeta('application/pdf', 1000), null)
assert.ok(a.validateAuthorityFileMeta('text/html', 1000))
assert.ok(a.validateAuthorityFileMeta('image/png', 0))
assert.ok(a.validateAuthorityFileMeta('image/png', 11 * 1024 * 1024))
const p = a.authorityPathFor(U, L, 'image/jpeg', F)
assert.equal(p, `${U}/${L}/${F}.jpg`)
assert.equal(a.isValidAuthorityPath(p, U, L), true)
assert.equal(a.isValidAuthorityPath(p, L, L), false)
assert.equal(a.isValidAuthorityPath(`${U}/${L}/../x.pdf`, U, L), false)
assert.equal(a.isValidAuthorityPath(`${U}/${L}/${F}.exe`, U, L), false)
assert.equal(a.isAuthorityDocType('tenancy_agreement'), true)
assert.equal(a.isAuthorityDocType('anything'), false)
assert.equal(a.friendlyAuthorityError('Still needed: Owner full name'), 'Still needed: Owner full name')
assert.equal(a.friendlyAuthorityError('duplicate key value violates unique constraint "x"'), 'Something went wrong. Please try again.')
// real-content check (magic bytes)
const B = (...n) => new Uint8Array(n)
assert.equal(a.sniffAuthorityMime(B(0xff, 0xd8, 0xff, 0xe0, 0, 0)), 'image/jpeg')
assert.equal(a.sniffAuthorityMime(B(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'image/png')
assert.equal(a.sniffAuthorityMime(B(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)), 'image/webp')
assert.equal(a.sniffAuthorityMime(new TextEncoder().encode('%PDF-1.7\n...')), 'application/pdf')
assert.equal(a.sniffAuthorityMime(new TextEncoder().encode('xx%PDF-1.4')), 'application/pdf')
assert.equal(a.sniffAuthorityMime(new TextEncoder().encode('<html><script>alert(1)</script>')), null)
assert.equal(a.sniffAuthorityMime(new TextEncoder().encode('MZ\x90\x00 this is an exe')), null)
assert.equal(a.sniffAuthorityMime(B(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)), null)
assert.equal(a.sniffAuthorityMime(new Uint8Array(0)), null)
assert.equal(a.sniffAuthorityMime(B(0xff, 0xd8)), null)
assert.equal(a.MAX_AUTHORITY_FILES_PER_LISTING, 30)

// route wiring
const rd = (f) => readFileSync(f, 'utf8')
const docs = rd('app/api/listing-authority/documents/route.ts')
assert.match(docs, /sniffAuthorityMime\(buf\) !== mime/)
assert.ok(docs.indexOf('sniffAuthorityMime(buf)') < docs.indexOf("rpc('eb_authority_add_document'"))
assert.match(rd('app/api/listing-authority/prepare/route.ts'), /MAX_AUTHORITY_FILES_PER_LISTING/)
const open = rd('app/api/admin/listing-authority/document/route.ts')
assert.match(open, /You cannot open evidence for your own listing/)
assert.ok(open.indexOf('logErr') < open.lastIndexOf('return json({ url: data.signedUrl })'), 'log must be checked before the link is returned')
assert.ok(!/select\('\*'\)\.in\('id', seenIds\)/.test(rd('app/home/page.tsx')))
console.log('authority-evidence: all passed')
