// Stage 19c guard rails: accessibility of public, tenant, landlord and inspector pages. Plain Node, source only.
// (Admin pages have their own guard in admin-a11y-stage18l.test.mjs.)
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function tsx(dir) {
  if (dir === 'app/admin' || dir === 'components/ui') return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? tsx(p.replace(/\\/g, '/')) : p.endsWith('.tsx') ? [p] : []
  })
}
// End of a JSX tag, skipping {...} so that arrow functions do not end it early.
function tagEnd(s, start) {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0 && s[i - 1] !== '=') return i
  }
  return -1
}
const files = [...tsx('app'), ...tsx('components')]
assert.ok(files.length > 100, 'source files found')

for (const file of files) {
  const src = readFileSync(file, 'utf8')

  // 1. Every field has a name: a wrapping label, an id for a label, an aria-label, or it is a hidden file input.
  for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
    const tag = src.slice(m.index, tagEnd(src, m.index) + 1)
    if (/type="hidden"/.test(tag) || /\{\.\.\./.test(tag)) continue
    if (/type="file"/.test(tag) && /\b(hidden|sr-only)\b/.test(tag)) continue
    const before = src.slice(0, m.index)
    const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>')
    assert.ok(wrapped || /aria-label|aria-labelledby|\bid=/.test(tag), `${file}: unlabelled field: ${tag.slice(0, 70).replace(/\s+/g, ' ')}`)
  }

  // 2. Every label connected with htmlFor points at an id that exists in the same file.
  for (const m of src.matchAll(/htmlFor="([^"]+)"/g)) assert.ok(src.includes(`id="${m[1]}"`), `${file}: htmlFor="${m[1]}" has no matching id`)

  // 3. No text under 12px.
  assert.doesNotMatch(src, /text-\[(?:8|9|10|11)px\]/, `${file}: text under 12px`)

  // 4. The outline is only removed where focus is moved by code (tabIndex -1), where the control is read-only, or
  //    where another focus style replaces it. Keyboard users must always see where they are.
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const cls = m[1] ?? m[2]
    if (!/\boutline-none\b/.test(cls)) continue
    const open = src.lastIndexOf('<', m.index)
    const tag = src.slice(open, tagEnd(src, open) + 1)
    assert.ok(/focus(-visible|-within)?:(ring|outline|border|shadow)/.test(cls) || /tabIndex=\{-1\}/.test(tag) || /\breadOnly\b/.test(tag),
      `${file}: outline removed with no replacement: ${tag.slice(0, 80).replace(/\s+/g, ' ')}`)
  }

  // 5. No invalid doubled opacity such as border-warning/30/40 (from an earlier colour pass).
  assert.doesNotMatch(src, /(?:bg|text|border)-[a-z-]+\/\d+\/\d+/, `${file}: doubled opacity class`)

  // 6. Decorative images are hidden from screen readers and informative ones have a description.
  for (const m of src.matchAll(/<img\b/g)) {
    const tag = src.slice(m.index, tagEnd(src, m.index) + 1)
    assert.ok(/\balt=/.test(tag) || /\{\.\.\./.test(tag), `${file}: image without alt`)
  }
}

// ---- The shared modal hook ----
const hook = readFileSync('lib/use-modal-a11y.ts', 'utf8')
assert.match(hook, /e\.key === 'Escape'/, 'Escape closes')
assert.match(hook, /e\.key !== 'Tab'/, 'Tab is handled')
assert.match(hook, /e\.shiftKey/, 'Shift+Tab is handled')
assert.match(hook, /opener\.focus\(\)/, 'focus returns to the opener')
assert.match(hook, /canCloseRef\.current/, 'closing can be blocked while saving')
assert.match(hook, /removeEventListener\('keydown'/, 'listener is removed')

// ---- The four modals are real dialogs ----
const MODALS = {
  'components/create-tenancy-modal.tsx': { id: 'create-tenancy-title', call: 'useModalA11y(onClose)' },
  'components/record-payment-modal.tsx': { id: 'record-payment-title', call: 'useModalA11y(onClose, !saving)' },
  'components/report-listing-modal.tsx': { id: 'report-listing-title', call: 'useModalA11y(onClose)' },
  'components/share-button.tsx': { id: 'share-title', call: 'useModalA11y(onClose)' },
}
for (const [file, { id, call }] of Object.entries(MODALS)) {
  const src = readFileSync(file, 'utf8')
  assert.ok(src.includes(call), `${file}: uses the hook`)
  assert.match(src, /role="dialog" aria-modal="true"/, `${file}: dialog role`)
  assert.ok(src.includes(`aria-labelledby="${id}"`) && src.includes(`id="${id}"`), `${file}: dialog is labelled by its title`)
  assert.match(src, /tabIndex=\{-1\}/, `${file}: panel can take focus`)
  assert.match(src, /aria-label="Close"/, `${file}: close button has a name`)
}
assert.ok(readFileSync('components/record-payment-modal.tsx', 'utf8').includes('onClick={saving ? undefined : onClose}'), 'record payment cannot be dismissed mid-save (unchanged)')

// ---- Existing behaviour kept ----
assert.match(readFileSync('app/globals.css', 'utf8'), /prefers-reduced-motion: reduce/, 'reduced motion kept')
assert.match(readFileSync('components/confirm-dialog.tsx', 'utf8'), /Escape/, 'confirm dialog untouched')

console.log('a11y-stage19c: ok')
