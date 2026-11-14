'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'

type Notice = {
  id: string
  current_rent: number
  new_rent: number
  effective_date: string
  reason: string | null
  status: 'sent' | 'withdrawn'
  acknowledged_at: string | null
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

export default function TenantRentNoticesPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [loading, setLoading] = useState(true)
  const [notices, setNotices] = useState<Notice[]>([])
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    if (!isValidListingId(id)) {
      setLoading(false)
      return
    }
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      router.push('/login')
      return
    }
    // Row-level security means only the people on this tenancy can read its notices.
    const { data, error } = await supabase
      .from('rent_notices')
      .select('id, current_rent, new_rent, effective_date, reason, status, acknowledged_at, created_at')
      .eq('tenancy_id', id)
      .order('created_at', { ascending: false })
    if (error) setLoadError(true)
    else setNotices((data ?? []) as Notice[])
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    load()
  }, [load])

  const acknowledge = async (noticeId: string) => {
    if (busyId) return
    setBusyId(noticeId)
    setMsg(null)
    const { error } = await supabase.rpc('acknowledge_rent_notice', { p_notice: noticeId })
    setBusyId(null)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not save this. Try again.' })
      return
    }
    setMsg({ ok: true, text: 'Thank you. Your landlord has been told you read the notice.' })
    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={26} aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      <Link href={`/tenancies/${id}`} className="focus-ring inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
        <ArrowLeft size={16} aria-hidden /> Back to my tenancy
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Official rent notices</h1>
        <p className="mt-1 text-sm text-muted-foreground">A rent change that is not shown here is not official.</p>
      </div>

      {loadError && <p className="text-sm text-danger">Could not load your notices. Refresh the page.</p>}

      {msg && (
        <p role="status" className={`rounded-card border p-3 text-sm ${msg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
          {msg.text}
        </p>
      )}

      {!loadError && notices.length === 0 && (
        <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">No rent notices. Your rent has not been changed through EboHomes.</p>
      )}

      {notices.map((n) => (
        <div key={n.id} className="rounded-card border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-chip bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
              <ShieldCheck size={13} aria-hidden /> Sent through EboHomes
            </span>
            <p className="text-xs text-muted-foreground">{niceDate(n.created_at)}</p>
          </div>

          <p className="mt-3 text-base font-bold text-foreground">
            Rent change from {naira(n.current_rent)} to {naira(n.new_rent)}, from {niceDate(n.effective_date)}
          </p>
          {n.reason && <p className="mt-1 text-sm text-muted-foreground">{n.reason}</p>}

          {n.status === 'withdrawn' ? (
            <p className="mt-3 rounded-card border border-border bg-background p-3 text-sm text-muted-foreground">Your landlord withdrew this notice. Nothing changes.</p>
          ) : n.acknowledged_at ? (
            <p className="mt-3 text-sm font-semibold text-success">You read this notice on {niceDate(n.acknowledged_at)}.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => acknowledge(n.id)}
                disabled={busyId !== null}
                className="focus-ring min-h-11 rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busyId === n.id ? 'Please wait...' : 'I have read this'}
              </button>
              <Link
                href={`/messages?new=1&category=tenancy&tenancy=${id}&subject=${encodeURIComponent('Question about my rent notice')}`}
                className="focus-ring inline-flex min-h-11 items-center rounded-button border border-border px-4 text-sm font-semibold text-foreground"
              >
                Ask a question
              </Link>
            </div>
          )}
          {n.status === 'sent' && !n.acknowledged_at && (
            <p className="mt-2 text-xs text-muted-foreground">Tapping &quot;I have read this&quot; does not mean you agree to the new rent.</p>
          )}
        </div>
      ))}
    </div>
  )
}
