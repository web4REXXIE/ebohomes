import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// No page or component may ask the listings table for every column or for the exact pin. The database refuses it after 20261204_07.
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}
const files = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => !f.startsWith(join('app', 'api')))
const bad = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\.from\('listings'\)([\s\S]{0,400}?)\.(select|insert|update|delete)\(/g)) {
    if (m[2] !== 'select') continue
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 500)
    const arg = after.slice(0, after.indexOf(')\n') > 0 ? after.indexOf(')\n') : 300)
    if (/^\s*(['"`])\s*\*/.test(arg) || /^\s*\)/.test(after)) bad.push(`${f}: select of every listing column`)
    if (/\blat\b|\blng\b/.test(arg)) bad.push(`${f}: reads lat or lng from listings`)
  }
}
assert.deepEqual(bad, [], 'These pages would fail once the exact pin is hidden:\n' + bad.join('\n'))

// the owner pages use the shared column list, and the edit page reads the owner pin through the gated function
const cols = readFileSync('lib/listing-columns.ts', 'utf8')
assert.doesNotMatch(cols.replace(/\/\/.*$/gm, ''), /\blat\b|\blng\b/)
for (const f of ['app/dashboard/page.tsx', 'app/dashboard/listings/page.tsx', 'components/signed-in-home.tsx']) assert.match(readFileSync(f, 'utf8'), /OWNER_LISTING_COLUMNS/)
assert.match(readFileSync('app/dashboard/edit/[id]/page.tsx', 'utf8'), /listing_exact_location/)

// the migration hides only lat and lng and regrants the rest
const sql = readFileSync('supabase/20261204_07_hide_exact_pin_columns.sql', 'utf8')
assert.match(sql, /revoke select on public\.listings from anon, authenticated/)
assert.match(sql, /attname not in \('lat', 'lng'\)/)
assert.match(sql, /grant select \(%s\) on public\.listings/)

console.log('location-private: all checks passed')
