'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'

type TenancyRow = { id: string; landlord_id: string | null; status: string | null; rent_amount: number | null; rent_period: string | null }
type Notice = {
  id: string
  current_rent: number
  new_rent: number
  effective_date: string
  reason: string | null
  status: 'sent' | 'withdrawn'
  acknowledged_at: string | null
  withdrawn_at: string | null
  created_at: string
}

function naira(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? `₦${n.toLocaleString('en-NG')}` : '₦-'
}

function niceDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
}

// The earliest start date the form offers: 30 days from today. The database checks it again.
function minStartDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const input = 'focus-ring min-h-11 w-full rounded-button border border-border bg-card px-3 text-sm'

export default function LandlordRentNoticePage() {
  const params = useParams()
  const id = String(params?.id ?? '')

  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [tenancy, setTenancy] = useState<TenancyRow | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loadError, setLoadError] = useState(false)

  const [newRent, setNewRent] = useState('')
  const [effective, setEffective] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    if (!isValidListingId(id)) {
      setAllowed(false)
      setLoading(false)
      return
    }
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) {
      setAllowed(false)
      setLoading(false)
      return
    }
    const { data: t, error: tErr } = await supabase
      .from('tenancies')
      .select('id, landlord_id, status, rent_amount, rent_period')
      .eq('id', id)
      .maybeSingle()
    if (tErr) {
      setLoadError(true)
      setLoading(false)
      return
    }
    const row = t as TenancyRow | null
    if (!row || row.landlord_id !== uid) {
      setAllowed(false)
      setLoading(false)
      return
    }
    setAllowed(true)
    setTenancy(row)
    const { data: n, error: nErr } = await supabase
      .from('rent_notices')
      .select('id, current_rent, new_rent, effective_date, reason, status, acknowledged_at, withdrawn_at, created_at')
      .eq('tenancy_id', id)
      .order('created_at', { ascending: false })
    if (nErr) setLoadError(true)
    else setNotices((n ?? []) as Notice[])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const newRentNum = newRent.trim() === '' ? NaN : Number(newRent)
  const currentRent = tenancy?.rent_amount ?? null
  const formReady =
    tenancy?.status === 'active' &&
    currentRent !== null &&
    Number.isFinite(newRentNum) &&
    newRentNum > 0 &&
    newRentNum !== currentRent &&
    effective !== ''

  const waiting = useMemo(
    () => notices.some((n) => n.status === 'sent' && n.effective_date >= new Date().toISOString().slice(0, 10)),
    [notices],
  )

  const send = async () => {
    if (!tenancy || !formReady || busy) return
    if (!window.confirm(`Send an official rent notice? Your tenant will see: rent changes from ${naira(currentRent)} to ${naira(newRentNum)} from ${niceDate(effective)}.`)) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('send_rent_notice', {
      p_tenancy: id,
      p_current: currentRent,
      p_new: newRentNum,
      p_effective: effective,
      p_reason: reason.trim() === '' ? null : reason.trim(),
    })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not send the notice. Try again.' })
      return
    }
    setMsg({ ok: true, text: 'Sent. Your tenant has been told through EboHomes.' })
    setNewRent('')
    setEffective('')
    setReason('')
    load()
  }

  const withdraw = async (noticeId: string) => {
    if (busy) return
    if (!window.confirm('Withdraw this notice? Your tenant will be told.')) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('withdraw_rent_notice', { p_notice: noticeId })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not withdraw the notice.' })
      return
    }
    setMsg({ ok: true, text: 'The notice was withdrawn.' })
    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={26} aria-label="Loading" />
      </div>
    )
  }

  if (loadError && !tenancy) {
    return <p className="mx-auto max-w-2xl p-6 text-sm text-danger">Could not load this page. Refresh and try again.</p>
  }

  if (!allowed || !tenancy) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <h1 className="text-xl font-bold text-foreground">Tenancy not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">Rent notices can only be sent by the landlord of a tenancy.</p>
        <Link href="/dashboard/tenancies" className="focus-ring mt-4 inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-foreground">My tenancies</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      <Link href={`/dashboard/tenancies/${id}`} className="focus-ring inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
        <ArrowLeft size={16} aria-hidden /> Back to the tenancy
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Rent notice</h1>
        <p className="mt-1 text-sm text-muted-foreground">An official change of rent, sent to your tenant through EboHomes.</p>
      </div>

      {tenancy.status !== 'active' ? (
        <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">A rent notice can only be sent while the tenancy is active.</p>
      ) : (
        <section className="space-y-4 rounded-card border border-border bg-card p-4" aria-label="New rent notice">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Rent now</p>
              <p className="text-lg font-bold text-foreground">{naira(currentRent)}</p>
              {tenancy.rent_period && <p className="text-xs text-muted-foreground">{tenancy.rent_period}</p>}
            </div>
            <label className="block text-xs text-muted-foreground">
              New rent (₦)
              <input
                className={`${input} mt-1 text-foreground`}
                inputMode="numeric"
                value={newRent}
                onChange={(e) => setNewRent(e.target.value.replace(/\D/g, ''))}
                placeholder="700000"
              />
            </label>
          </div>

          <label className="block text-sm font-semibold text-foreground">
            New rent starts on
            <input
              type="date"
              className={`${input} mt-1 font-normal`}
              min={minStartDate()}
              value={effective}
              onChange={(e) => setEffective(e.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">At least 30 days from today.</span>
          </label>

          <label className="block text-sm font-semibold text-foreground">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea
              className={`${input} mt-1 min-h-24 py-2 font-normal`}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: repairs to the compound"
            />
          </label>

          <div className="rounded-card border border-border bg-background p-3" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What your tenant will see</p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-chip bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
              <ShieldCheck size={13} aria-hidden /> Sent through EboHomes
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formReady
                ? `Rent change from ${naira(currentRent)} to ${naira(newRentNum)}, from ${niceDate(effective)}`
                : 'Fill in the new rent and the start date to see the notice.'}
            </p>
            {reason.trim() !== '' && <p className="mt-1 text-sm text-muted-foreground">{reason.trim()}</p>}
          </div>

          {waiting && (
            <p className="rounded-card border border-border bg-background p-3 text-sm text-muted-foreground">
              A notice is already waiting for its start date. Withdraw it below before sending a new one.
            </p>
          )}

          <button
            type="button"
            onClick={send}
            disabled={!formReady || busy || waiting}
            className="focus-ring min-h-12 w-full rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Please wait...' : 'Send official notice'}
          </button>
        </section>
      )}

      {msg && (
        <p role="status" className={`rounded-card border p-3 text-sm ${msg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
          {msg.text}
        </p>
      )}

      <section className="space-y-3" aria-label="Notices you sent">
        <h2 className="text-lg font-bold text-foreground">Notices you sent</h2>
        {notices.length === 0 && <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">No notices yet.</p>}
        {notices.map((n) => (
          <div key={n.id} className="rounded-card border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Sent {niceDate(n.created_at)}</p>
              <span className={`rounded-chip px-2.5 py-1 text-xs font-semibold ${
                n.status === 'withdrawn' ? 'bg-muted text-muted-foreground' : n.acknowledged_at ? 'bg-success-soft text-success' : 'bg-secondary text-primary'
              }`}>
                {n.status === 'withdrawn' ? 'Withdrawn' : n.acknowledged_at ? `Read ${niceDate(n.acknowledged_at)}` : 'Waiting for your tenant to read it'}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {naira(n.current_rent)} to {naira(n.new_rent)}, from {niceDate(n.effective_date)}
            </p>
            {n.reason && <p className="mt-1 text-sm text-muted-foreground">{n.reason}</p>}
            {n.status === 'sent' && !n.acknowledged_at && (
              <button
                type="button"
                onClick={() => withdraw(n.id)}
                disabled={busy}
                className="focus-ring mt-3 min-h-11 rounded-button border border-border px-4 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                Withdraw this notice
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
