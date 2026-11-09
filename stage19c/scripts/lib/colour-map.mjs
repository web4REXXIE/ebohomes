// Stage 19b: maps fixed Tailwind palette colours to the theme tokens in app/globals.css, so they follow dark mode.
// Shared by scripts/stage19b-colours.mjs (does the change) and tests/theme-stage19b.test.mjs (checks it stays done).
// Only pale backgrounds, dark text on them, and soft borders are mapped. Colours on the dark brand surfaces
// (text-amber-300 on forest green, gold gradients, solid 600/700 buttons) are NOT touched: they already work in both themes.
const STATUS = { emerald: 'success', green: 'success', amber: 'warning', yellow: 'warning', orange: 'warning', red: 'danger', rose: 'danger', sky: 'info', blue: 'info' }
const NEUTRAL = ['slate', 'gray']

// Not already behind a "dark:" prefix, and not in the middle of a longer class name.
const GUARD = '(?<!dark:(?:hover:|focus:)?)(?<![\\w-])'

export function mapColours(src) {
  let out = src
  for (const [family, token] of Object.entries(STATUS)) {
    out = out.replace(new RegExp(`${GUARD}bg-${family}-(?:50|100)\\b`, 'g'), `bg-${token}-soft`)
    out = out.replace(new RegExp(`${GUARD}text-${family}-(?:600|700|800|900|950)\\b`, 'g'), `text-${token}`)
    // A border with its own opacity (border-amber-300/40) is a gold or accent line on a dark surface: left alone.
    out = out.replace(new RegExp(`${GUARD}border-${family}-(?:200|300|400)(?![\\w/])`, 'g'), `border-${token}/30`)
  }
  for (const family of NEUTRAL) {
    out = out.replace(new RegExp(`${GUARD}bg-${family}-(?:50|100)\\b`, 'g'), 'bg-secondary')
    out = out.replace(new RegExp(`${GUARD}text-${family}-(?:600|700|800)\\b`, 'g'), 'text-muted-foreground')
    out = out.replace(new RegExp(`${GUARD}text-${family}-900\\b`, 'g'), 'text-foreground')
    out = out.replace(new RegExp(`${GUARD}border-${family}-(?:200|300)(?![\\w/])`, 'g'), 'border-border')
  }
  // Repair for the first version of this pass, which turned border-amber-300/40 into border-warning/30/40
  // (not a valid class). The original opacity is kept and the original palette colour is put back.
  const BACK = { success: 'emerald', warning: 'amber', danger: 'red', info: 'sky' }
  out = out.replace(/(?<![\w-])border-(success|warning|danger|info)\/30\/(\d+)/g, (_m, t, n) => `border-${BACK[t]}-300/${n}`)
  return out
}
