// Regression guard for the tenancy route files overwritten in commit 8369e24.
// Plain Node, no dependencies: it checks the source of the route files.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')

const layout = read('app/tenancies/layout.tsx')
const list = read('app/tenancies/page.tsx')
const detail = read('app/tenancies/[id]/page.tsx')
const landlordList = read('app/dashboard/tenancies/page.tsx')
const landlordDetail = read('app/dashboard/tenancies/[id]/page.tsx')
const landlordRecord = read('app/dashboard/tenancies/[id]/record/page.tsx')
const appsPage = read('app/applications/page.tsx')

// The layout is the only place that renders the header and footer, and it renders its children.
assert.match(layout, /<Header\s*\/>/)
assert.match(layout, /<Footer\s*\/>/)
assert.match(layout, /\{children\}/)
assert.doesNotMatch(layout, /TenancyList|TenancyHub/, 'layout must not render a tenancy page itself')

// /tenancies renders the list and no header or footer (the layout supplies them).
assert.match(list, /<TenancyList role="tenant"/)
assert.doesNotMatch(list, /<Header|<Footer/)

// /tenancies/[id] renders the hub with the ID from the URL, not the list, and no second header.
assert.match(detail, /useParams/)
assert.match(detail, /<TenancyHub role="tenant" tenancyId=\{String\(params\?\.id/)
assert.doesNotMatch(detail, /TenancyList/, 'detail route must not render the list')
assert.doesNotMatch(detail, /<Header|<Footer/, 'detail route must not render a second header or footer')

// A tenant's tenancy forwards to the rental journey of its application, and only for the tenant who owns it.
// The address parameters are kept, because Paystack returns to this route with ?reference=...
assert.match(detail, /router\.replace\(`\/journey\/\$\{row\.application_id\}\$\{window\.location\.search\}`\)/)
assert.match(detail, /row\.tenant_id === uid/)
// The renewal panel and record link are rendered only after the ownership check, never before it.
assert.match(detail, /access === 'other'/)

// /dashboard/tenancies renders the landlord list, not a single tenancy.
assert.match(landlordList, /<TenancyList role="landlord"/)
assert.doesNotMatch(landlordList, /useParams|TenancyHub/, 'landlord list route must not render a single tenancy')

// Landlord detail route uses the hub too, and only for the landlord on the tenancy.
assert.match(landlordDetail, /useParams/)
assert.match(landlordDetail, /<TenancyHub role="landlord"/)
assert.match(landlordDetail, /row\.landlord_id === uid/)
assert.doesNotMatch(landlordDetail, /TenancyList/, 'landlord detail route must not render the list')

// The record link on the landlord detail page leads to a route that exists and uses the landlord record view.
assert.match(landlordDetail, /\/dashboard\/tenancies\/\$\{id\}\/record/)
assert.match(landlordRecord, /<TenancyRecordView role="landlord"/)

// My Applications now redirects into the rental journey and never links a tenancy by application id.
assert.match(appsPage, /router\.replace\('\/journey'\)/)
assert.doesNotMatch(appsPage, /\/tenancies\/\$\{app\.id\}/)

console.log('tenancy-routes ok')