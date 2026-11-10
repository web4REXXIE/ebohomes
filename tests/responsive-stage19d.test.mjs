// Stage 19d guard rails: the responsive fixes stay in place. Reads source only. No browser.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync('app/globals.css', 'utf8')
assert.match(css, /Stage 19d: responsive/)
assert.match(css, /@supports \(height: 100dvh\)\s*\{[^}]*\.min-h-screen \{ min-height: 100dvh; \}/, 'min-h-screen follows the visible height')
assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height: 44px[\s\S]*min-width: 44px/, 'touch screens get 44px targets')
assert.match(css, /max-width: 767px\)[\s\S]*font-size: 16px/, 'phone inputs stay at 16px (no iPhone zoom)')

// Centred dialogs scroll on short screens.
for (const f of ['create-tenancy-modal', 'record-payment-modal', 'report-listing-modal', 'share-button']) {
  assert.match(readFileSync(`components/${f}.tsx`, 'utf8'), /role="dialog"[^>]*max-h-\[90dvh\] overflow-y-auto/, `${f}: dialog scrolls on short screens`)
}
assert.match(readFileSync('app/admin/messages/page.tsx', 'utf8'), /max-h-\[90dvh\] overflow-y-auto shadow-xl/)

// No viewport-height units that ignore the browser bar, and no unbreakable three-up money rows.
function tsx(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? tsx(p) : p.endsWith('.tsx') ? [p] : []
  })
}
for (const f of [...tsx('app'), ...tsx('components')]) {
  const src = readFileSync(f, 'utf8')
  assert.doesNotMatch(src, /(?<![:\w-])(?:max-h-\[\d+vh\]|h-\[calc\(100vh-[\d.]+rem\)\])/, `${f}: use dvh, not vh, for a phone-height panel (lg: and md: values are fine)`)
}
for (const f of ['app/admin/cases/page.tsx', 'app/dashboard/analytics/page.tsx']) {
  assert.doesNotMatch(readFileSync(f, 'utf8'), /<dl className="grid grid-cols-3 /, `${f}: money row stacks on narrow phones`)
}
// Every page still declares the phone viewport.
assert.match(readFileSync('app/layout.tsx', 'utf8'), /viewportFit: 'cover'/)

console.log('responsive-stage19d: ok')
