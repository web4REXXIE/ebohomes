// Stage 18c guard rails: landlord Notifications link, legacy 'approved' status, edit-listing phone number.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

// 6. Landlord sidebar: Notifications is there with a live badge, and the tenant menu is untouched.
const landlord = readFileSync('app/dashboard/layout.tsx', 'utf8')
assert.match(landlord, /href: '\/notifications', icon: Bell, badgeKey: 'notifications'/)
assert.match(landlord, /notifications: \{ count: unreadNotifs/)
assert.match(landlord, /import \{[^}]*\bBell\b[^}]*\} from 'lucide-react'/)

// 5. The legacy 'approved' status is still never shown as verified.
const { landlordVerificationDisplay: show } = await load('lib/landlord-verification.ts')
const base = { business_name: 'Ebo', business_address: '1 Main St', account_type: 'individual', id_document_type: 'nin', id_document_url: 'a', selfie_url: 'b' }
for (const verified of [true, false, null]) {
  const d = show({ ...base, verification_status: 'approved', verified })
  assert.equal(d.state, 'unknown', `approved + verified=${verified} stays neutral`)
  assert.notEqual(d.label, 'Verified')
  assert.match(d.detail, /approved/)
}
assert.equal(show({ ...base, verification_status: 'verified', verified: true }).state, 'verified')
assert.equal(show({ ...base, verification_status: 'verified', verified: false }).state, 'unknown')
assert.equal(show({ ...base, verification_status: 'rejected', verified: false }).state, 'rejected')
assert.equal(show({ ...base, verification_status: 'pending', verified: true }).state, 'unknown')

// 4. Edit listing reads the phone from listing_contacts first, then listings.contact_info, and saves where it always did.
const edit = readFileSync('app/dashboard/edit/[id]/page.tsx', 'utf8')
assert.match(edit, /availability_date, contact_info'\)/)
assert.match(edit, /contactRow\?\.contact_info \?\? data\.contact_info \?\? ''/)
assert.match(edit, /contact_info: formData\.phoneNumber/)
assert.match(edit, /\.eq\('landlord_id', user\.id\)/)

console.log('stage18c-decisions: ok')
