import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const t = await load('lib/property-trust.ts')

// Identity: only an exact true counts
assert.equal(t.identityState({ identity_checked: true }), 'yes')
assert.equal(t.identityState({ identity_checked: false }), 'no')
assert.equal(t.identityState({ identity_checked: null }), 'no')
assert.equal(t.identityState({ identity_checked: 'true' }), 'no')
assert.equal(t.identityState({ identity_checked: 1 }), 'no')
assert.equal(t.identityState({}), 'no')

// Missing or failed data is "unavailable", never "not checked" and never "checked"
assert.equal(t.identityState(null), 'unavailable')
assert.equal(t.identityState(undefined), 'unavailable')
assert.equal(t.identityState('x'), 'unavailable')
assert.equal(t.identityState({ identity_checked: true }, true), 'unavailable')

// The inspected flag inside listing_trust is ignored
assert.equal(t.inspectionState(null), 'no')
assert.equal(t.inspectionState(undefined), 'no')
assert.equal(t.inspectionState({ inspected: true }), 'yes') // any record object means a qualifying public inspection row
assert.equal(t.inspectionState(null, true), 'unavailable')
assert.equal(t.inspectionState({ inspected_at: '2026-10-12T10:00:00Z' }, true), 'unavailable')
assert.equal(t.inspectionState('text'), 'no')

// Dates
assert.equal(t.formatInspectionDate('2026-10-12T10:00:00Z'), '12 October 2026')
assert.equal(t.formatInspectionDate('not a date'), '')
assert.equal(t.formatInspectionDate(null), '')
assert.equal(t.formatInspectionDate(12345), '')

// Details: blanks are dropped, order is kept, mismatches are kept
const d = t.inspectionDetails({
  road_condition: ' Tarred ',
  road_matches: true,
  water_source: '',
  water_matches: true,
  electricity_notes: 'Prepaid meter',
  electricity_matches: false,
  network_notes: null,
  security_notes: '   ',
  neighborhood_type: 'Residential',
  environment_notes: 'Quiet',
  environment_matches: true,
  overall_notes: '',
  condition_notes: 'Fair',
  condition_matches: null,
})
assert.deepEqual(d.facts.map((f) => f.key), ['road', 'electricity', 'neighbourhood'])
assert.equal(d.facts[0].value, 'Tarred')
assert.equal(d.facts[0].match, true)
assert.equal(d.facts[1].match, false)
assert.equal(d.facts[2].match, null)
assert.deepEqual(d.notes.map((n) => n.key), ['environment', 'condition'])
assert.equal(d.notes[1].value, 'Fair') // falls back to condition notes when the public summary is blank
assert.equal(t.inspectionDetails({ overall_notes: 'Reviewed summary', condition_notes: 'Fair' }).notes[0].value, 'Reviewed summary')
assert.deepEqual(t.inspectionDetails(null), { facts: [], notes: [] })
assert.deepEqual(t.inspectionDetails('x'), { facts: [], notes: [] })

// Nearby
assert.equal(t.nearbyText({ nearby_landmarks: ' Church ' }), 'Church')
assert.equal(t.nearbyText({ nearby_landmarks: null }), '')
assert.equal(t.nearbyText(null), '')

console.log('property-trust tests passed')
