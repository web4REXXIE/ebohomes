import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const js = transpileModule(readFileSync('lib/risk-alerts.ts', 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
const r = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

// ---- severity levels
assert.equal(r.severityForScore(0), 'info')
assert.equal(r.severityForScore(19), 'info')
assert.equal(r.severityForScore(20), 'warning')
assert.equal(r.severityForScore(40), 'investigation')
assert.equal(r.severityForScore(70), 'high')

// ---- helpers
assert.equal(r.hexHamming('0000000000000000', '0000000000000000'), 0)
assert.equal(r.hexHamming('0000000000000000', 'ffffffffffffffff'), 64)
assert.equal(r.hexHamming('0000000000000000', '0000000000000007'), 3)
assert.equal(r.hexHamming('xyz', '0000000000000000'), null)
assert.equal(r.phoneKey('+234 801 234 5678'), r.phoneKey('0801-234-5678'))
assert.equal(r.phoneKey('12345'), null)
assert.equal(r.maskPhoneKey('08012345678'), 'ending 678')
assert.equal(r.normText('  12, Ogbaru  Street. '), '12 ogbaru street')
const d100 = r.distanceMetres(6.5, 3.3, 6.5009, 3.3)
assert.ok(d100 > 95 && d100 < 105, 'about 100 m')

// ---- listings: building blocks
const P1 = 'aaaaaaaaaaaaaaa1', P2 = 'bbbbbbbbbbbbbbb2', P3 = 'ccccccccccccccc3', P4 = 'ddddddddddddddd4'
const base = { landlordId: 'L1', propertyId: 'prop-1', locationText: '12 Ogbaru Street, Abakaliki', lat: 6.3, lng: 8.1, propertyType: 'flat', bedrooms: 2, priceMonthly: 300000, contactPhone: '08011111111', photoHashes: [P1, P2, P3] }

// legitimate: another flat in the same building, different bedrooms, no shared photos -> information only
let x = r.scoreListingPair(base, { ...base, landlordId: 'L2', propertyId: 'prop-2', bedrooms: 1, photoHashes: ['1234567812345678'], contactPhone: '08022222222' })
assert.equal(x.raise, true); assert.equal(x.severity, 'info'); assert.equal(x.likelyDifferentUnit, true)

// legitimate: same account listing the same property again is not a cross-account alert
assert.equal(r.scoreListingPair(base, { ...base }).raise, false)

// legitimate: one stray photo match and nothing else -> no alert
x = r.scoreListingPair({ ...base, propertyId: null, locationText: 'Somewhere', lat: 5, lng: 7, photoHashes: [P1] }, { ...base, landlordId: 'L2', propertyId: null, locationText: 'Elsewhere', lat: 9, lng: 9, photoHashes: [P1] })
assert.equal(x.raise, false)

// legitimate: owner with two representatives, both already passed authority review -> below "investigate"
x = r.scoreListingPair({ ...base, authorityStatus: 'accepted' }, { ...base, landlordId: 'L2', authorityStatus: 'accepted', photoHashes: [P1, P2, P3] })
assert.equal(x.bothAuthorityReviewed, true); assert.ok(x.score < 40); assert.equal(x.severity, 'warning')

// suspicious: same property under another account with the same photos and phone
x = r.scoreListingPair(base, { ...base, landlordId: 'L2', propertyId: 'prop-9', photoHashes: [P1, P2, P3] })
assert.equal(x.severity, 'high'); assert.equal(x.category, 'duplicate_property')

// suspicious: same property record under two accounts
x = r.scoreListingPair(base, { ...base, landlordId: 'L2', photoHashes: [], locationText: 'x', lat: null, lng: null, contactPhone: '0' })
assert.equal(x.category, 'multiple_accounts'); assert.ok(x.score >= 40)

// suspicious: photos only (stolen pictures at another address), two or more matches -> warning or higher
x = r.scoreListingPair({ ...base, propertyId: 'p-a', locationText: 'A', lat: 6, lng: 8 }, { ...base, landlordId: 'L2', propertyId: 'p-b', locationText: 'B', lat: 7, lng: 9, contactPhone: '0', photoHashes: [P1, P2] })
assert.equal(x.raise, true); assert.ok(x.score >= 20)

// suspicious: matching listing was rejected earlier
x = r.scoreListingPair(base, { ...base, landlordId: 'L2', propertyId: 'p-z', status: 'rejected' })
assert.equal(x.category, 'repeated_rejected')

// near-identical fingerprints (a few bits different) still count as the same photo
assert.equal(r.countMatchingPhotos(['0000000000000000'], ['0000000000000007'], 6), 1)
assert.equal(r.countMatchingPhotos(['0000000000000000'], ['ffffffffffffffff'], 6), 0)
assert.equal(r.countMatchingPhotos(['bad'], ['0000000000000000'], 6), 0)

// the matching distance is adjustable, not hard coded
const near = { ...base, landlordId: 'L2', propertyId: 'p-n', locationText: 'zz', lat: 6.3004, lng: 8.1, photoHashes: [], contactPhone: '0', bedrooms: 2 } // about 45 m
assert.ok(r.scoreListingPair(base, near, { ...r.DEFAULT_RISK_SETTINGS, duplicateRadiusM: 50 }).raise)
assert.equal(r.scoreListingPair({ ...base, propertyId: 'p-m' }, near, { ...r.DEFAULT_RISK_SETTINGS, duplicateRadiusM: 20 }).raise, false)

// ---- documents
const doc = { uploadedBy: 'U1', listingId: 'A', propertyId: 'p1', docType: 'signed_authorization_letter', ownerPhone: '08011111111' }
// legitimate: same company papers reused by the same account on another property
let y = r.scoreDocumentPair({ ...doc, docType: 'company_authorization_or_appointment' }, { ...doc, listingId: 'B', propertyId: 'p2', docType: 'company_authorization_or_appointment' })
assert.equal(y.severity, 'info')
// warning: a title document used for two different properties by one account
y = r.scoreDocumentPair({ ...doc, docType: 'certificate_of_occupancy' }, { ...doc, listingId: 'B', propertyId: 'p2', docType: 'certificate_of_occupancy' })
assert.equal(y.severity, 'warning')
// investigate: same file from an unrelated account
y = r.scoreDocumentPair(doc, { uploadedBy: 'U2', listingId: 'B', propertyId: 'p2', docType: 'signed_authorization_letter', ownerPhone: '08099999999' })
assert.equal(y.severity, 'investigation')
// high: same file, unrelated account, and the earlier copy was flagged
y = r.scoreDocumentPair(doc, { uploadedBy: 'U2', listingId: 'B', docType: 'signed_authorization_letter', ownerPhone: '08099999999', earlierFlagged: true })
assert.equal(y.severity, 'high')
// legitimate-ish: same owner authorises two representatives with the same letter -> kept below "investigate"
y = r.scoreDocumentPair(doc, { uploadedBy: 'U2', listingId: 'B', docType: 'signed_authorization_letter', ownerPhone: '+234 801 111 1111' })
assert.equal(y.related, true); assert.equal(y.severity, 'warning')
// same listing again is a re-upload, not reuse
assert.equal(r.scoreDocumentPair(doc, { ...doc, uploadedBy: 'U2' }).raise, false)

// ---- location changes
const ref = { lat: 6.3, lng: 8.1, text: '12 Ogbaru Street' }
assert.equal(r.scoreLocationChange(ref, { lat: 6.3004, lng: 8.1, text: '12 Ogbaru Street' }, 100).raise, false) // about 45 m re-pin is fine
let z = r.scoreLocationChange(ref, { lat: 6.303, lng: 8.1, text: '12 Ogbaru Street' }, 100)   // about 330 m
assert.equal(z.severity, 'warning')
z = r.scoreLocationChange(ref, { lat: 6.33, lng: 8.1, text: '12 Ogbaru Street' }, 100)        // about 3.3 km
assert.equal(z.severity, 'high')
z = r.scoreLocationChange(ref, { lat: 6.3, lng: 8.1, text: '45 Different Road' }, 100)         // address only
assert.equal(z.severity, 'info'); assert.equal(z.raise, true)
// the threshold is adjustable
assert.equal(r.scoreLocationChange(ref, { lat: 6.303, lng: 8.1, text: '12 Ogbaru Street' }, 500).raise, false)

// ---- ordering and queues
const list = [
  { severity: 'info', detected_at: '2026-11-05T10:00:00Z' }, { severity: 'high', detected_at: '2026-11-01T10:00:00Z' },
  { severity: 'warning', detected_at: '2026-11-05T09:00:00Z' }, { severity: 'high', detected_at: '2026-11-04T10:00:00Z' },
]
const sorted = r.sortAlerts(list)
assert.deepEqual(sorted.map((a) => a.severity), ['high', 'high', 'warning', 'info'])
assert.equal(sorted[0].detected_at, '2026-11-04T10:00:00Z')
assert.equal(r.needsAttention({ status: 'open', severity: 'info' }), false)
assert.equal(r.needsAttention({ status: 'open', severity: 'warning' }), true)
assert.equal(r.needsAttention({ status: 'resolved', severity: 'high' }), false)
assert.equal(r.totalScore([{ weight: 20 }, { weight: 5 }, { weight: 0 }]), 25)

// ---- error wording
assert.equal(r.friendlyRiskError('Write a short note.'), 'Write a short note.')
assert.equal(r.friendlyRiskError('duplicate key value violates unique constraint "x"'), 'Something went wrong. Please try again.')
assert.equal(r.friendlyRiskError(null), 'Something went wrong. Please try again.')

// ---- SQL safety rules: the migration must never touch listings, accounts, applications or tenancies
const sql = readFileSync('supabase/20261119_01_risk_alert_foundation.sql', 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
assert.ok(!/update\s+public\.(profiles|applications|tenancies|viewings)\b/i.test(sql), 'must not update accounts, applications, tenancies or viewings')
assert.ok(!/update\s+public\.listings\b/i.test(sql), 'must not update listings')
assert.ok(!/delete\s+from\s+public\.(listings|profiles|applications|tenancies)\b/i.test(sql), 'must not delete listings or accounts')
assert.ok(!/authority_status\s*=/i.test(sql.replace(/l2?\.authority_status\s*=|me\.authority_status\s*=|o\.authority_status\s*=|ol\.authority_status\s*=/g, '')), 'must not write authority_status')
assert.ok(!/storage_path|createSignedUrl/i.test(sql), 'must not copy file paths into risk records')
console.log('risk-alerts tests passed')
