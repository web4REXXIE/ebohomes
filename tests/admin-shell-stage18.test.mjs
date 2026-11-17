// Stage 18 guard rails: admin shell and overview. Reads source only. No browser, no network.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const layout = readFileSync('app/admin/layout.tsx', 'utf8')
const home = readFileSync('app/admin/page.tsx', 'utf8')
const sections = await load('lib/admin-sections.ts')

// Access check is unchanged: signed-out go to /login, non-admins go to /.
assert.match(layout, /router\.push\('\/login'\)/)
assert.match(layout, /profile\?\.role !== 'admin'/)
assert.match(layout, /router\.push\('\/'\)/)
assert.match(layout, /if \(!authorized\) return null/)
assert.match(layout, /supabase\.auth\.signOut\(\)/)

// Uses the shared shell, no private sidebar or menu.
assert.match(layout, /<AccountShell/)
assert.doesNotMatch(layout, /<aside|role="dialog"|text-\[(9|10|11)px\]/)

// Six places in the menu. Every other admin page is a tab inside its section.
function pages(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? pages(p) : n === 'page.tsx' ? [p] : []
  })
}
const routes = pages('app/admin').map((p) => '/' + p.replace(/^app\//, '').replace(/\/page\.tsx$/, ''))
const menu = [...layout.matchAll(/href: '([^']+)', label:/g)].map((m) => m[1])
const tabs = sections.ADMIN_SECTIONS.flatMap((s) => s.tabs.map((t) => t.href))
assert.equal(menu.length, 6, 'Overview, Properties, Rentals, Money, Trust & Issues, Records')
assert.equal(sections.ADMIN_SECTIONS.length, 5)
assert.match(layout, /href: '\/admin', label: 'Overview', icon: LayoutDashboard, exact: true/)

// Every admin page is reachable (Overview, or a tab), and the tabs link only to pages that exist.
for (const r of routes) assert.ok(r === '/admin' || tabs.includes(r), `admin page missing from the tabs: ${r}`)
for (const h of tabs) assert.ok(routes.includes(h), `tab links to a page that does not exist: ${h}`)
assert.equal(tabs.length, new Set(tabs).size, 'no destination listed twice')
assert.equal(routes.length, tabs.length + 1, 'Overview plus one tab per other page')

// Each menu entry opens the first tab of its section, and stays highlighted on all the others.
const entries = sections.ADMIN_SECTIONS.map((s) => s.tabs[0].href)
for (const h of menu.slice(1)) assert.ok(entries.includes(h), `menu entry ${h} is not the first tab of a section`)
for (const s of sections.ADMIN_SECTIONS) {
  for (const t of s.tabs) assert.ok(layout.includes(`'${t.href}'`), `the ${s.label} menu entry does not cover ${t.href}`)
}
assert.equal([...layout.matchAll(/<SectionTabs/g)].length, 1, 'tabs are drawn once, above the page')
assert.match(layout, /<SectionTabs sections=\{ADMIN_SECTIONS\} \/>/)

// Pages removed in earlier steps stay removed.
assert.ok(!routes.includes('/admin/messages'), 'Message History was deleted')
assert.ok(!routes.includes('/admin/disputes'), 'Ownership disputes now lives on the Holds page')

// Holds & freezes: one page, two separate actions, each with its own database function.
const holds = readFileSync('app/admin/holds/page.tsx', 'utf8')
for (const fn of ['admin_place_property_hold', 'admin_release_property_hold', 'admin_freeze_listing', 'admin_unfreeze_listing']) {
  assert.ok(holds.includes(`'${fn}'`), `Holds page calls ${fn}`)
}

// Overview: the same five counts and queries, a dash when a count fails, a way to retry.
for (const q of ["from('listings')", "from('profiles')", "from('risk_alerts')", "from('trust_cases')"]) assert.ok(home.includes(q), q)
assert.match(home, /return error \? null : count \?\? 0/)
assert.match(home, /value=\{i\.count\}/)
assert.match(home, /Try again/)

console.log('admin-shell-stage18: ok')
