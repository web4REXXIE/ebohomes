// Stage 19d: responsive pass. Run once from the repo root:  node scripts/stage19d-responsive.mjs
// Safe to run twice. It only changes class names and adds one block to app/globals.css.
// No data calls, handlers or logic are touched. Use `git diff` to review.
import { readFileSync, writeFileSync } from 'node:fs'

const MARK = '/* Stage 19d: responsive */'
const CSS = `
${MARK}
/* 1. Phones: 100vh is taller than the visible screen while the browser bar is showing, which adds a needless scroll.
      dvh is the visible height. Browsers without dvh keep the old value. Unlayered, so it wins over the utility. */
@supports (height: 100dvh) {
  .min-h-screen { min-height: 100dvh; }
  .h-screen { height: 100dvh; }
  .max-h-screen { max-height: 100dvh; }
}

/* 2. Touch screens: small icon buttons and chips get a 44px tap area. Mouse and trackpad layouts are unchanged. */
@media (pointer: coarse) {
  :where(button, [role='button']):where(.h-6, .h-7, .h-8, .h-9, .h-10) { min-height: 44px; }
  :where(button, [role='button']):where(.w-6, .w-7, .w-8, .w-9, .w-10) { min-width: 44px; }
}
`

const EDITS = [
  // Centred dialogs: on a short screen (small phone, landscape, keyboard open) the panel scrolls instead of running off screen.
  ['components/create-tenancy-modal.tsx', 'p-5 w-full max-w-sm outline-none"', 'p-5 w-full max-w-sm max-h-[90dvh] overflow-y-auto outline-none"'],
  ['components/record-payment-modal.tsx', 'p-5 w-full max-w-sm outline-none"', 'p-5 w-full max-w-sm max-h-[90dvh] overflow-y-auto outline-none"'],
  ['components/report-listing-modal.tsx', 'w-full max-w-md p-5 relative outline-none"', 'w-full max-w-md p-5 relative max-h-[90dvh] overflow-y-auto outline-none"'],
  ['components/share-button.tsx', 'p-5 w-full max-w-sm outline-none"', 'p-5 w-full max-w-sm max-h-[90dvh] overflow-y-auto outline-none"'],
  ['app/admin/messages/page.tsx', 'p-5 max-w-sm w-full shadow-xl"', 'p-5 max-w-sm w-full max-h-[90dvh] overflow-y-auto shadow-xl"'],
  // Visible-height units.
  ['app/search/page.tsx', 'flex max-h-[90vh] flex-col rounded-t-panel', 'flex max-h-[90dvh] flex-col rounded-t-panel'],
  ['app/admin/support/page.tsx', 'h-[calc(100vh-4rem)]', 'h-[calc(100dvh-4rem)]'],
  ['app/admin/verify-landlords/page.tsx', 'space-y-3 max-h-[75vh] overflow-y-auto pr-1', 'space-y-3 max-h-[75dvh] overflow-y-auto pr-1'],
  ['components/property-video.tsx', 'aspect-video max-h-[70vh] w-full', 'aspect-video max-h-[70dvh] w-full'],
  // Three money figures side by side are too tight under 400px: stack them, then go to three columns.
  ['app/admin/cases/page.tsx', 'grid grid-cols-3 gap-2 rounded-lg bg-secondary/60 p-3"', 'grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 rounded-lg bg-secondary/60 p-3"'],
  ['app/dashboard/analytics/page.tsx', 'grid grid-cols-3 gap-2 rounded-lg bg-secondary/60 p-3 text-center"', 'grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 rounded-lg bg-secondary/60 p-3 text-center"'],
]

let changed = 0
for (const [file, from, to] of EDITS) {
  const src = readFileSync(file, 'utf8')
  if (src.includes(to)) continue
  if (!src.includes(from)) { console.log(`  not found (already changed?): ${file}`); continue }
  writeFileSync(file, src.replace(from, to))
  changed++
  console.log(`updated ${file}`)
}
const css = readFileSync('app/globals.css', 'utf8')
if (!css.includes(MARK)) { writeFileSync('app/globals.css', css.trimEnd() + '\n' + CSS); changed++; console.log('updated app/globals.css') }
console.log(`\n${changed} files updated.`)
