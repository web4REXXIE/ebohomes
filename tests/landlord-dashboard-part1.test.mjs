// Stage 16 Part 1 guard rails: landlord dashboard shell, overview and listings page.
// Reads source and runs the pure helpers. No browser, no network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const layout = readFileSync('app/dashboard/layout.tsx', 'utf8')
// Stage 17: the menu, logo and focus handling moved into the shared shell.
const shell = readFileSync('components/account-shell.tsx', 'utf8')
const layoutAndShell = layout + shell
const overview = readFileSync('app/dashboard/page.tsx', 'utf8')
const listings = readFileSync('app/dashboard/listings/page.tsx', 'utf8')
const verSrc = readFileSync('lib/landlord-verification.ts', 'utf8')
const links = await load('lib/dashboard-links.ts')
const v = await load('lib/landlord-verification.ts')

// ---------- 1. Verification: only what the records support ----------
const complete = {
  business_name: 'Ebo Properties', business_address: '1 Main St', account_type: 'individual',
  id_document_type: 'nin', id_document_url: 'a/id.jpg', selfie_url: 'a/selfie.jpg',
}

// Explicit outcome needs BOTH fields to agree.
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'verified', verified: true }).state, 'verified')

// The boolean on its own is never trusted.
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'pending', verified: true }).state, 'unknown')
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: null, verified: true }).state, 'unknown')
// Status says verified but the flag does not back it up.
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'verified', verified: false }).state, 'unknown')
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'verified', verified: null }).state, 'unknown')
// Legacy or unrecognised statuses are neutral, not verified.
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'approved', verified: true }).state, 'unknown')
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'something_new' }).state, 'unknown')
// Contradiction: rejected status with verified = true is not shown as rejected or verified.
assert.equal(v.landlordVerificationDisplay({ ...complete, verification_status: 'rejected', verified: true }).state, 'unknown')
// No profile at all is neutral.
assert.equal(v.landlordVerificationDisplay(null).state, 'unknown')
assert.equal(v.landlordVerificationDisplay(undefined).state, 'unknown')

// Rejected only with a real rejection status.
const rej = v.landlordVerificationDisplay({ ...complete, verification_status: 'rejected', verified: false })
assert.equal(rej.state, 'rejected')
assert.equal(rej.needsAction, true)

// The database default 'pending' alone is NOT a submission.
const empty = v.landlordVerificationDisplay({ verification_status: 'pending', verified: false })
assert.equal(empty.state, 'not_submitted')
assert.equal(empty.needsAction, true)
assert.ok(empty.missing.length > 0)
// Partial uploads: still not submitted, and says what is missing.
const partial = v.landlordVerificationDisplay({ ...complete, selfie_url: null, verification_status: 'pending' })
assert.equal(partial.state, 'not_submitted')
assert.ok(partial.missing.includes('Selfie holding ID'))
assert.match(partial.detail, /Selfie holding ID/)
// Everything on file, no decision: submitted and waiting. Never "under active review".
const sub = v.landlordVerificationDisplay({ ...complete, verification_status: 'pending', verified: false })
assert.equal(sub.state, 'submitted')
assert.equal(sub.needsAction, false)
assert.doesNotMatch(sub.label + sub.detail, /under review|being reviewed|reviewing/i)
// The ownership document is optional and must not block "submitted".
assert.equal(v.landlordVerificationDisplay({ ...complete, ownership_doc_url: null, verification_status: 'pending' }).state, 'submitted')
// Company accounts still need their company fields.
assert.equal(v.landlordVerificationDisplay({ ...complete, account_type: 'company', verification_status: 'pending' }).state, 'not_submitted')

// Wording never claims ownership or independent identity verification.
const allText = ['verified', 'rejected', 'submitted', 'unknown', 'not_submitted']
  .map((st) => {
    const fixtures = {
      verified: { ...complete, verification_status: 'verified', verified: true },
      rejected: { ...complete, verification_status: 'rejected', verified: false },
      submitted: { ...complete, verification_status: 'pending' },
      unknown: null,
      not_submitted: { verification_status: 'pending' },
    }
    const d = v.landlordVerificationDisplay(fixtures[st])
    return d.label + ' ' + d.detail
  }).join(' ')
assert.doesNotMatch(allText, /ownership (is|has been|was) verified/i)
assert.doesNotMatch(allText, /identity (is|has been|was) verified/i)
assert.match(v.landlordVerificationDisplay({ ...complete, verification_status: 'verified', verified: true }).detail, /checked separately/i)

// The admin helper is untouched (the admin screens rely on its current behaviour).
assert.equal(v.verificationBucket({ ...complete, verified: true }), 'verified')
assert.equal(v.verificationBucket({ verification_status: 'pending' }), 'not_submitted')

// The helper module still has no imports, so it stays directly testable.
assert.ok(!/^import /m.test(verSrc), 'landlord-verification.ts must stay import-free')

// ---------- 2. Navigation: nothing removed ----------
const PRE_STAGE16_DESTINATIONS = [
  '/dashboard', '/dashboard/listings', '/dashboard/applications', '/dashboard/viewings',
  '/dashboard/inspection-requests', '/dashboard/tenancies', '/dashboard/payments', '/dashboard/messages',
  '/dashboard/analytics', '/dashboard/verify', '/dashboard/professional', '/dashboard/company',
  '/list-property', '/dashboard/profile', '/contact',
]
// Stage 18c: one destination was added on purpose, the existing /notifications page (the phone bell already linked to it).
const EXPECTED_SIDEBAR_COUNT = PRE_STAGE16_DESTINATIONS.length + 1
assert.ok(layout.includes("href: '/notifications'"), 'landlord sidebar links to Notifications')
for (const href of PRE_STAGE16_DESTINATIONS) assert.ok(layout.includes(`href: '${href}'`), `sidebar lost ${href}`)
assert.equal([...layout.matchAll(/href: '/g)].length, EXPECTED_SIDEBAR_COUNT, 'sidebar should have the 15 original destinations plus Notifications')
// Every shared landlord link is reachable from the sidebar.
for (const l of links.LANDLORD_LINKS) assert.ok(layout.includes(`href: '${l.href}'`), `shared link ${l.href} is not in the sidebar`)
assert.ok(links.LANDLORD_LINKS.some((l) => l.href === '/dashboard/inspection-requests'), 'Inspection requests must be in LANDLORD_LINKS')
// Tenant links are not changed by this stage.
assert.equal(links.TENANT_LINKS.length, 8)
assert.equal(links.dashboardLinks('landlord'), links.LANDLORD_LINKS)
assert.equal(links.dashboardLinks('tenant'), links.TENANT_LINKS)
// Badges keep their data sources.
assert.ok(/badgeKey: 'applications'/.test(layout) && /badgeKey: 'messages'/.test(layout))

// ---------- 3. Access and live data are unchanged ----------
assert.ok(/profileData\.role !== 'landlord'/.test(layout) && /router\.push\('\/'\)/.test(layout), 'non-landlords are still redirected')
assert.ok(/router\.push\('\/login'\)/.test(layout), 'signed-out visitors still go to /login')
assert.ok(/getUnreadMessageCount/.test(layout) && /postgres_changes/.test(layout))
assert.ok(/\.eq\('landlord_id', user\.id\)/.test(layout) && /\['pending', 'info_requested'\]/.test(layout), 'sidebar application badge query is unchanged')
// Mobile menu: real dialog, Escape closes, focus handled, no second bottom bar.
assert.ok(/role="dialog"/.test(layoutAndShell) && /aria-modal="true"/.test(layoutAndShell) && /'Escape'/.test(layoutAndShell))
assert.ok(/closeButtonRef\.current\?\.focus\(\)/.test(layoutAndShell) && /menuButtonRef\.current\?\.focus\(\)/.test(layoutAndShell), 'focus moves into and back out of the mobile menu')
assert.ok(!/fixed bottom-0/.test(layoutAndShell), 'dashboard layout must not draw its own fixed bottom bar')
// Brand logo comes from the shared brand file, not a generic icon tile.
assert.ok(/BRAND_LOGOS\.onLight/.test(layoutAndShell) && /BRAND_LOGOS\.onDark/.test(layoutAndShell))
// Badge text is no longer 9 or 10px.
assert.ok(!/text-\[(9|10)px\]/.test(layoutAndShell), 'no 9px or 10px text in the landlord shell')

// ---------- 4. Overview: real data only ----------
assert.ok(/OWNER_LISTING_COLUMNS/.test(overview), 'overview keeps the private-location column list')
assert.ok(!/select\('\*'\)\s*\.from\('listings'\)|from\('listings'\)\.select\('\*'/.test(overview), 'never select * on listings')
assert.ok(!/Math\.random|thousands of|placeholder stat/i.test(overview), 'no invented figures')
assert.ok(/landlordVerificationDisplay/.test(overview), 'verification card uses the conservative helper')
assert.ok(!/profile\??\.verified\b/.test(overview), 'overview must not read the verified flag directly')
assert.ok(/openApplications/.test(overview) && /useState<number \| null>\(null\)/.test(overview), 'open applications can be unknown (null), not zero')
assert.ok(/aRes\.error \? null/.test(overview), 'a failed applications query becomes unknown, not 0')
assert.ok(/failed \? null : n/.test(overview), 'failed listing load shows dashes, not zeros')
assert.ok(/Try again/.test(overview), 'overview has a retry on load failure')
// Rented comes from the real listing status.
assert.ok(/l\.status === 'rented'/.test(overview))
// Only read queries were added.
assert.ok(!/\.(insert|update|delete|upsert|rpc)\(/.test(overview), 'overview is read only')

// ---------- 5. Listings: operations and ownership checks preserved ----------
assert.equal([...listings.matchAll(/\.eq\('landlord_id', user\.id\)/g)].length, 3, 'load, pause/resume and delete are each scoped to the landlord')
assert.ok(/\.update\(\{ status: nextStatus \}\)/.test(listings) && /\.delete\(\)/.test(listings))
assert.ok(/Yes, delete/.test(listings) && /This cannot be undone/.test(listings), 'delete still needs confirmation')
assert.ok(/23503/.test(listings), 'authority-evidence delete protection message is kept')
assert.ok(/OWNER_LISTING_COLUMNS/.test(listings))
assert.ok(!/router\.push/.test(listings), 'navigation uses links')
assert.ok(/href=\{`\/dashboard\/edit\/\$\{listing\.id\}`\}/.test(listings) && /href=\{`\/dashboard\/authority\/\$\{listing\.id\}`\}/.test(listings))
assert.ok(/href=\{`\/listing\/\$\{listing\.id\}\/feature`\}/.test(listings), 'Feature link kept')
// Search and filter are display only: the filter code must not call the database.
const filterBlock = listings.slice(listings.indexOf('const visibleListings'), listings.indexOf('const filtering'))
assert.ok(filterBlock.length > 50 && !/supabase/.test(filterBlock), 'search and filter never touch the database')
assert.ok(/#group-/.test(listings) && /id=\{`group-\$\{g\}`\}/.test(listings), 'group anchors used by the overview still exist')
assert.ok(/id=\{`listing-\$\{listing\.id\}`\}/.test(listings), 'listing anchors used by the overview still exist')
assert.ok(/Try again/.test(listings), 'listings has a retry on load failure')

console.log('landlord-dashboard-part1: all checks passed')
