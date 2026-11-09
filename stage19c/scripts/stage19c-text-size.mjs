// Stage 19c, part 3: text under 12px becomes text-xs (12px) on public, tenant, landlord and inspector pages.
// Run once from the repo root:   node scripts/stage19c-text-size.mjs
// Safe to run twice. Only the class name changes. app/admin was done in Stage 18 and components/ui is skipped.
// Check badges and small chips on a phone afterwards: a few sit in fixed-size circles.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function files(dir) {
  if (['app/admin', 'components/ui'].includes(dir.replace(/\\/g, '/'))) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []
  })
}
let changed = 0, uses = 0
for (const file of [...files('app'), ...files('components')]) {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(/(?<![\w-])text-\[(?:8|9|10|11)px\]/g, () => { uses++; return 'text-xs' })
  if (after !== before) { writeFileSync(file, after); changed++; console.log(`updated ${file}`) }
}
console.log(`\n${changed} files updated, ${uses} uses changed to text-xs.`)
