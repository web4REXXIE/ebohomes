import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const { isValidListingId } = await load('lib/listing-id.ts')

// Real listing ids (UUIDs), in any letter case
assert.equal(isValidListingId('123e4567-e89b-12d3-a456-426614174000'), true)
assert.equal(isValidListingId('123E4567-E89B-12D3-A456-426614174000'), true)

// Malformed links must be rejected before the database is asked
for (const bad of [
  '',
  'abc',
  '123',
  'undefined',
  'null',
  '123e4567-e89b-12d3-a456-42661417400',     // one character short
  '123e4567-e89b-12d3-a456-4266141740000',   // one character long
  '123e4567e89b12d3a456426614174000',        // no dashes
  '123e4567-e89b-12d3-a456-42661417400g',    // not hex
  ' 123e4567-e89b-12d3-a456-426614174000',   // leading space
  '123e4567-e89b-12d3-a456-426614174000 ',   // trailing space
  '123e4567-e89b-12d3-a456-426614174000/extra',
  "123e4567-e89b-12d3-a456-426614174000' or '1'='1",
]) {
  assert.equal(isValidListingId(bad), false, `should reject: ${JSON.stringify(bad)}`)
}

// Not strings at all
for (const bad of [null, undefined, 42, {}, [], ['123e4567-e89b-12d3-a456-426614174000']]) {
  assert.equal(isValidListingId(bad), false)
}

console.log('listing-id tests passed')
