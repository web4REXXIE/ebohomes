'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, Receipt } from 'lucide-react'
import { purposeOf, PURPOSE_NAME, type PayRow } from '@/lib/payment-complete'

const naira = (n: number) => '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 2 })

// Shown only for a payment that EboHomes verified (status confirmed and verified_by set).
// Every value comes from the saved payment record. Nothing is shown that the record does not hold.
export function PaymentSuccess({ payment, property, moreCount = 0, continueLabel, onContinue }: {
  payment: PayRow
  property?: string | null
  moreCount?: number // other verified payments, listed in the history below
  continueLabel?: string
  onContinue?: () => void
}) {
  const purpose = purposeOf(payment.type)
  const what = purpose ? PURPOSE_NAME[purpose] : 'Payment'
  const when = payment.created_at ? new Date(payment.created_at).toLocaleDateString('en-NG') : null
  return (
    <section role="status" aria-labelledby="pay-success-title" className="space-y-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={28} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
        <div>
          <h4 id="pay-success-title" className="text-lg font-bold leading-snug">Congratulations. Your payment is verified</h4>
          <p>EboHomes checked this payment and verified it{property ? ` for ${property}` : ''}.</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-white/70 p-3 sm:grid-cols-3">
        <div><dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Amount</dt><dd className="text-base font-bold">{naira(Number(payment.amount) || 0)}</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Paid for</dt><dd className="font-semibold">{what}</dd></div>
        {when && <div><dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Recorded on</dt><dd className="font-semibold">{when}</dd></div>}
        {payment.reference && <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Payment reference</dt><dd className="break-all font-semibold">{payment.reference}</dd></div>}
        {payment.receipt_code && <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Receipt</dt><dd className="break-all font-semibold">{payment.receipt_code}</dd></div>}
      </dl>
      {moreCount > 0 && <p className="text-xs">You have {moreCount} other verified {moreCount === 1 ? 'payment' : 'payments'}. They are in your payment history below.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        {payment.receipt_code ? (
          <Link href={`/receipt/${payment.receipt_code}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            <Receipt size={15} aria-hidden /> View receipt
          </Link>
        ) : (
          <p className="text-xs">Your receipt number will appear here once EboHomes has issued it.</p>
        )}
        {continueLabel && onContinue && (
          <button type="button" onClick={onContinue} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-white px-5 text-sm font-semibold text-emerald-900 transition active:scale-[0.98] hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            {continueLabel} <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>
    </section>
  )
}