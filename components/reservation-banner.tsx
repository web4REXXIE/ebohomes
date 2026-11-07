'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PENDING_LABEL, reservationTimeLeft, validateReason } from '@/lib/tenancy-reservation'

type Row = { tenancy_id: string; status: string; reserved_until: string | null; cancel_requested: boolean }

const btnS =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:opacity-50'
const btnP =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50'

export function ReservationBanner({ applicationId }: { applicationId: string }) {
  const [row, setRow] = useState<Row | null>(null)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('eb_my_reservation', { p_application: applicationId })
    if (error) {
      setRow(null)
      return
    }
    const first = Array.isArray(data) ? data[0] : null
    setRow(first ? (first as Row) : null)
  }, [applicationId])

  useEffect(() => {
    void load()
  }, [load])

  if (!row) return null

  async function send() {
    if (busy || !row) return
    const v = validateReason(reason)
    if (!v.ok) {
      setErr(v.error)
      return
    }
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('eb_request_tenancy_cancel', { p_tenancy: row.tenancy_id, p_reason: v.value })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setMsg('Your request was sent to EboHomes. They will review it. Nothing has been charged.')
    setOpen(false)
    setReason('')
    await load()
  }

  return (
    <section aria-label="Property reservation" className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="flex items-center gap-1.5 text-base font-bold">
        <Clock size={16} aria-hidden /> Property reserved for you
      </p>
      <p>
        {PENDING_LABEL[row.status] ?? 'Pending tenancy'}.{' '}
        <b>{reservationTimeLeft(row.reserved_until)}</b> to finish the agreement and first payment. If time runs out, the property opens to other tenants.
      </p>
      {msg && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs font-medium text-emerald-900">{msg}</p>}
      {err && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-900">{err}</p>}
      {row.cancel_requested ? (
        <p className="text-xs">You asked to cancel. EboHomes is reviewing your request.</p>
      ) : open ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-foreground">
          <label className="block text-xs font-semibold">Why do you want to cancel?
            <textarea
              rows={2}
              maxLength={600}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void send()} className={btnP}>Send cancellation request</button>
            <button disabled={busy} onClick={() => setOpen(false)} className={btnS}>Keep my reservation</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setOpen(true); setErr(null) }} className="min-h-11 text-xs font-semibold underline">
          Ask to cancel this tenancy
        </button>
      )}
    </section>
  )
}
