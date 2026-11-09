// Stage 17 guard rails: one shared account shell, role-specific links and access stay in each layout.
// Reads source only. No browser, no network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const tenant = readFileSync('components/tenant-account-shell.tsx', 'utf8')
const landlord = readFileSync('app/dashboard/layout.tsx', 'utf8')
const shell = readFileSync('components/account-shell.tsx', 'utf8')
const links = await load('lib/dashboard-links.ts')

// Both layouts use the shell and no longer draw their own sidebar, menu or phone header.
for (const [name, src] of [['tenant', tenant], ['landlord', landlord]]) {
  assert.match(src, /<AccountShell/, `${name}: uses AccountShell`)
  assert.doesNotMatch(src, /<aside/, `${name}: no private sidebar`)
  assert.doesNotMatch(src, /role="dialog"/, `${name}: no private mobile menu`)
  assert.doesNotMatch(src, /BRAND_LOGOS/, `${name}: logo comes from the shell`)
}

// The shell has one sidebar, one phone header, one dialog, and no second bottom bar.
assert.equal([...shell.matchAll(/<aside/g)].length, 1)
assert.equal([...shell.matchAll(/role="dialog"/g)].length, 1)
assert.doesNotMatch(shell, /fixed bottom-0/)
assert.doesNotMatch(shell, /text-\[(9|10|11)px\]/)
assert.match(shell, /'Escape'/)
assert.match(shell, /e\.key !== 'Tab'/, 'focus is kept inside the open menu')
assert.match(shell, /document\.body\.style\.overflow = 'hidden'/)
assert.match(shell, /aria-current=\{active \? 'page' : undefined\}/)

// The shell does no data access and no role checks: those stay in each layout.
assert.doesNotMatch(shell, /supabase/)
assert.doesNotMatch(shell, /role\s*[=!]==/)

// Role-specific access is unchanged.
assert.ok(/profileData\.role === 'landlord'/.test(tenant) && /router\.push\('\/dashboard'\)/.test(tenant))
assert.ok(/profileData\.role !== 'landlord'/.test(landlord) && /router\.push\('\/'\)/.test(landlord))
assert.ok(/router\.push\('\/login'\)/.test(tenant) && /router\.push\('\/login'\)/.test(landlord))
assert.ok(/supabase\.auth\.signOut\(\)/.test(tenant))

// Nothing role-specific leaks across: no landlord link in the tenant menu and the reverse.
const hrefs = (src) => [...src.matchAll(/href: '([^']+)', icon:/g)].map((m) => m[1])
const tenantHrefs = hrefs(tenant)
const landlordHrefs = hrefs(landlord)
assert.ok(tenantHrefs.every((h) => !h.startsWith('/dashboard')), 'tenant menu has no landlord pages')
assert.ok(!landlordHrefs.includes('/home') && !landlordHrefs.includes('/saved'), 'landlord menu has no tenant pages')
assert.equal(landlordHrefs.length, 16, 'landlord menu has its 15 destinations plus Notifications')
assert.equal(tenantHrefs.length, 11, 'tenant menu still has its 11 destinations')

// Drift guard: every link in the shared list (header drop-down and bottom bar) is in that role's menu.
for (const l of links.TENANT_LINKS) assert.ok(tenantHrefs.includes(l.href), `tenant menu is missing ${l.href}`)
for (const l of links.LANDLORD_LINKS) assert.ok(landlordHrefs.includes(l.href), `landlord menu is missing ${l.href}`)

// The two dashboard homes only light up on their exact path.
assert.match(tenant, /href: '\/home', icon: LayoutDashboard, exact: true/)
assert.match(landlord, /href: '\/dashboard', icon: LayoutDashboard, exact: true/)

// Active-route rule: exact match for the dashboard home, nested pages for everything else.
assert.match(shell, /if \(item\.exact\) return pathname === item\.href/)
assert.match(shell, /return pathname === item\.href \|\| pathname\.startsWith\(item\.href \+ '\/'\)/)

console.log('account-shell-stage17: ok')
