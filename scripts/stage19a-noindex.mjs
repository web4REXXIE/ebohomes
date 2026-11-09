// Stage 19a: adds robots noindex metadata to the private route folders. Run once from the repo root:
//   node scripts/stage19a-noindex.mjs
// Safe to run twice. It works on whatever the layouts look like now:
//   - no layout.tsx            -> creates a small server layout that exports the metadata
//   - server layout, no robots -> adds the import and the robots line (or a metadata export)
//   - client layout            -> left alone (a client file cannot export metadata). The X-Robots-Tag
//                                 header from next.config.mjs covers it.
// It never changes markup or logic. Use `git diff` to review.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PRIVATE_ROUTE_PREFIXES } from '../lib/private-routes.mjs'

const IMPORT_SEO = "import { PRIVATE_ROBOTS } from '@/lib/seo'"
const IMPORT_META = "import type { Metadata } from 'next'"
let created = 0, updated = 0, skipped = 0

function addImports(src, lines) {
  const need = lines.filter((l) => !src.includes(l.split(' from ')[0].replace('import type', 'import')) || !src.includes(l.split(' from ')[1]))
  if (!need.length) return src
  const all = [...src.matchAll(/^import .*$/gm)]
  if (!all.length) return need.join('\n') + '\n\n' + src
  const last = all[all.length - 1]
  const at = last.index + last[0].length
  return src.slice(0, at) + '\n' + need.join('\n') + src.slice(at)
}

for (const prefix of PRIVATE_ROUTE_PREFIXES) {
  const dir = `app${prefix}`
  if (!existsSync(dir)) { console.log(`no folder, skipped: ${dir}`); skipped++; continue }
  const file = `${dir}/layout.tsx`

  if (!existsSync(file)) {
    writeFileSync(file, `${IMPORT_META}\n${IMPORT_SEO}\n\n// Stage 19a: keeps this private page out of search results. Markup is unchanged.\nexport const metadata: Metadata = { robots: PRIVATE_ROBOTS }\n\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <>{children}</>\n}\n`)
    console.log(`created ${file}`); created++; continue
  }

  let src = readFileSync(file, 'utf8')
  if (/^['"]use client['"]/m.test(src)) { console.log(`client layout, covered by the header: ${file}`); skipped++; continue }
  if (/PRIVATE_ROBOTS/.test(src)) { skipped++; continue }
  if (/robots\s*:/.test(src)) { console.log(`already sets its own robots, review by hand: ${file}`); skipped++; continue }

  const meta = /export const metadata(?::\s*Metadata)?\s*=\s*\{/
  if (meta.test(src)) {
    src = src.replace(meta, (m) => `${m}\n  robots: PRIVATE_ROBOTS,`)
    src = addImports(src, [IMPORT_SEO])
  } else if (/generateMetadata/.test(src)) {
    console.log(`has generateMetadata, review by hand: ${file}`); skipped++; continue
  } else {
    src = addImports(src, [IMPORT_META, IMPORT_SEO])
    // put the export just before the default export
    src = src.replace(/\nexport default /, `\n// Stage 19a: keeps this private page out of search results.\nexport const metadata: Metadata = { robots: PRIVATE_ROBOTS }\n\nexport default `)
  }
  writeFileSync(file, src)
  console.log(`updated ${file}`); updated++
}
console.log(`\n${created} created, ${updated} updated, ${skipped} left alone.`)
