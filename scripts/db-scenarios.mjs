// EboHomes Phase 11.12: live database scenarios, including real concurrency.
// RUN THIS ONLY AGAINST A TEST SUPABASE PROJECT. It creates test users, one test listing and test applications, offers,
// a tenancy and a payment, then tries to delete them. It is NOT part of "pnpm test" and CI never runs it.
//
//   $env:TEST_SUPABASE_URL = "https://<test-project>.supabase.co"
//   $env:TEST_SUPABASE_ANON_KEY = "<anon key of the TEST project>"
//   $env:TEST_SUPABASE_SERVICE_KEY = "<service role key of the TEST project>"
//   $env:EBOHOMES_DB_TESTS = "yes-this-is-a-test-project"
//   pnpm test:db
//
// Every scenario prints PASS, FAIL or SKIP. SKIP means a fixture could not be built (the reason is printed), which proves nothing.
// Exit code 1 if anything FAILS.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.TEST_SUPABASE_URL
const ANON = process.env.TEST_SUPABASE_ANON_KEY
const SERVICE = process.env.TEST_SUPABASE_SERVICE_KEY
if (process.env.EBOHOMES_DB_TESTS !== 'yes-this-is-a-test-project' || !URL_ || !ANON || !SERVICE) {
  console.log('Not running. Set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_KEY and EBOHOMES_DB_TESTS=yes-this-is-a-test-project (TEST project only).')
  process.exit(2)
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL === URL_) {
  console.log('Refusing: TEST_SUPABASE_URL is the same project as NEXT_PUBLIC_SUPABASE_URL (your live site).')
  process.exit(2)
}

const RUN = randomUUID().slice(0, 8)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(URL_, SERVICE, opts)
const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const startDate = iso(new Date(today.getTime() + 14 * 86400000))

class Skip extends Error {}
const ok = (c, m) => { if (!c) throw new Error(m) }
const wins = (rs) => rs.filter((r) => !r.error).length
const rows = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data ?? [] }

const users = {}
const made = { users: [], listings: [], apps: [], tenancies: [] }

async function mkUser(role, tag) {
  const email = `ebotest.${RUN}.${tag}@example.com`
  const password = `Tt!${randomUUID()}`
  const c = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `EBOTEST ${tag}` } })
  if (c.error) throw new Skip(`cannot create ${tag}: ${c.error.message}`)
  const id = c.data.user.id
  made.users.push(id)
  const p = await service.from('profiles').upsert({ id, role, full_name: `EBOTEST ${tag}` }, { onConflict: 'id' })
  if (p.error) throw new Skip(`cannot set the profile of ${tag}: ${p.error.message}`)
  const client = createClient(URL_, ANON, opts)
  const s = await client.auth.signInWithPassword({ email, password })
  if (s.error) throw new Skip(`cannot sign in ${tag}: ${s.error.message}`)
  users[tag] = { id, client }
}

const listingRow = (landlord, status, tag) => ({
  landlord_id: landlord, title: `[EBOTEST ${RUN}] ${tag}`, description: 'EBOTEST', listing_type: 'rent', price_monthly: 100000,
  location_text: 'Abakaliki', lat: 6.3249, lng: 8.1137, property_type: 'Bungalow', bedrooms: 2, amenities: [], photos: [],
  furnished: false, status,
})
async function mkListing(landlord, status, tag) {
  const { data, error } = await service.from('listings').insert(listingRow(landlord, status, tag)).select('id').single()
  if (error) throw new Skip(`cannot create a listing: ${error.message}`)
  made.listings.push(data.id)
  return data.id
}
const appRow = (tenant, listing, landlord) => ({ tenant_id: tenant, listing_id: listing, landlord_id: landlord, status: 'pending', message: null, application_data: {} })
const apply = (tag, listing, landlordTag = 'L1', as = tag) =>
  users[as].client.from('applications').insert(appRow(users[tag].id, listing, users[landlordTag].id)).select('id').single()
const appStatus = async (id) => (await rows(service.from('applications').select('status').eq('id', id)))[0]?.status

const results = []
async function scenario(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS  ' + name) }
  catch (e) {
    const kind = e instanceof Skip ? 'SKIP' : 'FAIL'
    results.push([kind, name, e.message]); console.log(`${kind}  ${name}\n      ${e.message}`)
  }
}
const need = (v, what) => { if (!v) throw new Skip('needs: ' + what); return v }

let A, P, appT1, appT2, appT3, winner, loser, tenancy

await scenario('fixtures: users and listings', async () => {
  await mkUser('admin', 'admin'); await mkUser('landlord', 'L1'); await mkUser('landlord', 'L2')
  for (const t of ['T1', 'T2', 'T3']) await mkUser('tenant', t)
  A = await mkListing(users.L1.id, 'approved', 'open listing')
  P = await mkListing(users.L1.id, 'pending', 'not yet approved')
})

await scenario('a listing that is not approved takes no application', async () => {
  need(P, 'the pending listing')
  const r = await apply('T1', P)
  ok(r.error, 'an application on a pending listing was accepted')
})

await scenario('nobody can apply as someone else, to the wrong owner, or to their own listing', async () => {
  need(A, 'the open listing')
  ok((await apply('T2', A, 'L1', 'T1')).error, 'T1 applied in the name of T2')
  ok((await apply('T1', A, 'L2')).error, 'an application was routed to the wrong landlord')
  const own = await users.L1.client.from('applications').insert(appRow(users.L1.id, A, users.L1.id))
  ok(own.error, 'a landlord applied for their own listing')
})

await scenario('two identical applications at the same moment: exactly one is kept', async () => {
  need(A, 'the open listing')
  const rs = await Promise.all([apply('T1', A), apply('T1', A)])
  ok(wins(rs) === 1, `expected 1 application, got ${wins(rs)}`)
  appT1 = rs.find((r) => !r.error).data.id; made.apps.push(appT1)
})

await scenario('a landlord cannot read other landlords\' applications or decide one', async () => {
  need(appT1, 'T1\'s application')
  const other = await users.L2.client.from('applications').select('id').eq('id', appT1)
  ok(!other.error && (other.data ?? []).length === 0, 'another landlord can read the application')
  await users.L1.client.from('applications').update({ status: 'approved' }).eq('id', appT1)
  ok((await appStatus(appT1)) === 'pending', 'the landlord changed the status')
})

await scenario('a tenant cannot approve their own application', async () => {
  need(appT1, 'T1\'s application')
  await users.T1.client.from('applications').update({ status: 'approved' }).eq('id', appT1)
  ok((await appStatus(appT1)) === 'pending', 'the tenant changed the status')
})

await scenario('fixtures: two more applicants', async () => {
  need(A, 'the open listing')
  const [r2, r3] = await Promise.all([apply('T2', A), apply('T3', A)])
  if (r2.error || r3.error) throw new Skip((r2.error || r3.error).message)
  appT2 = r2.data.id; appT3 = r3.data.id; made.apps.push(appT2, appT3)
})

await scenario('two approvals for one property at the same moment: exactly one wins', async () => {
  need(appT1 && appT2, 'two open applications')
  const rs = await Promise.all([
    users.admin.client.rpc('admin_decide_application', { p_application: appT1, p_action: 'approve', p_note: null }),
    users.admin.client.rpc('admin_decide_application', { p_application: appT2, p_action: 'approve', p_note: null }),
  ])
  ok(wins(rs) === 1, `expected 1 approval, got ${wins(rs)}`)
  const approved = await rows(service.from('applications').select('id').eq('listing_id', A).eq('status', 'approved'))
  ok(approved.length === 1, `${approved.length} approved applications on one property`)
  winner = approved[0].id; loser = winner === appT1 ? appT2 : appT1
})

await scenario('offer accepted, then two tenancies requested at the same moment: exactly one is created', async () => {
  need(winner, 'an approved application')
  const wTag = winner === appT1 ? 'T1' : 'T2'
  const i = await users[wTag].client.from('applications').update({ tenant_interest_at: new Date().toISOString() }).eq('id', winner).select('id')
  if (i.error || !(i.data ?? []).length) throw new Skip('tenant interest could not be saved: ' + (i.error?.message ?? 'no row updated'))
  const o = await users.admin.client.rpc('eb_issue_rental_offer', {
    p_application: winner, p_rent: 100000, p_period: 'monthly', p_duration_months: 12, p_start: startDate, p_deposit: 0,
    p_charges: [], p_schedule: null, p_notice_days: null, p_rules: null, p_note: null, p_hours: 72,
  })
  ok(!o.error, 'offer: ' + o.error?.message)
  const r = await users[wTag].client.rpc('eb_respond_rental_offer', { p_offer: o.data, p_action: 'accept', p_note: null, p_counter: null })
  ok(!r.error, 'accept: ' + r.error?.message)
  const rs = await Promise.all([
    users.admin.client.rpc('eb_create_tenancy_from_offer', { p_offer: o.data }),
    users.admin.client.rpc('eb_create_tenancy_from_offer', { p_offer: o.data }),
  ])
  ok(wins(rs) === 1, `expected 1 tenancy, got ${wins(rs)}`)
  const t = await rows(service.from('tenancies').select('id, status').eq('listing_id', A))
  ok(t.length === 1, `${t.length} tenancies on one property`)
  tenancy = t[0].id; made.tenancies.push(tenancy)
})

let payer
await scenario('fixtures: signed agreement and a verified rent payment', async () => {
  need(tenancy, 'a tenancy')
  const terms = await rows(service.from('rental_terms').select('id').eq('tenancy_id', tenancy).order('version', { ascending: false }).limit(1))
  const s = await users.admin.client.rpc('record_signed_agreement', { p_terms: need(terms[0], 'rental terms').id, p_reference: `EBOTEST-${RUN}` })
  if (s.error) throw new Skip('signing: ' + s.error.message)
  payer = winner === appT1 ? users.T1.id : users.T2.id
  const p = await service.from('payments').insert({
    user_id: payer, listing_id: A, tenancy_id: tenancy, type: 'rent', amount: 100000, status: 'confirmed',
    verified_by: users.admin.id, reference: `EBOTEST-${RUN}`, payment_method: 'bank_transfer', source: 'manual',
  })
  if (p.error) throw new Skip('payment: ' + p.error.message)
})

await scenario('finalization (run twice at once): property rented, winner accepted, others not selected, nothing doubled', async () => {
  need(tenancy && payer, 'a verified payment')
  const rs = await Promise.all([service.rpc('eb_finalize_rental', { p_tenancy: tenancy }), service.rpc('eb_finalize_rental', { p_tenancy: tenancy })])
  ok(rs.every((r) => !r.error), 'finalize: ' + rs.map((r) => r.error?.message).filter(Boolean).join(' | '))
  const l = await rows(service.from('listings').select('status').eq('id', A))
  ok(l[0].status === 'rented', `listing is ${l[0].status}`)
  ok((await appStatus(winner)) === 'accepted', 'the winning application is not accepted')
  ok((await appStatus(loser)) === 'not_selected', 'the second applicant is not "not selected"')
  ok((await appStatus(appT3)) === 'not_selected', 'the third applicant is not "not selected"')
  const t = await rows(service.from('tenancies').select('status').eq('id', tenancy))
  ok(t[0].status === 'active', `tenancy is ${t[0].status}`)
})

await scenario('a rented property takes no new application', async () => {
  need(tenancy && payer, 'a finalized rental')
  const r = await apply('T3', A)
  ok(r.error, 'an application on a rented property was accepted')
})

await scenario('competing applicants get one notice each, not two (needs 20261207_04)', async () => {
  need(tenancy && payer, 'a finalized rental')
  for (const id of [loser === appT1 ? users.T1.id : users.T2.id, users.T3.id]) {
    const n = await rows(service.from('notifications').select('title').eq('user_id', id))
    const generic = n.filter((x) => x.title === 'Application update').length
    const proper = n.filter((x) => x.title === 'This property was rented to another applicant').length
    ok(proper === 1, `expected 1 "rented to another applicant" notice, got ${proper}`)
    ok(generic === 0, `got ${generic} generic "Application update" notice(s): run 20261207_04_notification_gaps.sql`)
  }
})

// ---- cleanup (best effort: guards and audit tables may refuse some deletes)
if (process.env.KEEP_TEST_DATA !== '1') {
  const left = []
  const del = async (label, q) => { try { const { error } = await q; if (error) left.push(`${label}: ${error.message}`) } catch (e) { left.push(`${label}: ${e.message}`) } }
  for (const u of made.users) await del('notifications', service.from('notifications').delete().eq('user_id', u))
  for (const t of made.tenancies) {
    await del('payments', service.from('payments').delete().eq('tenancy_id', t))
    await del('rental_terms', service.from('rental_terms').delete().eq('tenancy_id', t))
    await del('tenancies', service.from('tenancies').delete().eq('id', t))
  }
  for (const a of made.apps) await del('rental_offers', service.from('rental_offers').delete().eq('application_id', a))
  for (const a of made.apps) await del('applications', service.from('applications').delete().eq('id', a))
  for (const l of made.listings) await del('listings', service.from('listings').delete().eq('id', l))
  for (const u of made.users) { await del('profiles', service.from('profiles').delete().eq('id', u)); await del('auth user', service.auth.admin.deleteUser(u)) }
  if (left.length) console.log(`\nCleanup could not remove everything (fine on a test project). Rows are tagged EBOTEST ${RUN}:\n  ` + [...new Set(left)].join('\n  '))
}

const f = results.filter((r) => r[0] === 'FAIL').length, s = results.filter((r) => r[0] === 'SKIP').length
console.log(`\n${results.length - f - s} passed, ${f} failed, ${s} skipped.` + (s ? ' Skipped scenarios prove nothing: read their reasons.' : ''))
process.exit(f ? 1 : 0)
