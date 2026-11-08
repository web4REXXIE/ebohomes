// Stage 13 guard rails: the redesign must keep the real authentication calls and flow. Reads source only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const login = readFileSync('app/login/page.tsx', 'utf8')
const forgot = readFileSync('app/forgot-password/page.tsx', 'utf8')
const reset = readFileSync('app/reset-password/page.tsx', 'utf8')
const verifyEmail = readFileSync('components/auth/verify-email.tsx', 'utf8')
const fields = readFileSync('components/auth/auth-fields.tsx', 'utf8')
const shell = readFileSync('components/auth/auth-shell.tsx', 'utf8')

// Real Supabase calls stay connected (nothing is simulated)
for (const call of ['auth.signUp(', 'auth.signInWithPassword(', 'auth.signInWithOAuth(', "from('profiles')"]) {
  assert.ok(login.includes(call), `login must still call ${call}`)
}
for (const call of ['auth.resetPasswordForEmail(', "type: 'recovery'", 'auth.updateUser(', 'auth.signOut(']) {
  assert.ok(forgot.includes(call), `forgot-password must still call ${call}`)
}
for (const call of ['auth.resend(', "type: 'email'", 'auth.verifyOtp(']) {
  assert.ok(verifyEmail.includes(call), `verify-email must still call ${call}`)
}

// Redirect rules after login are unchanged
assert.ok(/'\/dashboard\/verify'/.test(login) && /'\/dashboard'/.test(login) && /router\.push\('\/'\)/.test(login))
assert.ok(/redirect\('\/forgot-password'\)/.test(reset), 'old reset links still redirect')

// Signup keeps its three steps and the tenant / landlord roles
assert.ok(/\['Account', 'Role', 'Verify email'\]/.test(login))
assert.ok(/value: 'tenant'/.test(login) && /value: 'landlord'/.test(login))

// Honesty: no invented statistics or unverifiable promises on the auth screens
const copy = login + shell + forgot
for (const bad of [/thousands of/i, /256-bit/i, /24\/7/i, /never share your information/i, /verified platform/i]) {
  assert.ok(!bad.test(copy), `auth copy must not contain ${bad}`)
}

// Contact number comes from the one constant, never typed in
assert.ok(!/2349169069445/.test(login + shell), 'WhatsApp number must come from lib/contact')

// Accessibility basics of the shared fields
assert.ok(/htmlFor=\{fieldId\}/.test(fields), 'labels are tied to inputs')
assert.ok(/aria-invalid/.test(fields) && /role=\{tone === 'error' \? 'alert' : 'status'\}/.test(fields))
assert.ok(/aria-pressed=\{visible\}/.test(fields), 'password toggle exposes its state')
assert.ok(/h-11 w-11/.test(fields), 'password toggle is at least 44px')

console.log('auth-pages-contract: ok')
