'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { dueText, checkAdminReason, friendlyError } from '@/lib/remote-inspection'

type Offer = {
  id: string; ref: string; status: 'offered' | 'scheduled'; title?: string | null; location_text?: string | null
  access_time?: string | null; offer_due_at?: string | null; access_note?: string | null
}
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// Offers of tenant-requested remote inspections. The tenant is never shown here. After accepting, the job appears in the
// list below like any other assigned inspection and is submitted the same way.
export function InspectorRemoteOffers({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Offer[]>([])
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('inspector_my_remote_offers')
    setRows(Array.isArray(data) ? (data as Offer[]) : [])
  }, [])
  useEffect(() => { load() }, [load])

  const respond = async (id: string, decision: 'accept' | 'decline') => {
    setErr('')
    if (decision === 'decline') { const e = checkAdminReason(reason); if (e) return setErr('Say briefly why you cannot take this inspection.') }
    setBusy(true)
    const { error } = await supabase.rpc('inspector_respond_remote_offer', { p_request: id, p_decision: decision, p_reason: decision === 'decline' ? reason.trim() : null })
    setBusy(false)
    if (error) { setErr(friendlyError(error.message)); load(); return }
    setDeclineId(null); setReason(''); load(); onChanged?.()
  }

  const shown = rows.filter((r) => r.status === 'offered' || r.access_note)
  if (shown.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      <p className="text-sm font-semibold">Remote inspection offers</p>
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      {shown.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-1">
          <p className="font-semibold">{r.title ?? 'Property'} <span className="text-xs font-normal text-muted-foreground">{r.ref}</span></p>
          <p className="text-xs text-muted-foreground">{r.location_text}</p>
          <p className="text-xs">Be there: {fmt(r.access_time)}</p>
          {r.status === 'offered' ? (
            <>
              <p className="text-xs">Answer {dueText(r.offer_due_at)}. If you do not answer, it goes to someone else.</p>
              {declineId === r.id ? (
                <div className="space-y-2">
                  <input className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Why can you not take it?" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => respond(r.id, 'decline')}>Decline</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setDeclineId(null); setReason('') }}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => respond(r.id, 'accept')}>Accept</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setDeclineId(r.id); setReason('') }}>Decline</Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs">Access instructions from the owner: {r.access_note}</p>
          )}
        </div>
      ))}
    </div>
  )
}
