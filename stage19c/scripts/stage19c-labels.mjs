// Stage 19c, part 1: gives unlabelled form fields an accessible name. Run from the repo root:
//   node scripts/stage19c-labels.mjs          (changes files)
//   node scripts/stage19c-labels.mjs --check  (only reports, changes nothing)
// Safe to run twice. Same method as the Stage 18 admin pass, now for public, tenant, landlord and inspector pages.
// It only adds aria-label attributes. A field that already has a wrapping <label>, an id (for a <label htmlFor>),
// an aria-label, or is a hidden or visually hidden file input is skipped. Anything it cannot name from its
// placeholder or a known value is listed for you to label by hand.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHECK = process.argv.includes('--check')

function files(dir) {
  if (['app/admin', 'components/ui'].includes(dir.replace(/\\/g, '/'))) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : []
  })
}
// End of a JSX tag, skipping {...} so that arrow functions (=>) do not end it early.
export function tagEnd(s, start) {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0 && s[i - 1] !== '=') return i
  }
  return -1
}
// A short accessible name from a long placeholder: the text before the first bracket, comma, full stop or ellipsis.
function short(text) {
  const cut = text.split(/\s*[(,…]|\.\s|\.$/)[0].trim()
  return (cut.length >= 3 ? cut : text.trim()).replace(/"/g, '&quot;')
}

// Fields with no placeholder: a name chosen from the value they edit. Written from the surrounding page text.
const BY_VALUE = {
  "form.claimant_relationship ?? ''": 'Relationship to the property',
  'answer': 'Corrected answer',
  "f.mp ?? 'normal'": 'Priority',
  "f.dc ?? 'other'": 'Dispute category',
  "f.s_date ?? ''": 'Date paid',
  'url': 'Property link',
}

// A visible <label> that sits next to its field but is not connected to it is not announced. Connect them with
// an id and htmlFor. The id is made from the file name and the label text, and is unique within the file.
function slug(t) { return t.toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function associate(src, file) {
  const base = file.replace(/\\/g, '/').split('/').pop().replace(/\.tsx$/, '').replace(/^page$/, 'page')
  const used = new Set([...src.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  let n = 0
  const re = /<label((?:\s+className="[^"]*")?)>([^<{}]+)<\/label>(\s*)<(input|select|textarea)\b/g
  const out = src.replace(re, (all, cls, text, gap, tag, offset) => {
    const end = tagEnd(src, offset + all.length - tag.length - 1)
    const fieldTag = src.slice(offset + all.length - tag.length - 1, end + 1)
    if (/\bid=|aria-label/.test(fieldTag) || !slug(text)) return all
    let id = `${slug(base)}-${slug(text)}`; let k = 2
    while (used.has(id)) id = `${slug(base)}-${slug(text)}-${k++}`
    used.add(id); n++
    return `<label htmlFor="${id}"${cls}>${text}</label>${gap}<${tag} id="${id}"`
  })
  return { out, n }
}

let added = 0, linked = 0
const manual = []
for (const file of [...files('app'), ...files('components')]) {
  const original = readFileSync(file, 'utf8')
  const assoc = associate(original, file)
  linked += assoc.n
  const src = assoc.out
  let out = '', i = 0, re = /<(input|textarea|select)\b/g, m, touched = false
  while ((m = re.exec(src))) {
    const end = tagEnd(src, m.index)
    if (end < 0) continue
    const tag = src.slice(m.index, end + 1)
    const before = src.slice(0, m.index)
    const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>')
    const named = /aria-label|aria-labelledby|\bid=|type="hidden"|\{\.\.\./.test(tag)
    const hiddenFile = /type="file"/.test(tag) && /\b(hidden|sr-only)\b/.test(tag)
    if (wrapped || named || hiddenFile) continue
    const lit = tag.match(/placeholder="([^"]+)"/)
    const expr = tag.match(/placeholder=\{((?:[^{}]|\{[^{}]*\})*)\}/)
    let label = null
    const val = tag.match(/value=\{((?:[^{}]|\{[^{}]*\})*)\}/)
    if (lit) label = `aria-label="${short(lit[1])}"`
    else if (expr) label = `aria-label={${expr[1]}}`
    else if (val && BY_VALUE[val[1].trim()]) label = `aria-label="${BY_VALUE[val[1].trim()]}"`
    if (!label) { manual.push(`${file}:${before.split('\n').length}  ${tag.slice(0, 90).replace(/\s+/g, ' ')}`); continue }
    out += src.slice(i, m.index) + `<${m[1]} ${label}`
    i = m.index + m[0].length
    added++; touched = true
  }
  if (touched) out += src.slice(i)
  const result = touched ? out : src
  if (result !== original) { if (!CHECK) writeFileSync(file, result); console.log(`${CHECK ? 'would update' : 'updated'} ${file}`) }
}
console.log(`\n${linked} visible labels ${CHECK ? 'would be ' : ''}connected to their field. ${added} fields ${CHECK ? 'would be ' : ''}given an aria-label. ${manual.length} need a label by hand:`)
manual.forEach((x) => console.log('  ' + x))
