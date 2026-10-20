'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, CreditCard, Landmark, Copy, Receipt } from 'lucide-react'
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
  const [copied, setCopied] = useState(false)
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

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(BANK_TRANSFER.accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const onlineReady = enabled === true
  const tab = (active: boolean) =>
    `flex-1 rounded-lg border-2 p-3 text-left text-sm transition ${active ? 'border-primary bg-primary/5' : 'border-border bg-card'}`

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-3">
      <div>
        <p className="text-sm font-bold text-foreground">Pay your rent</p>
        <p className="text-xs text-muted-foreground">
          {title ?? 'Your tenancy'}{ref ? ` · ${ref}` : ''}
        </p>
      </div>

      {lines.length > 0 ? (
        <div className="rounded-md bg-secondary p-3 text-sm">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Agreed in your signed agreement</p>
          {lines.map((l) => (
            <p key={l.key} className="flex justify-between"><span>{l.label}</span><span className="font-semibold">{nairaN(l.amount)}</span></p>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">These figures come from your signed agreement, not the advertised listing price. EboHomes does not show a balance here because it cannot calculate one reliably yet.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No payable amounts are recorded in your signed agreement.</p>
      )}

      <div className="flex gap-2" role="radiogroup" aria-label="Payment method">
        <button type="button" role="radio" aria-checked={method === 'bank'} onClick={() => setMethod('bank')} className={tab(method === 'bank')}>
          <span className="flex items-center gap-2 font-semibold"><Landmark size={15} /> Bank transfer</span>
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
          <span className="flex items-center gap-2 font-semibold"><CreditCard size={15} /> Pay online</span>
          <span className="block text-xs text-muted-foreground">{enabled === null ? 'Checking...' : onlineReady ? 'Card or bank, via Paystack' : 'Coming soon'}</span>
        </button>
      </div>

      {method === 'bank' && (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">Transfer to this account</p>
          <div className="space-y-0.5">
            <p><span className="text-muted-foreground">Bank: </span><b>{BANK_TRANSFER.bankName}</b></p>
            <p><span className="text-muted-foreground">Account name: </span><b>{BANK_TRANSFER.accountName}</b></p>
            <p className="flex flex-wrap items-center gap-2">
              <span><span className="text-muted-foreground">Account number: </span><b className="tracking-wide">{BANK_TRANSFER.accountNumber}</b></span>
              <button type="button" onClick={copyNumber} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold">
                <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </p>
            {ref && <p><span className="text-muted-foreground">Reference to write in the transfer: </span><b>{ref}</b></p>}
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Transfer the amount from your signed agreement to the account above.</li>
            <li>Write your tenancy reference in the transfer description.</li>
            <li>EboHomes matches the transfer to your tenancy, records it and checks it.</li>
            <li>When it shows &ldquo;Verified by EboHomes&rdquo; below, your receipt is ready.</li>
          </ol>
          <p className="text-xs font-semibold text-foreground">Your payment is not confirmed until it shows &ldquo;Verified by EboHomes&rdquo;. You cannot mark it as paid yourself, so there is nothing to press after you transfer. Keep your bank&rsquo;s transfer receipt.</p>
          <p className="text-xs text-muted-foreground">Only trust account details shown here after you sign in. If anyone sends you different details, do not pay. Contact EboHomes.</p>
        </div>
      )}

      {method === 'online' && (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          {enabled === null ? (
            <p className="text-xs text-muted-foreground">Checking whether online payment is available...</p>
          ) : onlineReady ? (
            <>
              <p className="text-xs text-muted-foreground">Amounts come from your signed agreement.</p>
              {(options ?? []).length === 0 && !notice && <p className="text-xs text-muted-foreground">Nothing is due online for this agreement.</p>}
              <div className="flex flex-wrap gap-2">
                {(options ?? []).map((o) => (
                  <button
                    key={o.purpose}
                    disabled={!!busy || o.paid}
                    onClick={() => pay(o.purpose)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy === o.purpose ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    {o.paid ? `${o.label} paid` : `Pay ${o.label.toLowerCase()} ${naira(o.amount_kobo)}`}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Online payment is not switched on yet, so nothing can be charged here. Please pay by bank transfer for now. This option will open here once EboHomes switches it on.</p>
          )}
          {notice && <p className={`text-xs ${notice.ok ? 'text-foreground' : 'text-destructive'}`}>{notice.text}</p>}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Payment history</p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span><b>{nairaN(Number(p.amount))}</b> <span className="capitalize text-muted-foreground">{p.type}</span></span>
                  {p.receipt_code && getPaymentState(p) === 'verified' && (
                    <Link href={`/receipt/${p.receipt_code}`} className="inline-flex items-center gap-1 text-primary"><Receipt size={14} /> {p.receipt_code}</Link>
                  )}
                </div>
                <p className="text-xs font-semibold">{paymentLabel(p)}</p>
                <p className="text-xs text-muted-foreground">{PAYMENT_STATE_NOTE[getPaymentState(p)]}</p>
                {p.review_note && getPaymentState(p) === 'rejected' && <p className="text-xs text-destructive">Reason: {p.review_note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}