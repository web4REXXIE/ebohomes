// Stage 19b, part 2: public, tenant and landlord pages stop using fixed palette colours that break in dark mode.
// Run once from the repo root, after part 1:
//   node scripts/stage19b-colours.mjs
// Safe to run twice. It only renames Tailwind colour classes (see scripts/lib/colour-map.mjs). It never touches
// text, handlers, data calls or logic. app/admin was done in Stage 18 and components/ui is the base kit: both skipped.
// Use `git diff` to review, and `git checkout -- app components` to undo.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapColours } from './lib/colour-map.mjs'

const SKIP = new Set(['app/admin', 'components/ui'].map((p) => p.replace(/\//g, '/')))
function files(dir) {
  const norm = dir.replace(/\\/g, '/')
  if (SKIP.has(norm)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []
  })
}

let changed = 0
const left = {}
for (const file of [...files('app'), ...files('components')]) {
  const before = readFileSync(file, 'utf8')
  const after = mapColours(before)
  if (after !== before) { writeFileSync(file, after); changed++; console.log(`updated ${file}`) }
  for (const m of after.matchAll(/(?<![\w-])(?:bg|text|border|from|to|via|ring|outline|shadow)-(?:amber|emerald|red|green|sky|slate|gray|blue|yellow|orange|rose|purple|indigo|zinc|neutral|stone|teal|cyan|pink|violet|lime)-\d{2,3}(?:\/\d+)?/g)) {
    left[m[0]] = (left[m[0]] ?? 0) + 1
  }
}
console.log(`\n${changed} files updated.`)
const rest = Object.entries(left).sort((a, b) => b[1] - a[1])
console.log(`Fixed colours left on purpose (${rest.reduce((n, [, c]) => n + c, 0)} uses; mostly gold accents and solid buttons on dark surfaces):`)
for (const [k, c] of rest) console.log(`  ${c}\t${k}`)
