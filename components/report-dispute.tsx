'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/remote-inspection'

type Dispute = { request_id: string; status: 'open' | 'resolved'; created_at: string; resolved_at?: string | null; tenant_message?: string | null }

const btnS = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'
const inp = 'w-full bg-input border border-border rounded-md px-3 py-2.5 text-base'

// "Something is wrong with this report". The tenant writes what is wrong; an administrator who was not part of the visit decides.
// The tenant sees the outcome and the message written for them, never the internal notes.
export function ReportDispute({ requestId }: { requestId: string }) {
  const [list, setList] = useState<Dispute[]>([])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_remote_inspection_disputes')
    setList(((data ?? []) as Dispute[]).filter((d) => d.request_id === requestId))
  }, [requestId])
  useEffect(() => { void load() }, [load])

  async function send() {
    if (text.trim().length < 10) { setErr('Tell us what is wrong, at least 10 characters.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('tenant_dispute_remote_report', { p_request: requestId, p_reason: text.trim() })
    setBusy(false)
    if (error) { setErr(friendlyError(error.message)); return }
    setText(''); setOpen(false); await load()
  }

  const hasOpen = list.some((d) => d.status === 'open')
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-2">
      <p className="font-semibold">Something wrong with this report?</p>
      {list.map((d) => (
        <p key={d.created_at} className="text-xs text-muted-foreground">
          {d.status === 'open' ? 'EboHomes is looking at your concern.' : `Reviewed. ${d.tenant_message ?? 'EboHomes closed your concern.'}`}
        </p>
      ))}
      {!hasOpen && !open && <button type="button" className={btnS} onClick={() => setOpen(true)}>Tell EboHomes</button>}
      {open && (
        <div className="space-y-2">
          <textarea className={inp} rows={4} maxLength={1000} placeholder="What does not match what you saw or were told?" value={text} onChange={(e) => setText(e.target.value)} />
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <button type="button" className={btnS} disabled={busy} onClick={send}>Send</button>
            <button type="button" className={btnS} onClick={() => { setOpen(false); setErr('') }}>Cancel</button>
          </div>
          <p className="text-xs text-muted-foreground">An EboHomes administrator who was not part of this inspection will look at it. You have 14 days from the day the report was released.</p>
        </div>
      )}
    </div>
  )
}
