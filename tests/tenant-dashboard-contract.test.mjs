// Stage 15 guard rails for the tenant dashboard. Reads source only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync('app/home/layout.tsx', 'utf8')
// Stage 17: the menu now lives in the shared shell.
const shell = readFileSync('components/account-shell.tsx', 'utf8')
const layoutAndShell = layout + shell
const home = readFileSync('app/home/page.tsx', 'utf8')
const saved = readFileSync('app/saved/page.tsx', 'utf8')
const profile = readFileSync('app/profile/page.tsx', 'utf8')
const links = readFileSync('lib/dashboard-links.ts', 'utf8')

// One bottom bar only: the app-wide components/bottom-nav.tsx. The dashboard layout must not draw a second one.
assert.ok(!/fixed bottom-0/.test(layoutAndShell), 'dashboard layout must not draw its own fixed bottom bar')

// Every tenant link in the shared list is reachable from the dashboard sidebar
const tenantBlock = links.split('export const TENANT_LINKS')[1].split(']')[0]
for (const [, href] of tenantBlock.matchAll(/href: '([^']+)'/g)) {
  assert.ok(layout.includes(`href: '${href}'`), `sidebar is missing ${href}`)
}
for (const href of ['/saved', '/profile', '/search']) assert.ok(layout.includes(`href: '${href}'`), `sidebar is missing ${href}`)

// Access check, live counters and logout are still connected
assert.ok(/profileData\.role === 'landlord'/.test(layout) && /router\.push\('\/dashboard'\)/.test(layout), 'landlords are still sent to /dashboard')
assert.ok(/router\.push\('\/login'\)/.test(layout), 'signed-out visitors still go to /login')
assert.ok(/getUnreadMessageCount/.test(layout) && /postgres_changes/.test(layout) && /supabase\.auth\.signOut\(\)/.test(layout))

// Mobile menu is a real dialog that closes on Escape
assert.ok(/role="dialog"/.test(layoutAndShell) && /aria-modal="true"/.test(layoutAndShell) && /'Escape'/.test(layoutAndShell))

// No invented numbers or claims
for (const [name, src] of [['layout', layout], ['home', home], ['saved', saved]]) {
  assert.ok(!/thousands of/i.test(src), `${name}: no invented statistics`)
}
assert.ok(!/Price Drops/.test(saved) && !/priceDropCount/.test(saved), 'saved: no fake price-drop figure')
assert.ok(!/Still Available/.test(saved), 'saved: no "still available" count that only repeats the saved number')
assert.ok(!/Recommended For You/.test(home), 'home: newest-first list is not labelled as a personalised recommendation')

// The dashboard cards had a heart that did nothing. It must not come back.
assert.ok(!/<Heart size=\{11\}/.test(home), 'home: no do-nothing heart button on cards')

// Failed loads are announced, not shown as empty lists
assert.ok(/role="alert"/.test(home) && /failed\.includes\('notifications'\)/.test(home))
assert.ok(/setFailed\(true\)/.test(saved) && /Try again/.test(saved))

// Saved homes still read the same table
assert.ok(/from\('saved_properties'\)/.test(saved) && /\.eq\('tenant_id', uid\)/.test(saved))

// Profile: same update call, labelled fields, keyboard-reachable photo input
assert.ok(/\.update\(\{ full_name: fullName, phone \}\)/.test(profile), 'profile save call unchanged')
assert.ok(/htmlFor="profile-name"/.test(profile) && /htmlFor="profile-phone"/.test(profile))
assert.ok(!/className="hidden" disabled=\{uploading\}/.test(profile), 'photo input must stay keyboard reachable')

console.log('tenant-dashboard-contract: all checks passed')
