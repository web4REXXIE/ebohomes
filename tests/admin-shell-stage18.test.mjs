// Stage 18 guard rails: admin shell and overview. Reads source only. No browser, no network.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const layout = readFileSync('app/admin/layout.tsx', 'utf8')
const home = readFileSync('app/admin/page.tsx', 'utf8')

// Access check is unchanged: signed-out go to /login, non-admins go to /.
assert.match(layout, /router\.push\('\/login'\)/)
assert.match(layout, /profile\?\.role !== 'admin'/)
assert.match(layout, /router\.push\('\/'\)/)
assert.match(layout, /if \(!authorized\) return null/)
assert.match(layout, /supabase\.auth\.signOut\(\)/)

// Uses the shared shell, no private sidebar or menu.
assert.match(layout, /<AccountShell/)
assert.doesNotMatch(layout, /<aside|role="dialog"|text-\[(9|10|11)px\]/)

// Every admin page is reachable from the menu, and the menu links only to pages that exist.
function pages(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? pages(p) : n === 'page.tsx' ? [p] : []
  })
}
const routes = pages('app/admin').map((p) => '/' + p.replace(/^app\//, '').replace(/\/page\.tsx$/, ''))
const menu = [...layout.matchAll(/href: '([^']+)', label:/g)].map((m) => m[1])
for (const r of routes) assert.ok(menu.includes(r), `admin page missing from the menu: ${r}`)
for (const h of menu) assert.ok(routes.includes(h), `menu links to a page that does not exist: ${h}`)
assert.equal(menu.length, new Set(menu).size, 'no destination listed twice')
assert.equal(menu.length, 36)
assert.match(layout, /href: '\/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true/)

// Overview: the same five counts and queries, a dash when a count fails, a way to retry.
for (const q of ["from('listings')", "from('profiles')", "from('risk_alerts')", "from('trust_cases')"]) assert.ok(home.includes(q), q)
assert.match(home, /return error \? null : count \?\? 0/)
assert.match(home, /value=\{i\.count\}/)
assert.match(home, /Try again/)

console.log('admin-shell-stage18: ok')
