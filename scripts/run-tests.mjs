// Runs every plain-Node test file in tests/ one by one and reports a summary.
// No dependencies. Works on Windows, macOS and Linux and on any Node version Next.js 16 supports.
// Exit code is 1 if any test file fails, so CI and "pnpm test" can rely on it.
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const dir = 'tests'
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
const failed = []

for (const f of files) {
  const r = spawnSync(process.execPath, [join(dir, f)], { encoding: 'utf8' })
  if (r.status === 0) {
    console.log(`PASS  ${f}`)
  } else {
    failed.push(f)
    console.log(`FAIL  ${f}`)
    console.log(((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(0, 15).map((l) => '      ' + l).join('\n'))
  }
}

console.log(`\n${files.length - failed.length} of ${files.length} test files passed.`)
if (failed.length) {
  console.log('Failed: ' + failed.join(', '))
  process.exit(1)
}