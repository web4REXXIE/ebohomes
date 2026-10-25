// Regression guard for the tenancy route files overwritten in commit 8369e24.
// Plain Node, no dependencies: it checks the source of the route files.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')

const layout = read('app/tenancies/layout.tsx')
const list = read('app/tenancies/page.tsx')
const detail = read('app/tenancies/[id]/page.tsx')
const landlordDetail = read('app/dashboard/tenancies/[id]/page.tsx')
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

// Landlord detail route uses the hub too.
assert.match(landlordDetail, /<TenancyHub role="landlord"/)

// My Applications now redirects into the rental journey and never links a tenancy by application id.
assert.match(appsPage, /router\.replace\('\/journey'\)/)
assert.doesNotMatch(appsPage, /\/tenancies\/\$\{app\.id\}/)

console.log('tenancy-routes ok')