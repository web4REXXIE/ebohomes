'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, CreditCard, Landmark, Copy, Check, Receipt, ShieldCheck, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { paymentLabel, PAYMENT_STATE_NOTE, getPaymentState } from '@/lib/payment-status'
import { BANK_TRANSFER, amountLines, transferReference, type SignedTermsLike } from '@/lib/payment-instructions'

type Option = { purpose: 'rent' | 'deposit' | 'fees'; label: string; amount_kobo: number; paid: boolean }
type Props = {
  tenancyId: string
  terms?: SignedTermsLike | null // the SIGNED rental terms: the only source of agreed amounts
  title?: string | null
  reference?: string | null // tenancy reference, e.g. EBO-TEN-000006
  period?: string | null
}
type Method = 'bank' | 'online'

const naira = (kobo: number) => '\u20A6' + (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const nairaN = (n: number) => '\u20A6' + n.toLocaleString('en-NG', { maximumFractionDigits: 2 })

const PAY_TONE: Record<string, string> = {
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  legacy_confirmed: 'border-amber-300 bg-amber-50 text-amber-900',
  awaiting_verification: 'border-amber-300 bg-amber-50 text-amber-900',
  pending: 'border-slate-300 bg-slate-100 text-slate-800',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  other: 'border-slate-300 bg-slate-100 text-slate-800',
}

// The tenant's payment section. Two ways to pay are shown:
//  - Bank transfer: works now. The tenant NEVER marks a payment as paid or verified. EboHomes records and verifies.
//  - Pay online (Paystack): shown, but only usable when the server says it is switched on.
// The page you come back to from Paystack proves NOTHING. On return we ask the server, which asks Paystack.
export function PayOnlinePanel({ tenancyId, terms, title, reference, period }: Props) {
  const [options, setOptions] = useState<Option[] | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null) // null = still checking
  const [method, setMethod] = useState<Method>('bank')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [copied, setCopied] = useState<'number' | 'ref' | null>(null)
  const checked = useRef(false)

  const lines = amountLines(terms, period)
  const ref = transferReference(reference)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  const loadPayments = useCallback(async () => {
    const { data } = await supabase
      .from('payments')
      .select('id, tenancy_id, amount, type, status, receipt_code, created_at, verified_by, review_note')
      .eq('tenancy_id', tenancyId)
      .order('created_at', { ascending: false })
    setPayments(data ?? [])
  }, [tenancyId])

  const loadOptions = useCallback(async () => {
    const t = await token()
    if (!t) { setEnabled(false); setOptions([]); return }
    const res = await fetch(`/api/paystack/status?tenancy_id=${encodeURIComponent(tenancyId)}`, { headers: { Authorization: `Bearer ${t}` } })
    const j = await res.json().catch(() => null)
    setEnabled(!!j?.enabled)
    setOptions(j?.enabled && Array.isArray(j.options) ? j.options : [])
  }, [tenancyId])

  const confirmReturn = useCallback(async (reference: string) => {
    setMethod('online')
    setNotice({ ok: true, text: 'Checking your payment with Paystack. Please wait...' })
    for (let i = 0; i < 6; i++) {
      const t = await token()
      const res = await fetch(`/api/paystack/status?reference=${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${t}` } })
      const j = await res.json().catch(() => null)
      const s = j?.status as string | undefined
      if (s === 'paid') { setNotice({ ok: true, text: 'Paystack confirmed your payment. EboHomes will now record and check it. It is not shown as verified until EboHomes has checked it. Keep this reference: ' + reference }); return }
      if (s === 'failed') { setNotice({ ok: false, text: 'The payment failed. You were not charged. You can try again or pay by bank transfer.' }); return }
      if (s === 'abandoned') { setNotice({ ok: false, text: 'The payment was cancelled. You were not charged. You can try again.' }); return }
      if (s === 'mismatch') { setNotice({ ok: false, text: 'The payment did not match what was expected. Do not pay again. Contact EboHomes with this reference: ' + reference }); return }
      await new Promise((r) => setTimeout(r, 3000))
    }
    setNotice({ ok: true, text: 'We have not received confirmation from Paystack yet. If you were charged, it will show once confirmed. Reference: ' + reference })
  }, [])

  useEffect(() => {
    loadOptions()
    loadPayments()
    if (checked.current) return
    checked.current = true
    const r = new URLSearchParams(window.location.search).get('reference')
    if (r) confirmReturn(r)
  }, [loadOptions, loadPayments, confirmReturn])

  const pay = async (purpose: Option['purpose']) => {
    if (busy) return
    setBusy(purpose)
    setNotice(null)
    const t = await token()
    const res = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancy_id: tenancyId, purpose }),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.url) {
      setBusy(null)
      setNotice({ ok: false, text: j?.error ?? 'Could not start the payment. Try again.' })
      return
    }
    window.location.href = j.url
  }

  const copy = async (what: 'number' | 'ref', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  const onlineReady = enabled === true
  const hasAwaiting = payments.some((p) => getPaymentState(p) === 'awaiting_verification')
  const hasVerified = payments.some((p) => getPaymentState(p) === 'verified')
  const tab = (active: boolean) =>
    `flex-1 rounded-xl border-2 p-3 text-left text-sm transition min-h-14 ${active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary/60'}`

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-bold text-foreground">Pay for your tenancy</h3>
        <p className="text-xs text-muted-foreground">
          {title ?? 'Your tenancy'}{ref ? ` · ${ref}` : ''}
        </p>
      </div>

      {/* What is due */}
      {lines.length > 0 ? (
        <div className="rounded-lg bg-secondary p-3 text-sm">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ShieldCheck size={14} aria-hidden /> Amounts in your signed agreement
          </p>
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center justify-between py-1.5">
                <span className="text-foreground">{l.label}</span>
                <span className="text-base font-bold text-foreground">{nairaN(l.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            These figures come from your signed agreement, not the advertised listing price. EboHomes does not show a balance here because it cannot calculate one reliably yet.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">No payable amounts are recorded in your signed agreement.</p>
      )}

      {/* Where the tenant stands, from real payment records only */}
      {hasAwaiting && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>A payment has been recorded and EboHomes has not verified it yet. You do not need to pay again. Check the history below.</span>
        </p>
      )}
      {!hasAwaiting && hasVerified && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>EboHomes has verified at least one payment. Your receipts are in the history below.</span>
        </p>
      )}

      {/* Method */}
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Choose how to pay</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Payment method">
          <button type="button" role="radio" aria-checked={method === 'bank'} onClick={() => setMethod('bank')} className={tab(method === 'bank')}>
            <span className="flex items-center gap-2 font-semibold"><Landmark size={16} aria-hidden /> Bank transfer</span>
            <span className="block text-xs text-muted-foreground">Available now</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={method === 'online'}
            aria-disabled={!onlineReady}
            onClick={() => setMethod('online')}
            className={tab(method === 'online')}
          >
            <span className="flex items-center gap-2 font-semibold"><CreditCard size={16} aria-hidden /> Pay online</span>
            <span className="block text-xs text-muted-foreground">{enabled === null ? 'Checking...' : onlineReady ? 'Card or bank, via Paystack' : 'Coming soon'}</span>
          </button>
        </div>
      </div>

      {method === 'bank' && (
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">Transfer to this account</p>

          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bank</dt>
              <dd className="font-bold text-foreground">{BANK_TRANSFER.bankName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Account name</dt>
              <dd className="font-bold text-foreground">{BANK_TRANSFER.accountName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Account number</dt>
              <dd className="flex items-center gap-2">
                <b className="text-base tracking-wider text-foreground">{BANK_TRANSFER.accountNumber}</b>
                <button
                  type="button"
                  onClick={() => copy('number', BANK_TRANSFER.accountNumber)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold"
                  aria-label="Copy account number"
                >
                  {copied === 'number' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                  {copied === 'number' ? 'Copied' : 'Copy'}
                </button>
              </dd>
            </div>
            {ref && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-primary/5 p-2">
                <dt className="text-muted-foreground">Write this in the transfer</dt>
                <dd className="flex items-center gap-2">
                  <b className="text-foreground">{ref}</b>
                  <button
                    type="button"
                    onClick={() => copy('ref', ref)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold"
                    aria-label="Copy tenancy reference"
                  >
                    {copied === 'ref' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                    {copied === 'ref' ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
            )}
          </dl>

          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Transfer the amount from your signed agreement to the account above.</li>
            <li>Write your tenancy reference in the transfer description.</li>
            <li>EboHomes matches the transfer to your tenancy, records it and checks it.</li>
            <li>When it shows &ldquo;Verified by EboHomes&rdquo; below, your receipt is ready.</li>
          </ol>

          <p className="rounded-md bg-secondary p-2 text-xs font-semibold text-foreground">
            Your payment is not confirmed until it shows &ldquo;Verified by EboHomes&rdquo;. You cannot mark it as paid yourself, so there is nothing to press after you transfer. Keep your bank&rsquo;s transfer receipt.
          </p>
          <p className="text-xs text-muted-foreground">
            Only trust account details shown here after you sign in. If anyone sends you different details, do not pay. Contact EboHomes.
          </p>
        </div>
      )}

      {method === 'online' && (
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          {enabled === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Checking whether online payment is available...</p>
          ) : onlineReady ? (
            <>
              <p className="text-xs text-muted-foreground">Amounts come from your signed agreement.</p>
              {(options ?? []).length === 0 && !notice && <p className="text-xs text-muted-foreground">Nothing is due online for this agreement.</p>}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {(options ?? []).map((o) => (
                  <button
                    key={o.purpose}
                    disabled={!!busy || o.paid}
                    onClick={() => pay(o.purpose)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy === o.purpose ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CreditCard size={14} aria-hidden />}
                    {o.paid ? `${o.label} paid` : `Pay ${o.label.toLowerCase()} ${naira(o.amount_kobo)}`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Online payment is not switched on yet, so nothing can be charged here. Please pay by bank transfer for now. This option will open here once EboHomes switches it on.</p>
          )}
          {notice && (
            <p role={notice.ok ? 'status' : 'alert'} className={`rounded-md p-2 text-xs ${notice.ok ? 'bg-secondary text-foreground' : 'bg-red-50 text-red-900'}`}>
              {notice.text}
            </p>
          )}
        </div>
      )}

      {/* History */}
      <div>
        <h4 className="mb-2 text-sm font-bold text-foreground">Payment history</h4>
        {payments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => {
              const state = getPaymentState(p)
              return (
                <li key={p.id} className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-foreground">
                      {nairaN(Number(p.amount))} <span className="text-xs font-normal capitalize text-muted-foreground">{p.type}</span>
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${PAY_TONE[state]}`}>{paymentLabel(p)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{PAYMENT_STATE_NOTE[state]}</p>
                  {p.review_note && state === 'rejected' && <p className="text-xs font-medium text-red-800">Reason: {p.review_note}</p>}
                  {p.receipt_code && state === 'verified' && (
                    <Link href={`/receipt/${p.receipt_code}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
                      <Receipt size={15} aria-hidden /> View receipt {p.receipt_code}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}