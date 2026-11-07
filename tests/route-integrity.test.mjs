// Every relative import or re-export in a route or page must point at a real file, and never at the file itself.
// (This catches a file that was pasted into the wrong place and now re-exports itself.)
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\/(route\.ts|page\.tsx|layout\.tsx)$/.test(p.replace(/\\/g, '/'))) out.push(p)
  }
  return out
}
const candidates = (base) => [base, base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx'), join(base, 'route.ts'), join(base, 'page.tsx')]

const problems = []
for (const file of walk('app')) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]*)['"]/g)) {
    const target = candidates(resolve(dirname(file), m[1])).find((c) => existsSync(c) && statSync(c).isFile())
    if (!target) problems.push(`${file}: imports ${m[1]}, which does not exist`)
    else if (resolve(target) === resolve(file)) problems.push(`${file}: imports itself (${m[1]})`)
  }
}
assert.deepEqual(problems, [], problems.join('\n'))

// The Paystack webhook: one real handler, the old address only re-exports it.
const real = readFileSync('app/api/paystack/webhook/route.ts', 'utf8')
assert.match(real, /export async function POST/)
assert.match(real, /signatureValid\(/)
assert.match(real, /settleReference\(/)
const old = readFileSync('app/api/paystack/initialize/webhook/route.ts', 'utf8')
assert.match(old, /export \{ POST \} from '\.\.\/\.\.\/webhook\/route'/)

console.log('route-integrity: all checks passed')
