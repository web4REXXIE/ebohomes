// Guard rails: landlords start from one entry, "List a property" (/dashboard/estates), which asks what they are adding.
// /list-property stays as the form itself: the chooser's "One house or flat" card and the ?unit= links open it.
// Reads source only. No browser, no network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')

// Landlord-side entry points go to the chooser, not straight to the single-house form.
for (const f of ['app/dashboard/listings/page.tsx', 'app/verification-pending/page.tsx', 'lib/needs-you.ts']) {
  assert.doesNotMatch(read(f), /['"]\/list-property['"]/, `${f}: landlord entry points open the chooser`)
  assert.match(read(f), /\/dashboard\/estates/, `${f}: opens the chooser`)
}

// The chooser still opens the form for one house or flat, and the unit links still open it for a numbered flat.
const estates = read('app/dashboard/estates/page.tsx')
assert.match(estates, /href="\/list-property"/, 'chooser: One house or flat opens the form')
assert.match(estates, /\/list-property\?unit=\$\{pickUnit\.id\}/, 'chooser: List this flat opens the form for that unit')

// The form route is not a redirect (that would loop with the chooser), and it still reads ?unit=.
const form = read('app/list-property/page.tsx')
assert.doesNotMatch(form, /redirect\(/, 'the form is not a redirect')
assert.match(form, /get\('unit'\)/)
assert.doesNotMatch(read('next.config.mjs'), /source: '\/list-property'/, 'no redirect on the form route')

// The landlord menu's "List a property" tab is the chooser.
assert.match(read('lib/landlord-sections.ts'), /label: 'List a property', href: '\/dashboard\/estates'/)

console.log('list-property-entry: ok')
