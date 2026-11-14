import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const m = await load('lib/estate-view.ts')

const u = (label, floor, status = 'available', listing = null, group = null) => ({ id: label, unit_label: label, floor_no: floor, group_label: group, status, listing_id: listing })
const live = new Set(['L1', 'L2'])

// to let needs: available + a live listing
assert.equal(m.unitState(u('8B', 8, 'available', 'L1'), live), 'to_let')
assert.equal(m.unitState(u('8C', 8, 'available', 'L9'), live), 'unavailable', 'listing not live')
assert.equal(m.unitState(u('8D', 8, 'available', null), live), 'unavailable', 'no listing yet')
assert.equal(m.unitState(u('8A', 8, 'rented', 'L1'), live), 'unavailable')
assert.equal(m.unitState(u('7A', 7, 'reserved', 'L1'), live), 'unavailable')
assert.equal(m.unitState(u('7B', 7, 'off_market', 'L1'), live), 'unavailable')

// block: top floor first, units in natural order
const block = [u('2B', 2), u('10A', 10), u('2A', 2), u('1A', 1), u('10B', 10)]
const g = m.groupUnits(block)
assert.deepEqual(g.map((x) => x.title), ['10th floor', '2nd floor', '1st floor'])
assert.deepEqual(g[0].units.map((x) => x.unit_label), ['10A', '10B'])
assert.deepEqual(g[1].units.map((x) => x.unit_label), ['2A', '2B'])

// estate: numbers 1..40 sort naturally, one plain group
const est = Array.from({ length: 12 }, (_, i) => u(String(12 - i), null))
const e = m.groupUnits(est)
assert.equal(e.length, 1)
assert.equal(e[0].title, 'Units')
assert.deepEqual(e[0].units.map((x) => x.unit_label).slice(0, 3), ['1', '2', '3'])
assert.equal(e[0].units[11].unit_label, '12')

// estate with phases
const ph = m.groupUnits([u('3', null, 'available', null, 'Phase 2'), u('1', null, 'available', null, 'Phase 1'), u('2', null, 'available', null, 'Phase 1')])
assert.deepEqual(ph.map((x) => x.title), ['Phase 1', 'Phase 2'])

// ground floor and counts
assert.equal(m.groupUnits([u('A1', 0)])[0].title, 'Ground floor')
assert.equal(m.countToLet([u('8B', 8, 'available', 'L1'), u('8C', 8, 'rented', 'L2'), u('8D', 8)], live), 1)

console.log('estate-view: all checks passed')
