// Stage 14 guard rails for the public pages. Reads source only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const about = readFileSync('app/about/page.tsx', 'utf8')
const contact = readFileSync('app/contact/page.tsx', 'utf8')
const legal = readFileSync('components/legal-layout.tsx', 'utf8')
const pages = ['privacy', 'terms', 'cookies'].map((n) => [n, readFileSync(`app/${n}/page.tsx`, 'utf8')])

// Contact details come from the one constants file, never typed in
for (const [name, src] of [['about', about], ['contact', contact]]) {
  assert.ok(!/2348001234567/.test(src), `${name}: placeholder phone number must not appear`)
  assert.ok(!/support@ebohomes\.com/i.test(src), `${name}: made-up email must not appear`)
}
assert.ok(/EBOHOMES_EMAIL/.test(about) && /EBOHOMES_WHATSAPP/.test(about), 'about uses lib/contact')
assert.ok(/EBOHOMES_EMAIL/.test(contact) && /EBOHOMES_WHATSAPP/.test(contact) && /EBOHOMES_PHONE_DISPLAY/.test(contact))

// Contact form still writes to the same table with the same fields
assert.ok(/from\('contact_messages'\)\.insert\(/.test(contact))
for (const f of ['name:', 'email:', 'phone:', 'subject:', 'message:']) assert.ok(contact.includes(f), `contact form still sends ${f}`)

// No invented statistics or unverifiable promises
for (const [name, src] of [['about', about], ['contact', contact]]) {
  for (const bad of [/thousands of/i, /24\/7/i, /100%/, /award-winning/i, /never share your data/i]) {
    assert.ok(!bad.test(src), `${name}: must not contain ${bad}`)
  }
}

// About carries the mission and the honesty limit
assert.ok(/trustworthy way to discover, understand and rent property in Nigeria/.test(about))
assert.ok(/not a guarantee/.test(about))

// Legal pages: still the same three, still use the shared frame, titles are not doubled by the site template
for (const [name, src] of pages) {
  assert.ok(/LegalLayout/.test(src), `${name} uses LegalLayout`)
  assert.ok(!/title: '[^']*\| EboHomes'/.test(src), `${name} title must not repeat the site name`)
}
assert.ok(/'\/privacy'/.test(legal) && /'\/terms'/.test(legal) && /'\/cookies'/.test(legal))
assert.ok(!/#[0-9A-Fa-f]{6}/.test(legal), 'legal layout uses theme colours, not hard-coded hex')

console.log('public-pages-contract: ok')
