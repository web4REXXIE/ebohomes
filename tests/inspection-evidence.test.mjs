import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/inspection-evidence.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

const U = '11111111-1111-4111-8111-111111111111', J = '22222222-2222-4222-8222-222222222222', F = '33333333-3333-4333-8333-333333333333'
const MB = 1024 * 1024

// kinds and limits (decision 5)
assert.equal(a.kindForMime('image/jpeg'), 'photo')
assert.equal(a.kindForMime('video/webm'), 'video')
assert.equal(a.kindForMime('video/quicktime'), null)
assert.equal(a.kindForMime('application/pdf'), null)
assert.equal(a.validateInspectionFileMeta('image/png', 10 * MB), null)
assert.ok(a.validateInspectionFileMeta('image/png', 10 * MB + 1))
assert.equal(a.validateInspectionFileMeta('video/mp4', 100 * MB), null)
assert.ok(a.validateInspectionFileMeta('video/mp4', 100 * MB + 1))
assert.ok(a.validateInspectionFileMeta('image/jpeg', 0))
assert.ok(a.validateInspectionFileMeta('image/jpeg', NaN))
assert.ok(a.validateInspectionFileMeta('image/gif', 100))
assert.match(a.validateInspectionFileMeta('video/quicktime', 1000), /Most Compatible/)

// real content check (magic bytes)
const B = (...n) => new Uint8Array(n)
const pad = (arr, len = 16) => { const o = new Uint8Array(len); o.set(arr); return o }
assert.equal(a.sniffInspectionMime(B(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
assert.equal(a.sniffInspectionMime(B(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png')
assert.equal(a.sniffInspectionMime(B(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'image/webp')
assert.equal(a.sniffInspectionMime(B(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20)), null) // AVI is not WebP
assert.equal(a.sniffInspectionMime(B(0x1a, 0x45, 0xdf, 0xa3, 1, 2)), 'video/webm')
assert.equal(a.sniffInspectionMime(pad([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])), 'video/mp4')
assert.equal(a.sniffInspectionMime(pad([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])), null) // Apple .mov brand
assert.equal(a.sniffInspectionMime(B(0x25, 0x50, 0x44, 0x46, 0x2d)), null) // a PDF is not inspection evidence
assert.equal(a.sniffInspectionMime(B(0x3c, 0x68, 0x74, 0x6d, 0x6c)), null) // HTML pretending to be an image
assert.equal(a.sniffInspectionMime(B()), null)
assert.equal(a.sniffInspectionMime(B(0xff, 0xd8)), null) // too short

// capture method is only what the device says
assert.equal(a.normaliseCaptureMethod('camera'), 'camera')
assert.equal(a.normaliseCaptureMethod('gallery'), 'gallery')
assert.equal(a.normaliseCaptureMethod('hacked'), 'unknown')
assert.equal(a.normaliseCaptureMethod(undefined), 'unknown')

// paths: must match the SQL prefix check <user>/<job>/
const p = a.inspectionPathFor(U, J, 'video/mp4', F)
assert.equal(p, `${U}/${J}/${F}.mp4`)
assert.equal(a.isValidInspectionPath(p, U, J), true)
assert.equal(a.isValidInspectionPath(p, J, J), false)
assert.equal(a.isValidInspectionPath(p, U, U), false)
assert.equal(a.isValidInspectionPath(`${U}/${J}/../x.jpg`, U, J), false)
assert.equal(a.isValidInspectionPath(`${U}/${J}/${F}.exe`, U, J), false)
assert.equal(a.isValidInspectionPath(`${U}/${J}/${F}.pdf`, U, J), false)
assert.equal(a.isValidInspectionPath(`${U}/${J}/x/${F}.jpg`, U, J), false)

// errors: plain database messages pass, internals do not
assert.equal(a.friendlyInspectionError('This inspection is not assigned to you.'), 'This inspection is not assigned to you.')
assert.equal(a.friendlyInspectionError('You already added this exact file.'), 'You already added this exact file.')
assert.equal(a.friendlyInspectionError('duplicate key value violates unique constraint "x"'), 'Something went wrong. Please try again.')
assert.equal(a.friendlyInspectionError(null), 'Something went wrong. Please try again.')

// route guards (source text)
const prepare = readFileSync('app/api/inspection-evidence/prepare/route.ts', 'utf8')
const register = readFileSync('app/api/inspection-evidence/register/route.ts', 'utf8')
const discard = readFileSync('app/api/inspection-evidence/discard/route.ts', 'utf8')
const open = readFileSync('app/api/admin/inspection-evidence/open/route.ts', 'utf8')
assert.match(prepare, /authUser\(req\)/); assert.match(prepare, /inspector_id !== user\.id/); assert.match(prepare, /job\.status !== 'assigned'/)
assert.match(register, /authUser\(req\)/); assert.match(register, /sniffInspectionMime/); assert.match(register, /createHash\('sha256'\)/)
assert.match(register, /eb_inspection_register_file/); assert.match(register, /eb_inspection_register_supplement_file/)
assert.match(register, /p_user: user\.id/)                       // the user comes from the token, never from the body
assert.doesNotMatch(register, /body\??\.(user|uploader|sha256|hash|mime_type)/)  // client cannot supply identity or hash
assert.match(discard, /eb_inspection_discard_file/); assert.match(discard, /p_user: user\.id/)
assert.match(open, /authAdmin\(req\)/); assert.match(open, /eb_inspection_log_open/); assert.match(open, /p_admin: a\.user\.id/)
assert.ok(open.indexOf('eb_inspection_log_open') < open.indexOf('createSignedUrl'))  // logged before any link exists
for (const src of [prepare, register, discard, open]) assert.doesNotMatch(src, /getPublicUrl|public: true/)

// bucket sql
const sql = readFileSync('supabase/20261203_04_inspection_files_bucket.sql', 'utf8')
assert.match(sql, /public = false/); assert.match(sql, /104857600/); assert.doesNotMatch(sql, /create policy/i)
console.log('inspection-evidence: all checks passed')
