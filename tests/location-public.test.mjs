import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const c = readFileSync('components/listing-location-public.tsx', 'utf8')
assert.match(c, /public_listing_pins/)
assert.match(c, /public_listing_surroundings/)
assert.match(c, /listing_exact_location/)
assert.match(c, /formatStraightLine/)
assert.match(c, /straight lines, not road distances/)
assert.doesNotMatch(c, /from\('listings'\)/)        // the public component never reads exact coordinates
assert.doesNotMatch(c, /verified/i)                 // never claims "verified"
assert.doesNotMatch(c, /driv(e|ing) time|walking time|minutes/i)

for (const f of ['app/listing/[id]/page.tsx', 'app/listing/[id]/layout.tsx']) {
  const s = readFileSync(f, 'utf8')
  assert.doesNotMatch(s, /location_text, lat, lng/, f + ' still loads exact coordinates')
  assert.match(s, /listing-location-public/, f)
}
assert.match(readFileSync('app/list-property/page.tsx', 'utf8'), /formData\.lat != null && formData\.lng != null/)
assert.match(readFileSync('supabase/20261204_06_pin_required_new_listings.sql', 'utf8'), /before insert on public\.listings/)

console.log('location-public: all checks passed')
