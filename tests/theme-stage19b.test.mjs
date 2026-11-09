// Stage 19b guard rails: the dark/light theme is remembered without a flash, and fixed colours stay out of
// public, tenant and landlord pages. Plain Node, reads source files only. No browser.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import { mapColours } from '../scripts/lib/colour-map.mjs'

async function load(path) {
  const js = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

// ---- 1. The init script restores a saved dark theme and survives blocked storage ----
const { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } = await load('lib/theme.ts')
assert.equal(THEME_STORAGE_KEY, 'ebohomes-theme')

function run({ stored, throws = false }) {
  const classes = new Set(['light'])
  const doc = { documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } } }
  const localStorage = { getItem: (k) => { if (throws) throw new Error('blocked'); return k === THEME_STORAGE_KEY ? stored : null } }
  new Function('document', 'localStorage', THEME_INIT_SCRIPT)(doc, localStorage)
  return classes
}
assert.deepEqual([...run({ stored: 'dark' })], ['dark'], 'saved dark theme is applied')
assert.deepEqual([...run({ stored: 'light' })], ['light'], 'saved light stays light')
assert.deepEqual([...run({ stored: null })], ['light'], 'nothing saved: approved light theme')
assert.deepEqual([...run({ stored: 'junk' })], ['light'], 'unknown value is ignored')
assert.deepEqual([...run({ stored: 'dark', throws: true })], ['light'], 'blocked storage does not break the page')
assert.ok(THEME_INIT_SCRIPT.length < 400, 'init script stays tiny')

// ---- 2. The script is in <head>, ahead of anything else, and the old toggle logic is gone ----
const layout = readFileSync('app/layout.tsx', 'utf8')
assert.match(layout, /<html lang="en" className="light" suppressHydrationWarning>/)
assert.ok(layout.indexOf('THEME_INIT_SCRIPT }}') > layout.indexOf('<head>') && layout.indexOf('THEME_INIT_SCRIPT }}') < layout.indexOf('beforeinstallprompt'), 'theme script runs first in <head>')

const header = readFileSync('components/header.tsx', 'utf8')
assert.match(header, /saveTheme\(next\)/, 'toggle saves the choice')
assert.match(header, /applyTheme\(next\)/)
assert.match(header, /THEME_STORAGE_KEY/, 'other tabs are followed')
assert.ok(!/classList\.toggle\('dark'\)/.test(header), 'header no longer flips the class without saving')
assert.match(header, /aria-pressed=\{isDark\}/, 'toggle still reports its state')
assert.match(header, /aria-label="Toggle dark mode"/)

// ---- 3. Theme helpers ----
const themeSrc = readFileSync('lib/theme.ts', 'utf8')
assert.match(themeSrc, /try \{\s*localStorage\.setItem/, 'saving is wrapped in try/catch')
assert.match(themeSrc, /classList\.toggle\('dark', theme === 'dark'\)/)

// ---- 4. Dark tokens exist for every status token the colour pass uses ----
const css = readFileSync('app/globals.css', 'utf8')
const dark = css.slice(css.indexOf('\n.dark {'))
for (const t of ['success', 'warning', 'danger', 'info']) {
  assert.match(css, new RegExp(`--color-${t}: var\\(--${t}\\)`), `${t} is a Tailwind colour`)
  assert.match(css, new RegExp(`--color-${t}-soft: var\\(--${t}-soft\\)`), `${t}-soft is a Tailwind colour`)
  assert.match(dark, new RegExp(`--${t}: #`), `dark value for ${t}`)
  assert.match(dark, new RegExp(`--${t}-soft: #`), `dark value for ${t}-soft`)
}

// ---- 5. The colour map is correct, and leaves dark-surface colours alone ----
assert.equal(mapColours('bg-amber-50 text-amber-900 border-amber-300'), 'bg-warning-soft text-warning border-warning/30')
assert.equal(mapColours('bg-emerald-50 text-emerald-700 border-emerald-400'), 'bg-success-soft text-success border-success/30')
assert.equal(mapColours('bg-red-50 text-red-900 hover:bg-red-50'), 'bg-danger-soft text-danger hover:bg-danger-soft')
assert.equal(mapColours('bg-blue-50 text-blue-900'), 'bg-info-soft text-info')
assert.equal(mapColours('bg-slate-100 text-slate-700 border-slate-300'), 'bg-secondary text-muted-foreground border-border')
for (const keep of ['text-amber-300', 'from-amber-400 to-amber-500', 'bg-blue-600', 'bg-emerald-700', 'dark:bg-red-50', 'dark:hover:bg-red-50', 'bg-emerald-950']) {
  assert.equal(mapColours(keep), keep, `${keep} is left alone`)
}
assert.equal(mapColours(mapColours('bg-amber-50')), mapColours('bg-amber-50'), 'running twice changes nothing more')

// ---- 6. No mappable fixed colour is left in public, tenant or landlord code ----
function tsx(dir) {
  if (dir === 'app/admin' || dir === 'components/ui') return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? tsx(p.replace(/\\/g, '/')) : p.endsWith('.tsx') ? [p] : []
  })
}
const files = [...tsx('app'), ...tsx('components')]
assert.ok(files.length > 100, 'source files found')
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  assert.equal(mapColours(src), src, `${f}: still has fixed colours that break dark mode (run scripts/stage19b-colours.mjs)`)
}

console.log('theme-stage19b: ok')
