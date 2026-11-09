// Stage 18g guard rails: the shared admin patterns are accessible, and the payouts page
// uses them without touching any payout action.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ui = readFileSync('components/admin-ui.tsx', 'utf8')
const lc = readFileSync('components/list-controls.tsx', 'utf8')
const po = readFileSync('app/admin/payouts/page.tsx', 'utf8')

// Status is text plus an icon, never colour alone.
assert.match(ui, /export function StatusChip/)
assert.match(ui, /<Icon size=\{12\} aria-hidden \/>\s*\{children\}/, 'chip shows an icon and a text label')
// Errors are announced and can be retried.
assert.match(ui, /role="alert"/)
assert.match(ui, /Try again/)
assert.match(ui, /role="status"/, 'loading is announced')
for (const src of [ui, lc]) assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, 'no text under 12px')
assert.doesNotMatch(ui, /(amber|emerald|red|sky|slate)-\d{2,3}/, 'admin-ui uses status tokens, not fixed colours')

// Search box has a real label; pagination is a labelled nav with 44px buttons.
assert.match(lc, /<label htmlFor=\{id\} className="sr-only">/)
assert.match(lc, /aria-label="Pagination"/)
assert.match(lc, /min-h-11/)

// Payouts page uses the shared pieces.
assert.match(po, /from '@\/components\/admin-ui'/)
assert.match(po, /from '@\/components\/list-controls'/)
assert.match(po, /<StatusChip state=/)
assert.doesNotMatch(po, /border-amber-300 bg-amber-50 text-amber-900/, 'old fixed-colour status map is gone')

// Payout actions and endpoints are unchanged.
for (const s of [
  "api(`/api/admin/payouts?filter=${filter}`)",
  "action: 'prepare'", "action: 'approve'", "action: 'cancel'", "action: 'paid'",
  "'/api/admin/payouts/proof'", 'validatePrepare', 'validatePaid', 'validateProofMeta',
]) assert.ok(po.includes(s), `payouts keeps ${s}`)

console.log('admin-patterns-stage18g: ok')
