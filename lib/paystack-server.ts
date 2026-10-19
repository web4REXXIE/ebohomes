// SERVER ONLY. Settles one Paystack transaction by asking Paystack directly. Used by BOTH the webhook and the
// status route, so the result never depends on which one arrives first, or on a browser redirect.
import type { SupabaseClient } from '@supabase/supabase-js'
import { decideSettlement, nextStatus, type TxStatus } from './paystack'

export type SettleResult = {
  found: boolean
  status: TxStatus | null
  changed: boolean // true only for the call that moved the row to a new status
  linked: boolean // true when the charge is linked to a row in the payments table
  providerError: boolean // Paystack could not be reached or answered badly: safe to retry later
}

const OPEN: TxStatus[] = ['initiated', 'failed', 'abandoned']

async function readRow(db: SupabaseClient, reference: string) {
  const { data } = await db.from('paystack_transactions')
    .select('id, reference, status, amount_kobo, currency, reconciled_payment_id')
    .eq('reference', reference).maybeSingle()
  return data as any
}

async function tryLink(db: SupabaseClient, reference: string): Promise<boolean> {
  // The database function (20261024_04, not installed yet) creates the payments row exactly once.
  // Until it exists this returns false and admins reconcile by hand from the notification.
  try {
    const { error } = await db.rpc('eb_link_paystack_payment', { p_reference: reference })
    return !error
  } catch {
    return false
  }
}

export async function settleReference(
  db: SupabaseClient, secret: string, reference: string, fetchImpl: typeof fetch = fetch,
): Promise<SettleResult> {
  let row = await readRow(db, reference)
  if (!row) return { found: false, status: null, changed: false, linked: false, providerError: false }
  let status = row.status as TxStatus
  let changed = false

  if (status !== 'paid' && status !== 'mismatch') {
    let json: any = null
    try {
      const res = await fetchImpl(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (!res.ok) return { found: true, status, changed: false, linked: false, providerError: true }
      json = await res.json()
    } catch {
      return { found: true, status, changed: false, linked: false, providerError: true }
    }
    const data = json?.data ?? null
    const next = nextStatus(status, decideSettlement(
      { reference, amount_kobo: Number(row.amount_kobo), currency: row.currency }, data))
    if (next) {
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = { status: next, raw_verify: data, updated_at: now }
      if (next === 'paid') {
        patch.paystack_transaction_id = data?.id != null ? String(data.id) : null
        patch.channel = data?.channel ?? null
        patch.paid_at = data?.paid_at ?? now
      }
      // Conditional update: only one caller can move an open row, so duplicates are harmless.
      const { data: upd, error } = await db.from('paystack_transactions')
        .update(patch).eq('id', row.id).in('status', OPEN).select('id')
      if (error) return { found: true, status, changed: false, linked: false, providerError: true }
      if (upd && upd.length) { status = next; changed = true } else {
        row = (await readRow(db, reference)) ?? row
        status = row.status as TxStatus
      }
    }
  }

  let linked = !!row.reconciled_payment_id
  if (status === 'paid' && !linked) linked = await tryLink(db, reference)

  if (changed && status === 'paid') {
    try {
      await db.rpc('notify_admins', {
        p_title: 'Online payment received',
        p_message: linked
          ? 'A Paystack payment was confirmed by the server and added to Payments. Please verify it.'
          : 'A Paystack payment was confirmed by the server but is not in Payments yet. Reconcile it by hand.',
        p_link: '/admin/payments', p_type: 'payment',
      })
    } catch { /* best effort only */ }
  }
  return { found: true, status, changed, linked, providerError: false }
}