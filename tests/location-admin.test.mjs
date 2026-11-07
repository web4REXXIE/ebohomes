import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/surroundings.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const a = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

// distance wording: straight line only, never a road, walking or driving claim
assert.equal(a.formatStraightLine(450), 'About 450 m (straight-line distance)')
assert.equal(a.formatStraightLine(250), 'About 250 m (straight-line distance)')
assert.equal(a.formatStraightLine(1250), 'About 1.25 km (straight-line distance)')
assert.equal(a.formatStraightLine(1000), 'About 1 km (straight-line distance)')
assert.equal(a.formatStraightLine(4), 'About 10 m (straight-line distance)')
assert.equal(a.formatStraightLine(null), null)
assert.equal(a.formatStraightLine(-5), null)
assert.equal(a.formatStraightLine(NaN), null)
assert.doesNotMatch(a.formatStraightLine(3000), /driv|walk|road|minute/i)

// labels never say "verified"
assert.equal(a.factProvenance('inspector', 'pending'), 'Inspector-reported · not yet reviewed')
assert.match(a.factProvenance('inspector', 'published', '2026-11-12T10:00:00Z'), /^Inspector-reported · reviewed by an administrator on /)
assert.equal(a.factProvenance('landlord', 'flagged'), 'Landlord-provided · flagged by an administrator')
for (const s of ['pending', 'published', 'flagged', 'withdrawn']) assert.doesNotMatch(a.factProvenance('inspector', s, '2026-11-12T10:00:00Z'), /verified/i)

// old information
const now = new Date('2026-11-07T00:00:00Z')
assert.equal(a.isStale('2025-10-01T00:00:00Z', 12, now), true)
assert.equal(a.isStale('2026-03-01T00:00:00Z', 12, now), false)
assert.equal(a.isStale(null, 12, now), false)

// safety and crime claims are flagged for the reviewer
assert.equal(a.looksLikeSafetyClaim('Very safe area, no crime'), true)
assert.equal(a.looksLikeSafetyClaim('There were robberies last year'), true)
assert.equal(a.looksLikeSafetyClaim('Gate and a guard post at the entrance'), false)
assert.equal(a.looksLikeSafetyClaim('The culture here is friendly'), false)

// pin range matches the database rule
assert.equal(a.pinInNigeria(6.32, 8.11), true)
assert.equal(a.pinInNigeria(0, 0), false)
assert.equal(a.pinInNigeria(51.5, -0.12), false)
assert.equal(a.pinInNigeria('x', 8), false)

// the allowed answers must match the database function exactly
const sql = readFileSync('supabase/20261204_02_surroundings_tables.sql', 'utf8')
const dbAnswers = new Map()
for (const m of sql.matchAll(/when '([a-z_]+)'\s+then p_ans (?:in \(([^)]*)\)|= '([a-z_]+)')/g)) {
  dbAnswers.set(m[1], (m[2] ? m[2].split(',').map((x) => x.trim().replace(/'/g, '')) : [m[3]]).sort())
}
assert.equal(dbAnswers.size, a.SURROUNDINGS_CATEGORIES.length)
for (const c of a.SURROUNDINGS_CATEGORIES) {
  assert.deepEqual(c.answers.map((x) => x.value).sort(), dbAnswers.get(c.key), `answers differ for ${c.key}`)
}
const dbTopics = sql.match(/topic in \(([^)]*)\)/)[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort()
assert.deepEqual(a.PHOTO_TOPICS.map((t) => t.value).sort(), dbTopics)

// admin pages call the real database actions and keep to the rules
const panel = readFileSync('components/admin-location-panel.tsx', 'utf8')
for (const fn of ['admin_listing_location_overview', 'admin_review_listing_location', 'admin_correct_listing_pin', 'admin_review_surroundings_fact', 'admin_correct_surroundings_fact']) assert.match(panel, new RegExp(fn))
assert.match(panel, /not proof/)
assert.doesNotMatch(panel, /\.from\('listings'\)\s*\.update/)         // pins change only through the audited action
const page = readFileSync('app/admin/surroundings/page.tsx', 'utf8')
assert.match(page, /admin_surroundings_stale/); assert.match(page, /admin_set_surroundings_stale_months/)
assert.match(readFileSync('app/admin/property-review/page.tsx', 'utf8'), /<AdminLocationPanel listingId=\{selected\.id\} \/>/)
assert.match(readFileSync('app/admin/layout.tsx', 'utf8'), /\/admin\/surroundings/)

console.log('location-admin: all checks passed')
