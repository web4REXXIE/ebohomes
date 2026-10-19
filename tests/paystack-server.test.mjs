import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

const opts = { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }
const url = (js) => 'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
const pay = url(transpileModule(readFileSync('lib/paystack.ts', 'utf8'), opts).outputText)
const serverJs = transpileModule(readFileSync('lib/paystack-server.ts', 'utf8'), opts).outputText.replace("'./paystack'", `'${pay}'`)
const { settleReference } = await import(url(serverJs))

// Minimal in-memory stand-in for the one table and the two RPCs the code touches.
function fakeDb(row, { linkWorks = true } = {}) {
  const log = { updates: 0, rpc: [] }
  const matches = (f) => f.every(([k, c, v]) => (k === 'eq' ? row[c] === v : v.includes(row[c])))
  return {
    log,
    from() {
      const f = []; let patch = null
      const api = {
        select() { return api },
        update(p) { patch = p; return api },
        eq(c, v) { f.push(['eq', c, v]); return api },
        in(c, v) { f.push(['in', c, v]); return api },
        async maybeSingle() { return { data: matches(f) ? { ...row } : null, error: null } },
        then(res, rej) {
          let out
          if (patch && matches(f)) { Object.assign(row, patch); log.updates++; out = { data: [{ id: row.id }], error: null } }
          else out = { data: [], error: null }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return api
    },
    async rpc(name, args) {
      log.rpc.push(name)
      if (name === 'eb_link_paystack_payment') {
        if (!linkWorks) return { data: null, error: { message: 'Could not find the function' } }
        row.reconciled_payment_id = 'pay-1'
        return { data: 'pay-1', error: null }
      }
      return { data: null, error: null }
    },
  }
}
const mkRow = (o = {}) => ({ id: 'r1', reference: 'EBO-1', status: 'initiated', amount_kobo: 5000000, currency: 'NGN', reconciled_payment_id: null, ...o })
const reply = (data, ok = true) => async () => ({ ok, json: async () => ({ data }) })
const good = { status: 'success', reference: 'EBO-1', amount: 5000000, currency: 'NGN', id: 77, channel: 'card' }

// 1. Successful payment: marked paid once, linked to payments, admins told.
{
  const row = mkRow(); const db = fakeDb(row)
  const r = await settleReference(db, 'sk', 'EBO-1', reply(good))
  assert.equal(r.status, 'paid'); assert.equal(r.changed, true); assert.equal(r.linked, true)
  assert.equal(row.paystack_transaction_id, '77')
  assert.deepEqual(db.log.rpc, ['eb_link_paystack_payment', 'notify_admins'])
}
// 2. Duplicate delivery (webhook + return page, or Paystack retry): nothing repeats, no second payment, no second alert.
{
  const row = mkRow(); const db = fakeDb(row)
  await settleReference(db, 'sk', 'EBO-1', reply(good))
  const again = await settleReference(db, 'sk', 'EBO-1', reply(good))
  assert.equal(again.status, 'paid'); assert.equal(again.changed, false)
  assert.equal(db.log.updates, 1)
  assert.equal(db.log.rpc.filter((n) => n === 'eb_link_paystack_payment').length, 1)
  assert.equal(db.log.rpc.filter((n) => n === 'notify_admins').length, 1)
}
// 3. A late "failed" cannot undo a paid payment.
{
  const row = mkRow({ status: 'paid', reconciled_payment_id: 'pay-1' }); const db = fakeDb(row)
  const r = await settleReference(db, 'sk', 'EBO-1', reply({ ...good, status: 'failed' }))
  assert.equal(r.status, 'paid'); assert.equal(db.log.updates, 0)
}
// 4. Pending: nothing changes, nothing linked.
{
  const row = mkRow(); const db = fakeDb(row)
  const r = await settleReference(db, 'sk', 'EBO-1', reply({ ...good, status: 'ongoing' }))
  assert.equal(r.status, 'initiated'); assert.equal(r.changed, false); assert.deepEqual(db.log.rpc, [])
}
// 5. Failed and cancelled are recorded and nothing is linked.
for (const [st, want] of [['failed', 'failed'], ['abandoned', 'abandoned']]) {
  const row = mkRow(); const db = fakeDb(row)
  const r = await settleReference(db, 'sk', 'EBO-1', reply({ ...good, status: st }))
  assert.equal(r.status, want); assert.deepEqual(db.log.rpc, [])
}
// 6. Cancelled first, paid later (customer reopens the same payment page): allowed.
{
  const row = mkRow({ status: 'abandoned' }); const db = fakeDb(row)
  const r = await settleReference(db, 'sk', 'EBO-1', reply(good))
  assert.equal(r.status, 'paid')
}
// 7. Wrong amount: flagged for manual review, never linked, never paid.
{
  const row = mkRow(); const db = fakeDb(row)
  const r = await settleReference(db, 'sk', 'EBO-1', reply({ ...good, amount: 100 }))
  assert.equal(r.status, 'mismatch'); assert.equal(r.linked, false); assert.deepEqual(db.log.rpc, [])
}
// 8. Paystack unreachable or erroring: safe to retry, nothing changes.
{
  const row = mkRow(); const db = fakeDb(row)
  const r1 = await settleReference(db, 'sk', 'EBO-1', reply(null, false))
  assert.equal(r1.providerError, true); assert.equal(row.status, 'initiated')
  const r2 = await settleReference(db, 'sk', 'EBO-1', async () => { throw new Error('network') })
  assert.equal(r2.providerError, true); assert.equal(row.status, 'initiated')
}
// 9. Unknown reference is ignored.
{
  const db = fakeDb(mkRow()); const r = await settleReference(db, 'sk', 'NOPE', reply(good))
  assert.equal(r.found, false)
}
// 10. The payments link is not installed yet: payment is still recorded as paid, linked=false, admins told to reconcile by hand.
{
  const row = mkRow(); const db = fakeDb(row, { linkWorks: false })
  const r = await settleReference(db, 'sk', 'EBO-1', reply(good))
  assert.equal(r.status, 'paid'); assert.equal(r.linked, false)
  // A later retry (webhook resend) tries the link again.
  const db2 = fakeDb(row, { linkWorks: true })
  const r2 = await settleReference(db2, 'sk', 'EBO-1', reply(good))
  assert.equal(r2.linked, true); assert.equal(r2.changed, false)
}
console.log('paystack-server ok')
