import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/unit-numbering.ts')

// single house
let r = m.buildUnits({ kind: 'single_house' })
assert.equal(r.units.length, 1)
assert.equal(r.units[0].unit_label, '1')

// block of flats: 10 floors x 4
r = m.buildUnits({ kind: 'block', floors: 10, perFloor: 4 })
assert.equal(r.error, null)
assert.equal(r.units.length, 40)
assert.equal(r.units[0].unit_label, '10A')
assert.equal(r.units[39].unit_label, '1D')
assert.equal(new Set(r.units.map((u) => u.unit_label)).size, 40)

// different flats per floor (top floor first in the preview)
r = m.buildUnits({ kind: 'block', floors: 3, floorCounts: [5, 5, 2] })
assert.equal(r.units.length, 12)
assert.deepEqual(r.units.filter((u) => u.floor_no === 3).map((u) => u.unit_label), ['3A', '3B'])
assert.equal(r.units.filter((u) => u.floor_no === 1).length, 5)

// estate of 40 duplexes with a street label
r = m.buildUnits({ kind: 'estate', count: 40, groupLabel: ' Phase 2 ' })
assert.equal(r.units.length, 40)
assert.equal(r.units[0].unit_label, '1')
assert.equal(r.units[39].unit_label, '40')
assert.equal(r.units[0].group_label, 'Phase 2')

// hostel rooms
assert.equal(m.buildUnits({ kind: 'hostel', count: 14 }).units.length, 14)

// refusals
assert.ok(m.buildUnits({ kind: 'block', floors: 0, perFloor: 4 }).error)
assert.ok(m.buildUnits({ kind: 'block', floors: 10, perFloor: 27 }).error)
assert.ok(m.buildUnits({ kind: 'block', floors: 61, perFloor: 1 }).error)
assert.ok(m.buildUnits({ kind: 'block', floors: 60, perFloor: 26 }).error) // 1560 units
assert.ok(m.buildUnits({ kind: 'block', floors: 3, floorCounts: [2, 0, 2] }).error)
assert.ok(m.buildUnits({ kind: 'estate', count: 301 }).error)
assert.ok(m.buildUnits({ kind: 'estate', count: 1.5 }).error)
assert.ok(m.buildUnits({ kind: 'estate' }).error)

// labels fit the database limit (1 to 20 characters)
r = m.buildUnits({ kind: 'block', floors: 60, perFloor: 5 })
assert.ok(r.units.every((u) => u.unit_label.length >= 1 && u.unit_label.length <= 20))

// floor words
assert.equal(m.floorWord(1), '1st')
assert.equal(m.floorWord(2), '2nd')
assert.equal(m.floorWord(3), '3rd')
assert.equal(m.floorWord(11), '11th')
assert.equal(m.floorWord(12), '12th')
assert.equal(m.floorWord(21), '21st')
assert.equal(m.floorWord(0), 'Ground')

console.log('unit-numbering: all checks passed')
