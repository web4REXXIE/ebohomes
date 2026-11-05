import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const load = async (f) => {
  const js = transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const v = await load('lib/verification-files.ts')

// flag: only the exact string 'true' enables deletion
for (const off of [undefined, null, '', 'false', 'TRUE', 'True', '1', 'yes', ' true', 'true ']) {
  assert.equal(v.identityDeletionEnabled(off), false, `should be off for ${JSON.stringify(off)}`)
}
assert.equal(v.identityDeletionEnabled('true'), true)

const files = ['govid-1700000000000-a.jpg', 'selfie-1700000000001-b.jpg']

// DISABLED: nothing is removed, candidates are reported
const d = v.planIdentityCleanup(files, false)
assert.deepEqual(d, { remove: [], paused: true, candidates: 2 })

// ENABLED: existing behaviour, every candidate is removed
const e = v.planIdentityCleanup(files, true)
assert.deepEqual(e.remove, files)
assert.equal(e.paused, false)
assert.equal(e.candidates, 2)

// no candidates: never "paused", nothing removed, either state
assert.deepEqual(v.planIdentityCleanup([], false), { remove: [], paused: false, candidates: 0 })
assert.deepEqual(v.planIdentityCleanup([], true), { remove: [], paused: false, candidates: 0 })

// the plan never aliases or mutates the input list
const input = [...files]; v.planIdentityCleanup(input, true).remove.pop(); assert.deepEqual(input, files)

// candidate selection is unchanged: recent, referenced and non-identity files are never candidates
const now = 1700000000000 + 10 * 3600_000
assert.deepEqual(v.orphanedIdentityFiles(['govid-1700000000000-a.jpg', 'listing-1700000000000-x.pdf', 'selfie-1700000000001-b.jpg'], ['u/selfie-1700000000001-b.jpg'], now), ['govid-1700000000000-a.jpg'])
assert.deepEqual(v.orphanedIdentityFiles(['govid-1700000000000-a.jpg'], [], 1700000000000 + 3600_000), [])

// route wiring: auth kept, flag read per request, remove() only fed from the plan
const route = readFileSync('app/api/verification-files/cleanup/route.ts', 'utf8')
assert.match(route, /authUser\(req\)/)
assert.match(route, /Sign in first\./)
assert.match(route, /process\.env\.EB_ALLOW_IDENTITY_FILE_DELETION/)
assert.match(route, /paused: true, candidates: plan\.candidates/)
assert.match(route, /\.remove\(plan\.remove\.map/)
assert.equal((route.match(/\.remove\(/g) ?? []).length, 1)
assert.ok(route.indexOf('plan.paused') < route.indexOf('.remove('), 'paused check must come before remove')
console.log('verification-cleanup-flag: all passed')
