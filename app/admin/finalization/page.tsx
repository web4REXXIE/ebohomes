'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/case-status'
import { useConfirm } from '@/components/confirm-dialog'

type Failure = { id: string; tenancy_id: string; error_message: string; attempts: number; last_error_at: string }
type Ten = { id: string; listing_id: string; status: string }

export default function AdminFinalizationPage() {
  const [rows, setRows] = useState<Failure[]>([])
  const [tens, setTens] = useState<Record<string, Ten>>({})
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('rental_finalization_failures')
      .select('id, tenancy_id, error_message, attempts, last_error_at')
      .is('resolved_at', null)
      .order('last_error_at', { ascending: false })
    if (e) {
      setError('Run the 20261207_02 migration first. ' + e.message)
      setLoading(false)
      return
    }
    const list = (data ?? []) as Failure[]
    setRows(list)
    if (list.length) {
      const { data: ts } = await supabase.from('tenancies').select('id, listing_id, status').in('id', list.map((r) => r.tenancy_id))
      const map = Object.fromEntries(((ts ?? []) as Ten[]).map((t) => [t.id, t]))
      setTens(map)
      const listingIds = Array.from(new Set(Object.values(map).map((t) => t.listing_id)))
      if (listingIds.length) {
        const { data: ls } = await supabase.from('listings').select('id, title').in('id', listingIds)
        setTitles(Object.fromEntries((ls ?? []).map((l: any) => [l.id, l.title || 'Property'])))
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function retry(r: Failure) {
    if (busy) return
    if (!(await confirm({ title: 'Retry finalization?', message: 'Retry marking this property as rented?', confirmLabel: 'Retry' }))) return
    setBusy(r.id)
    setError(null)
    setNotice(null)
    const { data, error: e } = await supabase.rpc('eb_admin_retry_finalization', { p_tenancy: r.tenancy_id })
    setBusy(null)
    if (e) {
      setError(e.message)
    } else if (data === false) {
      setError('Not ready yet. The tenancy needs a signed agreement and a verified rent payment.')
    } else {
      setNotice('Done. The property is rented and competing applications were resolved.')
    }
    await load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      {dialog}
      <h1 className="mb-1 text-2xl font-bold text-foreground">Rental finalization</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        A payment was verified but the property could not be marked rented. The payment is safe. Fix the cause shown, then retry.
      </p>
      {error && <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{notice}</p>}

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nothing needs attention.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const t = tens[r.tenancy_id]
            return (
              <section key={r.id} className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
                <p className="font-semibold text-foreground">{t ? titles[t.listing_id] ?? 'Property' : 'Tenancy'}</p>
                <p className="text-xs text-muted-foreground">
                  Tenancy status: {t?.status ?? 'unknown'} · failed {r.attempts} time{r.attempts === 1 ? '' : 's'} · last {fmtDateTime(r.last_error_at)}
                </p>
                <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900 break-words">{r.error_message}</p>
                <button
                  disabled={busy !== null}
                  onClick={() => void retry(r)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy === r.id && <Loader2 size={14} className="animate-spin" aria-hidden />} Retry
                </button>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
