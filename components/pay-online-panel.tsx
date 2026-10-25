'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, CreditCard, Landmark, Copy, Check, Receipt, ShieldCheck, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { paymentLabel, PAYMENT_STATE_NOTE, getPaymentState } from '@/lib/payment-status'
import { BANK_TRANSFER, amountLines, transferReference, type SignedTermsLike } from '@/lib/payment-instructions'
import { CHARGE_LABEL, canPay, rentRepeatNote, summarisePayments, type Purpose } from '@/lib/payment-complete'
import { SUBMISSION_LABEL, type SubmissionStatus } from '@/lib/payment-submission'
import { PaymentSuccess } from '@/components/payment-success'

type Option = { purpose: Purpose; label: string; amount_kobo: number; paid: boolean }
type Props = {
  tenancyId: string
  terms?: SignedTermsLike | null // the SIGNED rental terms: the only source of agreed amounts
  title?: string | null
  reference?: string | null // tenancy reference, e.g. EBO-TEN-000006
  period?: string | null
  onChanged?: () => void // called after a payment check finds something new, so the page around the panel can refresh
  continueLabel?: string // optional "next step" button on the payment-verified card
  onContinue?: () => void
}
type Method = 'bank' | 'online'
type Proof = { id: string; payment_type: string; amount_paid: number; status: SubmissionStatus; created_at: string }

const naira = (kobo: number) => '₦' + (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const nairaN = (n: number) => '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 2 })

const PAY_TONE: Record<string, string> = {
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  legacy_confirmed: 'border-amber-300 bg-amber-50 text-amber-900',
  awaiting_verification: 'border-amber-300 bg-amber-50 text-amber-900',
  pending: 'border-slate-300 bg-slate-100 text-slate-800',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  other: 'border-slate-300 bg-slate-100 text-slate-800',
}
const CHARGE_TONE = {
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  awaiting: 'border-amber-300 bg-amber-50 text-amber-900',
  partial: 'border-amber-300 bg-amber-50 text-amber-900',
} as const

const OPEN_PROOF = ['submitted', 'under_review']
const FIX_PROOF = ['needs_info', 'rejected']
const PAYMENT_COLUMNS = 'id, tenancy_id, amount, type, status, receipt_code, created_at, verified_by, review_note'

// Removes the Paystack return parameters from the address once the result is known, so a refresh starts clean.
function clearReturnParams() {
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has('reference') && !u.searchParams.has('trxref')) return
    u.searchParams.delete('reference')
    u.searchParams.delete('trxref')
    window.history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash)
  } catch { /* ignore */ }
}

// The tenant's payment section. Two ways to pay are shown:
//  - Bank transfer: works now. The tenant NEVER marks a payment as paid or verified. EboHomes records and verifies.
//  - Pay online (Paystack): shown, but only usable when the server says it is switched on.
// The page you come back to from Paystack proves NOTHING. On return we ask the server, which asks Paystack.
// What is "done" always comes from the saved payment records. A finished charge cannot be paid again from here.
export function PayOnlinePanel({ tenancyId, terms, title, reference, period, onChanged, continueLabel, onContinue }: Props) {
  const [options, setOptions] = useState<Option[] | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null) // null = still checking
  const [method, setMethod] = useState<Method>('bank')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [proofs, setProofs] = useState<Proof[]>([])
  const [paymentsLoaded, setPaymentsLoaded] = useState(false)
  const [proofsLoaded, setProofsLoaded] = useState(false)
  const [copied, setCopied] = useState<'number' | 'ref' | null>(null)
  const checked = useRef(false)

  const lines = amountLines(terms, period)
  const ref = transferReference(reference)

  const summary = useMemo(
    () => summarisePayments(payments, {
      agreed: { rent: terms?.rent_amount, deposit: terms?.deposit_amount, fees: terms?.fees_amount },
      proofs,
    }),
    [payments, proofs, terms?.rent_amount, terms?.deposit_amount, terms?.fees_amount],
  )

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  const loadPayments = useCallback(async () => {
    // "reference" is read when it exists. If that column cannot be read, the list still loads without it.
    let res: { data: any[] | null; error: any } = await supabase.from('payments').select(PAYMENT_COLUMNS + ', reference').eq('tenancy_id', tenancyId).order('created_at', { ascending: false })
    if (res.error) res = await supabase.from('payments').select(PAYMENT_COLUMNS).eq('tenancy_id', tenancyId).order('created_at', { ascending: false })
    setPayments(res.data ?? [])
    setPaymentsLoaded(true)
  }, [tenancyId])

  const loadProofs = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_submissions')
      .select('id, payment_type, amount_paid, status, created_at')
      .eq('tenancy_id', tenancyId)
      .order('created_at', { ascending: false })
    setProofs(error ? [] : ((data ?? []) as Proof[]))
    setProofsLoaded(true)
  }, [tenancyId])

  const loadOptions = useCallback(async () => {
    const t = await token()
    if (!t) { setEnabled(false); setOptions([]); return }
    const res = await fetch(`/api/paystack/status?tenancy_id=${encodeURIComponent(tenancyId)}`, { headers: { Authorization: `Bearer ${t}` } })
    const j = await res.json().catch(() => null)
    setEnabled(!!j?.enabled)
    setOptions(j?.enabled && Array.isArray(j.options) ? j.options : [])
  }, [tenancyId])

  const confirmReturn = useCallback(async (returnRef: string) => {
    setMethod('online')
    setNotice({ ok: true, text: 'Checking your payment with Paystack. Please wait...' })
    for (let i = 0; i < 6; i++) {
      const t = await token()
      const res = await fetch(`/api/paystack/status?reference=${encodeURIComponent(returnRef)}`, { headers: { Authorization: `Bearer ${t}` } })
      const j = await res.json().catch(() => null)
      const s = j?.status as string | undefined
      if (s === 'paid') {
        setNotice({ ok: true, text: 'Paystack confirmed your payment. EboHomes will now record and check it. It is not shown as verified until EboHomes has checked it. Do not pay again. Keep this reference: ' + returnRef })
        clearReturnParams()
        await Promise.all([loadOptions(), loadPayments(), loadProofs()])
        onChanged?.()
        return
      }
      if (s === 'failed') { setNotice({ ok: false, text: 'The payment failed. You were not charged. You can try again or pay by bank transfer.' }); clearReturnParams(); return }
      if (s === 'abandoned') { setNotice({ ok: false, text: 'The payment was cancelled. You were not charged. You can try again.' }); clearReturnParams(); return }
      if (s === 'mismatch') { setNotice({ ok: false, text: 'The payment did not match what was expected. Do not pay again. Contact EboHomes with this reference: ' + returnRef }); clearReturnParams(); return }
      await new Promise((r) => setTimeout(r, 3000))
    }
    setNotice({ ok: true, text: 'We have not received confirmation from Paystack yet. If you were charged, it will show once confirmed. Do not pay again yet. Reference: ' + returnRef })
  }, [loadOptions, loadPayments, loadProofs, onChanged])

  useEffect(() => {
    loadOptions()
    loadPayments()
    loadProofs()
    if (checked.current) return
    checked.current = true
    const r = new URLSearchParams(window.location.search).get('reference')
    if (r) confirmReturn(r)
  }, [loadOptions, loadPayments, loadProofs, confirmReturn])

  const pay = async (purpose: Purpose) => {
    if (busy) return
    const repeat = purpose === 'rent' ? rentRepeatNote(summary) : null
    if (repeat && !window.confirm(repeat + ' Continue to pay?')) return
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
  const loaded = paymentsLoaded && proofsLoaded
  const openProofs = proofs.filter((p) => OPEN_PROOF.includes(p.status))
  const fixProofs = proofs.filter((p) => FIX_PROOF.includes(p.status))
  const hasOpenProof = openProofs.length > 0
  // Once every one-off charge is done, the pay buttons tuck away. Rent repeats, so it stays reachable.
  const tucked = loaded && summary.openOneOff.length === 0 && (!!summary.latestVerified || summary.anyAwaiting)
  const tab = (active: boolean) =>
    `flex-1 rounded-xl border-2 p-3 text-left text-sm transition min-h-14 ${active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary/60'}`

  const payBlock = (
    <>
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
            <li>Tap &ldquo;I have made the payment&rdquo; and upload your receipt.</li>
            <li>EboHomes checks the bank account and verifies the payment.</li>
            <li>When it shows &ldquo;Verified by EboHomes&rdquo; below, your receipt is ready.</li>
          </ol>

          {hasOpenProof ? (
            <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              You already sent proof of payment and EboHomes has not decided on it yet. You do not need to send it again.
            </p>
          ) : (
            <Link
              href={`/tenancies/${tenancyId}/pay`}
              className="flex min-h-14 w-full items-center justify-center rounded-xl bg-primary px-4 text-center text-base font-bold tracking-wide text-primary-foreground"
            >
              {tucked ? 'SEND PROOF OF A NEW PAYMENT' : 'I HAVE MADE THE PAYMENT'}
            </Link>
          )}
          <p className="rounded-md bg-secondary p-2 text-xs font-semibold text-foreground">
            After you transfer, tap the button above and upload your bank receipt. This does not confirm your payment. It is not confirmed until it shows &ldquo;Verified by EboHomes&rdquo;, which only an EboHomes administrator can do after seeing the money in the bank.
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
                {(options ?? []).map((o) => {
                  const st = summary.charges[o.purpose].state
                  const closed = o.paid || !canPay(o.purpose, summary)
                  const label = closed
                    ? `${o.label} ${st === 'verified' || o.paid ? 'paid' : 'recorded, awaiting verification'}`
                    : `Pay ${o.label.toLowerCase()} ${naira(o.amount_kobo)}`
                  return (
                    <button
                      key={o.purpose}
                      disabled={!!busy || closed}
                      onClick={() => pay(o.purpose)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {busy === o.purpose ? <Loader2 size={14} className="animate-spin" aria-hidden /> : closed ? <Check size={14} aria-hidden /> : <CreditCard size={14} aria-hidden />}
                      {label}
                    </button>
                  )
                })}
              </div>
              {rentRepeatNote(summary) && (options ?? []).some((o) => o.purpose === 'rent') && (
                <p className="text-xs text-muted-foreground">{rentRepeatNote(summary)}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Online payment is not switched on yet, so nothing can be charged here. Please pay by bank transfer for now. This option will open here once EboHomes switches it on.</p>
          )}
        </div>
      )}
    </>
  )

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-bold text-foreground">Pay for your tenancy</h3>
        <p className="text-xs text-muted-foreground">
          {title ?? 'Your tenancy'}{ref ? ` · ${ref}` : ''}
        </p>
      </div>

      {/* Payment complete. Only for a payment EboHomes verified. Comes from the saved record, so it survives a refresh. */}
      {summary.latestVerified && (
        <PaymentSuccess
          payment={summary.latestVerified}
          property={title}
          moreCount={summary.verified.length - 1}
          continueLabel={continueLabel}
          onContinue={onContinue}
        />
      )}

      {/* Result of coming back from Paystack (asked of the server, never trusted from the redirect) */}
      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${notice.ok ? 'border-border bg-secondary text-foreground' : 'border-red-300 bg-red-50 text-red-900'}`}>
          {notice.text}
        </p>
      )}

      {/* What is due, with where each item stands */}
      {lines.length > 0 ? (
        <div className="rounded-lg bg-secondary p-3 text-sm">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ShieldCheck size={14} aria-hidden /> Amounts in your signed agreement
          </p>
          <ul className="divide-y divide-border">
            {lines.map((l) => {
              const st = summary.charges[l.key].state
              return (
                <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-foreground">{l.label}</span>
                  <span className="flex items-center gap-2">
                    {st !== 'none' && (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHARGE_TONE[st]}`}>{CHARGE_LABEL[st]}</span>
                    )}
                    <span className="text-base font-bold text-foreground">{nairaN(l.amount)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            These figures come from your signed agreement, not the advertised listing price. EboHomes does not show a balance here because it cannot calculate one reliably yet.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">No payable amounts are recorded in your signed agreement.</p>
      )}

      {/* Where the tenant stands, from real records only */}
      {summary.anyAwaiting && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>A payment is recorded, or your proof of payment is with EboHomes, and it has not been verified yet. You do not need to pay it again. Check the history below.</span>
        </p>
      )}
      {fixProofs.length > 0 && (
        <div role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">EboHomes could not accept your proof of payment</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {fixProofs.map((p) => <li key={p.id}>{nairaN(Number(p.amount_paid))} {p.payment_type}: {SUBMISSION_LABEL[p.status]}</li>)}
          </ul>
          <Link href={`/tenancies/${tenancyId}/pay`} className="inline-flex min-h-11 items-center font-semibold underline">Correct my payment proof</Link>
        </div>
      )}

      {!loaded ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Checking your payments...</p>
      ) : tucked ? (
        <details className="rounded-lg border border-border p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-foreground">Make another payment</summary>
          <div className="mt-3 space-y-4">
            {rentRepeatNote(summary) && <p className="rounded-md bg-secondary p-2 text-xs text-foreground">{rentRepeatNote(summary)}</p>}
            {payBlock}
          </div>
        </details>
      ) : payBlock}

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