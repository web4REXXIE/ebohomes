// Stage 18b guard rails: /tenancies uses the tenant shell for tenants only. Reads source only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tenancies = readFileSync('app/tenancies/layout.tsx', 'utf8')
const home = readFileSync('app/home/layout.tsx', 'utf8')
const tenantShell = readFileSync('components/tenant-account-shell.tsx', 'utf8')

// The home layout is now a thin wrapper around the same component.
assert.match(home, /<TenantAccountShell>/)
assert.match(tenantShell, /export function TenantAccountShell/)
assert.match(tenantShell, /profileData\.role === 'landlord'/, 'tenant shell still sends landlords to /dashboard')

// Tenancies: tenant shell only when the role is exactly tenant. Everyone else keeps Header and Footer.
assert.match(tenancies, /profile\?\.role === 'tenant' \? 'tenant' : 'public'/)
assert.match(tenancies, /<TenantAccountShell>/)
assert.match(tenancies, /<Header \/>/)
assert.match(tenancies, /<Footer \/>/)
// Signed-out visitors and read failures keep the old frame; a failed read never blocks the page.
assert.match(tenancies, /if \(!user\) \{\s*if \(alive\) setMode\('public'\)/)
assert.match(tenancies, /catch \{[\s\S]*setMode\('public'\)/)
// The layout only chooses a frame: no redirects, no router.
assert.doesNotMatch(tenancies, /router\.|useRouter|redirect\(/)
// It does not wrap the shell inside the shell for landlords (that would send them to /dashboard).
assert.ok(tenancies.indexOf("mode === 'tenant'") < tenancies.indexOf('<TenantAccountShell>'))

console.log('tenancies-shell-stage18b: ok')
