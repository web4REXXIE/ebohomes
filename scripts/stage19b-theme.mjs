// Stage 19b, part 1: makes the theme choice persistent. Run once from the repo root:
//   node scripts/stage19b-theme.mjs
// Safe to run twice. It edits app/layout.tsx and components/header.tsx by exact text, and stops with a clear
// message if the text is not found (for example if you changed those lines since). Use `git diff` to review.
import { readFileSync, writeFileSync } from 'node:fs'

let failed = false
function patch(file, steps) {
  let src = readFileSync(file, 'utf8')
  for (const { done, from, to, name } of steps) {
    if (src.includes(done)) { console.log(`  already done: ${name}`); continue }
    if (!src.includes(from)) { console.log(`  NOT FOUND, edit by hand: ${file}: ${name}`); failed = true; continue }
    src = src.replace(from, to)
    console.log(`  ${file}: ${name}`)
  }
  writeFileSync(file, src)
}

patch('app/layout.tsx', [
  {
    name: 'import the init script',
    done: "from '@/lib/theme'",
    from: "import { BRAND_TITLE } from '@/lib/brand'\n",
    to: "import { BRAND_TITLE } from '@/lib/brand'\nimport { THEME_INIT_SCRIPT } from '@/lib/theme'\n",
  },
  {
    name: 'allow the class to change before hydration',
    done: 'className="light" suppressHydrationWarning',
    from: '<html lang="en" className="light">',
    to: '<html lang="en" className="light" suppressHydrationWarning>',
  },
  {
    name: 'run the theme script first in <head>',
    done: '__html: THEME_INIT_SCRIPT',
    from: '<head>\n',
    to: '<head>\n        {/* Applies a saved dark theme before the first paint, so there is no flash. */}\n        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />\n',
  },
])

patch('components/header.tsx', [
  {
    name: 'import the theme helpers',
    done: "from '@/lib/theme'",
    from: "import { cn } from '@/lib/utils'\n",
    to: "import { cn } from '@/lib/utils'\nimport { applyTheme, currentTheme, saveTheme, THEME_STORAGE_KEY } from '@/lib/theme'\n",
  },
  {
    name: 'read the theme on mount',
    done: "setIsDark(currentTheme() === 'dark')",
    from: "setIsDark(document.documentElement.classList.contains('dark'))",
    to: "setIsDark(currentTheme() === 'dark')",
  },
  {
    name: 'save the choice when toggling, and follow other tabs',
    done: 'saveTheme(next)',
    from: `  const toggleDarkMode = () => {
    if (!mounted) return
    document.documentElement.classList.toggle('dark')
    setIsDark(!isDark)
  }
`,
    to: `  // Stage 19b: if the theme is changed in another tab, follow it here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return
      const next = e.newValue === 'dark' ? 'dark' : 'light'
      applyTheme(next)
      setIsDark(next === 'dark')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleDarkMode = () => {
    if (!mounted) return
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    saveTheme(next)
    setIsDark(next === 'dark')
  }
`,
  },
])

if (failed) { console.log('\nSome edits need doing by hand.'); process.exit(1) }
console.log('\nDone.')
