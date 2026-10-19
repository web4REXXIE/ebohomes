'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Option = { purpose: 'rent' | 'deposit' | 'fees'; label: string; amount_kobo: number; paid: boolean }
type Props = { tenancyId: string }

const naira = (kobo: number) => '\u20A6' + (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })

// Shows only when the server says online payment is switched on AND the signed agreement is on record.
// The page you come back to from Paystack proves NOTHING. On return we ask the server, which asks Paystack.
export function PayOnlinePanel({ tenancyId }: Props) {
  const [options, setOptions] = useState<Option[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const checked = useRef(false)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  const loadOptions = useCallback(async () => {
    const t = await token()
    if (!t) return
    const res = await fetch(`/api/paystack/status?tenancy_id=${encodeURIComponent(tenancyId)}`, { headers: { Authorization: `Bearer ${t}` } })
    const j = await res.json().catch(() => null)
    setOptions(j?.enabled && Array.isArray(j.options) ? j.options : [])
  }, [tenancyId])

  // Returning from Paystack: ask the server for the real result. Never show "paid" from the URL alone.
  const confirmReturn = useCallback(async (reference: string) => {
    setNotice({ ok: true, text: 'Checking your payment with Paystack. Please wait...' })
    for (let i = 0; i < 6; i++) {
      const t = await token()
      const res = await fetch(`/api/paystack/status?reference=${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${t}` } })
      const j = await res.json().catch(() => null)
      const s = j?.status as string | undefined
      if (s === 'paid') { setNotice({ ok: true, text: 'Payment confirmed by Paystack. EboHomes will verify it and issue your receipt. It will appear under Payment records on My Tenancies.' }); return }
      if (s === 'failed') { setNotice({ ok: false, text: 'The payment failed. You were not charged. You can try again, or ask your landlord to record a bank transfer.' }); return }
      if (s === 'abandoned') { setNotice({ ok: false, text: 'The payment was cancelled. You were not charged. You can try again.' }); return }
      if (s === 'mismatch') { setNotice({ ok: false, text: 'The payment did not match what was expected. Do not pay again. Contact EboHomes with this reference: ' + reference }); return }
      await new Promise((r) => setTimeout(r, 3000))
    }
    setNotice({ ok: true, text: 'We have not received confirmation from Paystack yet. If you were charged, it will appear here once confirmed. Reference: ' + reference })
  }, [])

  useEffect(() => {
    loadOptions()
    if (checked.current) return
    checked.current = true
    const ref = new URLSearchParams(window.location.search).get('reference')
    if (ref) confirmReturn(ref)
  }, [loadOptions, confirmReturn])

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

  if ((!options || options.length === 0) && !notice) return null

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">Pay online (Paystack)</p>
      <p className="mb-2 text-xs text-muted-foreground">Amounts come from your signed agreement. Bank transfer recorded by your landlord still works.</p>
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
      {notice && <p className={`mt-2 text-xs ${notice.ok ? 'text-foreground' : 'text-destructive'}`}>{notice.text}</p>}
    </div>
  )
}