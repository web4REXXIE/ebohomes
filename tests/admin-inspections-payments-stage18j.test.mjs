// Stage 18j guard rails: the inspection pages and the payments page use the shared admin patterns,
// and every decision, refund, payout and budget action behind them is unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(`app/admin/${p}/page.tsx`, 'utf8')
const pages = ['inspections', 'remote-inspections', 'remote-inspection-reviews', 'remote-inspection-disputes', 'payments']
for (const p of pages) {
  const src = read(p)
  assert.match(src, /from '@\/components\/admin-ui'/, `${p}: shared patterns`)
  assert.match(src, /<AdminPageHeader/, `${p}: page header`)
  assert.doesNotMatch(src, /(amber|emerald|red|sky|slate)-\d{2,3}/, `${p}: no fixed colours`)
  assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, `${p}: no tiny text`)
  assert.doesNotMatch(src, /<Loader2 className="animate-spin[^>]*\/>\s*<\/div>\s*$/m, `${p}: loading uses the shared state`)
  assert.doesNotMatch(src, /window\.confirm\(|alert\(/, `${p}: no browser pop-ups`)
  assert.ok(src.trimEnd().endsWith('}'), `${p}: file is complete`)
}

// Payments: status is text plus an icon, failed loads can be retried, Reject keeps its reason rules.
const pay = read('payments')
assert.match(pay, /<StatusChip state=\{STATE\[state\]\}>/)
assert.match(pay, /<ErrorState message=\{`Could not load payments: \$\{loadError\}`\} onRetry=\{loadPayments\}/)
assert.match(pay, /review\(p\.id, 'rejected', why\)/)
assert.match(pay, /await confirm\(/)

// Inspections: decision calls and the budget split are unchanged.
const insp = read('inspections')
assert.match(insp, /aria-pressed=\{tab === t\}/)
assert.match(insp, /Only a PASS inspection can be approved\./)
assert.match(insp, /You cannot review your own inspection\./)
assert.match(insp, /Write the public summary before approving\./)
assert.match(insp, /never for passing a property/)

// Remote inspections stay free to tenants and separate from the verification budget.
const rem = read('remote-inspections')
assert.match(rem, /Free to tenants, private reports, never a verification badge/)
assert.doesNotMatch(rem, /verification_budget|admin_verification_add_budget/, 'remote page does not touch the verification budget')
const rev = read('remote-inspection-reviews')
assert.match(rev, /Landlords never see the report/)
assert.match(read('remote-inspection-disputes'), /Nothing is charged to a tenant/)

// Every placeholder-only field has an accessible name.
for (const p of pages) {
  const src = read(p)
  const bad = (src.match(/<(?:input|textarea)\b[^>]*placeholder="[^"]+"[^>]*>/g) ?? []).filter((t) => !/aria-label=|id=/.test(t))
  assert.equal(bad.length, 0, `${p}: ${bad.length} field(s) with a placeholder but no label`)
}

console.log('admin-inspections-payments-stage18j: ok')
