// Step 2: mobile layout fixes (header, logo, search page, cards, help button, home carousels).
// Safe by design: it checks EVERY edit matches exactly once before it writes anything.
// If a file was already changed or differs, it stops and tells you which one. Run from the project root:  node scripts/apply-step2.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const PATCHES = {
  'components/install-button.tsx': [
    // Bug: the base "inline-flex" overrode "hidden", so Get App showed on phones. Now it only shows from lg up.
    ['className={`inline-flex items-center justify-center whitespace-nowrap transition', 'className={`items-center justify-center whitespace-nowrap transition'],
    ["hero: 'mt-6 h-11 gap-2", "hero: 'mt-6 inline-flex h-11 gap-2"],
    ["footer:\n      'h-10 gap-2", "footer:\n      'inline-flex h-10 gap-2"],
  ],
  'components/header.tsx': [
    [
      'src="/logo-horizontal-compact.png"\n                  alt="EboHomes"\n                  className="h-11 w-auto sm:h-12 lg:h-14 mix-blend-multiply dark:mix-blend-normal"',
      'src="/logo-header.png"\n                  alt="EboHomes"\n                  className="h-9 w-auto sm:h-11 lg:h-12 dark:brightness-0 dark:invert"',
    ],
    [
      '<img src="/logo-horizontal-compact.png" alt="EboHomes" className="h-10 w-auto mix-blend-multiply dark:mix-blend-normal" />',
      '<img src="/logo-header.png" alt="EboHomes" className="h-10 w-auto dark:brightness-0 dark:invert" />',
    ],
  ],
  'app/search/page.tsx': [
    // Search bar scrolls away on phones (it covered the page), stays pinned from tablet up and sits under the taller header.
    ['<div className="sticky top-16 z-30 border-b border-border bg-card">', '<div className="z-30 border-b border-border bg-card md:sticky md:top-20">'],
    ['<div className="relative min-w-[160px] flex-1">', '<div className="relative w-full min-w-0 sm:w-auto sm:min-w-[160px] sm:flex-1">'],
    ['placeholder="Search by location, property name..."', 'placeholder="Search location or property"'],
    ['className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary lg:hidden"', 'className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary lg:hidden"'],
    ['className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"', 'className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:flex-none"'],
    // One card per row on small phones, two from 480px.
    ["? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3'", "? 'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-3'"],
    [": 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-1'", ": 'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-1'"],
    ['<div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">', '<div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-3">'],
    // Price never wraps onto two lines.
    ['<p className="text-base font-extrabold leading-tight text-primary sm:text-lg">', '<p className="whitespace-nowrap text-base font-extrabold leading-tight text-primary sm:text-lg">'],
  ],
  'components/listing-card.tsx': [
    ['<p className="text-base font-extrabold leading-tight text-primary sm:text-lg">', '<p className="whitespace-nowrap text-base font-extrabold leading-tight text-primary sm:text-lg">'],
  ],
  'components/help-bubble.tsx': [
    ['className={`fixed right-3 z-40 flex h-11 w-11 items-center', 'className={`fixed right-3 z-40 flex h-10 w-10 opacity-90 items-center'],
  ],
  'app/page.tsx': [
    // Recently Added: cards now slide to the edge of the green box instead of being cut off inside it.
    ['<div className="pl-5 md:pl-8">', '<div>'],
    // Homes with videos: first card keeps its left margin when it snaps.
    ['className="-mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 pb-2', 'className="-mx-4 mt-5 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:scroll-px-0'],
  ],
}

// 1) read everything and check every edit first
const next = {}
const problems = []
for (const [file, edits] of Object.entries(PATCHES)) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { problems.push(`${file}: file not found (run this from the project root)`); continue }
  const crlf = text.includes('\r\n')
  let body = crlf ? text.replace(/\r\n/g, '\n') : text
  edits.forEach(([from, to], i) => {
    const count = body.split(from).length - 1
    if (count !== 1) problems.push(`${file}: edit ${i + 1} matched ${count} times (expected 1)`)
    else body = body.replace(from, () => to)
  })
  next[file] = crlf ? body.replace(/\n/g, '\r\n') : body
}

// 2) only write when everything matched
if (problems.length) {
  console.log('NOTHING WAS CHANGED. Please send me these lines:\n - ' + problems.join('\n - '))
  process.exit(1)
}
for (const [file, text] of Object.entries(next)) writeFileSync(file, text)
console.log('Done. ' + Object.keys(next).length + ' files updated:\n - ' + Object.keys(next).join('\n - '))