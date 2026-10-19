import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const p = await load('lib/property-display.ts')

// Real titles are kept
assert.equal(p.displayTitle({ title: 'Modern House', property_type: 'duplex', location_text: 'Mbukobe' }), 'Modern House')
assert.equal(p.displayTitle({ title: '  5 bed Duplex in Hausa quters ' }), '5 bed Duplex in Hausa quters')

// Raw links, blanks and the word "Property" fall back to real data
assert.equal(p.displayTitle({ title: 'https://ebohomes.vercel.app/', property_type: 'duplex', location_text: 'Abakaliki', bedrooms: 4 }), '4 bed Duplex in Abakaliki')
assert.equal(p.displayTitle({ title: '', property_type: 'flat', location_text: 'Nkaliki' }), 'Flat in Nkaliki')
assert.equal(p.displayTitle({ title: null, property_type: 'self_contain', location_text: 'Mgbo' }), 'Self contain in Mgbo')
assert.equal(p.displayTitle({ title: 'Property', location_text: 'Mbukobe' }), 'Property in Mbukobe')
assert.equal(p.displayTitle({ title: 'www.ebohomes.com/x', property_type: 'duplex' }), 'Duplex')
assert.equal(p.displayTitle({ title: '' }), 'Property')
assert.equal(p.displayTitle(null), 'Property')

// Live means approved only
assert.equal(p.listingIsLive('approved'), true)
for (const s of ['pending', 'paused', 'rejected', 'suspended', 'inspection_required', null, undefined]) {
  assert.equal(p.listingIsLive(s), false)
}
console.log('property-display tests passed')