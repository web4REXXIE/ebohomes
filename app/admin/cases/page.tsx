'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtDateTime, label, naira, toIso } from '@/lib/case-status'

const TABS = [
  ['legacy', 'Old decisions'],
  ['viewings', 'Viewings'],
  ['terms', 'Agreements'],
  ['maintenance', 'Maintenance'],
  ['disputes', 'Disputes'],
  ['settlements', 'Settlements'],
  ['renewals', 'Renewals'],
] as const
type Tab = (typeof TABS)[number][0]

const box = 'bg-card border border-border rounded-lg p-4 text-sm space-y-2'
const inp = 'w-full bg-input border border-border rounded-md px-3 py-2 text-xs'
const btn = 'px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50'
const btn2 = 'px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-50'

export default function AdminCasesPage() {
  const [tab, setTab] = useState<Tab>('legacy')
  const [rows, setRows] = useState<any[]>([])
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [f, setF] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<any[]>([])
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    let q: any
    if (tab === 'legacy') q = supabase.from('applications').select('id, listing_id, status, decision_note, created_at, updated_at').in('status', ['approved', 'rejected']).is('decided_by', null).order('created_at')
    else if (tab === 'viewings') q = supabase.from('viewings').select('*').order('created_at', { ascending: false }).limit(200)
    else if (tab === 'terms') q = supabase.from('rental_terms').select('*').in('status', ['proposed', 'accepted', 'signed']).order('updated_at', { ascending: false }).limit(200)
    else if (tab === 'maintenance') q = supabase.from('maintenance_requests').select('*').order('created_at', { ascending: false }).limit(200)
    else if (tab === 'disputes') q = supabase.from('tenancy_disputes').select('*').order('created_at', { ascending: false }).limit(200)
    else if (tab === 'settlements') q = supabase.from('tenancy_settlements').select('*').order('updated_at', { ascending: false }).limit(200)
    else q = supabase.from('renewals').select('*').order('created_at', { ascending: false }).limit(200)
    const { data, error } = await q
    if (error) {
      setMsg({ text: `Could not load this list: ${error.message}`, ok: false })
      setRows([])
      setLoading(false)
      return
    }
    const list = data ?? []
    setRows(list)

    const tIds = Array.from(new Set(list.map((r: any) => r.tenancy_id).filter(Boolean)))
    if (tIds.length) {
      const { data: t } = await supabase.from('tenancies').select('id, tenancy_code').in('id', tIds)
      setCodes(Object.fromEntries((t ?? []).map((x: any) => [x.id, x.tenancy_code])))
    }
    const lIds = Array.from(new Set(list.map((r: any) => r.listing_id).filter(Boolean)))
    if (lIds.length) {
      const { data: l } = await supabase.from('listings').select('id, title').in('id', lIds)
      setTitles(Object.fromEntries((l ?? []).map((x: any) => [x.id, x.title])))
    }
    if (tab === 'disputes' && list.length) {
      const { data: e } = await supabase.from('tenancy_dispute_events').select('*').order('created_at')
      setEvents(e ?? [])
    }
    if (tab === 'renewals' && list.length) {
      const { data: a } = await supabase.from('renewal_applied').select('renewal_id')
      setApplied(new Set((a ?? []).map((x: any) => x.renewal_id)))
    }
    setLoading(false)
  }, [tab])

  useEffect(() => {
    setMsg(null)
    load()
  }, [load])

  const call = async (fn: string, args: Record<string, any>, ok: string, confirmText?: string) => {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setMsg(error ? { text: error.message, ok: false } : { text: ok, ok: true })
    setBusy(false)
    if (!error) await load()
  }

  const code = (r: any) => codes[r.tenancy_id] ?? String(r.tenancy_id ?? '').slice(0, 8)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Cases</h1>
      <p className="text-sm text-muted-foreground mb-4">Viewings, agreements, repairs, disputes, deposit settlements and renewals. EboHomes records decisions here. It does not move money.</p>
      <div className="flex gap-2 mb-4 overflow-x-auto border-b border-border">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {msg && <p className={`text-sm rounded-md p-3 mb-3 ${msg.ok ? 'text-primary bg-primary/10' : 'text-destructive bg-destructive/10'}`}>{msg.text}</p>}
      {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className={box}>
              {tab === 'legacy' && (
                <>
                  <p className="font-semibold">{titles[r.listing_id] ?? 'Listing'} · <span className="capitalize">{r.status}</span></p>
                  <p className="text-xs text-muted-foreground">Decided by the landlord before EboHomes review began. Applied {fmtDate(r.created_at)}.{r.decision_note ? ` Note: ${r.decision_note}` : ''}</p>
                  <input className={inp} placeholder="Note (optional)" value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={busy} className={btn} onClick={() => call('admin_review_legacy_decision', { p_application: r.id, p_action: 'ratify', p_note: f[r.id] ?? null }, 'Decision confirmed by EboHomes.', 'Confirm this landlord decision as EboHomes-reviewed?')}>Confirm decision</button>
                    <button disabled={busy} className={btn2} onClick={() => call('admin_review_legacy_decision', { p_application: r.id, p_action: 'reopen', p_note: null }, 'Application reopened for review.', 'Send this application back to the review queue? The tenant and landlord will be told.')}>Reopen for review</button>
                  </div>
                </>
              )}
              {tab === 'viewings' && (
                <>
                  <div className="flex justify-between gap-2"><p className="font-semibold">{titles[r.listing_id] ?? 'Listing'}</p><span className="text-xs border border-border rounded-full px-2 py-1 capitalize h-fit">{label(r.status)}</span></div>
                  <p className="text-xs text-muted-foreground">{r.scheduled_for ? `Set for ${fmtDateTime(r.scheduled_for)}` : r.preferred_at ? `Tenant prefers ${fmtDateTime(r.preferred_at)}` : 'No time chosen'}{r.tenant_note ? ` · ${r.tenant_note}` : ''}</p>
                  {['requested', 'scheduled'].includes(r.status) && (
                    <div className="space-y-2">
                      <input type="datetime-local" className={inp} value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busy || !toIso(f[r.id] ?? '')} className={btn} onClick={() => call('schedule_viewing', { p_viewing: r.id, p_when: toIso(f[r.id] ?? ''), p_note: null }, 'Viewing scheduled.')}>{r.status === 'scheduled' ? 'Move' : 'Schedule'}</button>
                        {r.status === 'scheduled' && <button disabled={busy} className={btn2} onClick={() => call('complete_viewing', { p_viewing: r.id, p_outcome: 'completed', p_note: null }, 'Marked done.')}>Mark done</button>}
                        {r.status === 'scheduled' && <button disabled={busy} className={btn2} onClick={() => call('complete_viewing', { p_viewing: r.id, p_outcome: 'no_show', p_note: null }, 'Marked missed.')}>Missed</button>}
                        <button disabled={busy} className={btn2} onClick={() => call('cancel_viewing', { p_viewing: r.id, p_note: null }, 'Cancelled.', 'Cancel this viewing?')}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {tab === 'terms' && (
                <>
                  <div className="flex justify-between gap-2"><p className="font-semibold">{code(r)} · version {r.version}</p><span className="text-xs border border-border rounded-full px-2 py-1 capitalize h-fit">{label(r.status)}</span></div>
                  <p>Rent {naira(r.rent_amount)} · Deposit {naira(r.deposit_amount)} · Fees {naira(r.fees_amount)}</p>
                  <p className="text-xs text-muted-foreground">Tenant {r.tenant_accepted_at ? `accepted ${fmtDate(r.tenant_accepted_at)}` : 'not yet'} · Landlord {r.landlord_accepted_at ? `accepted ${fmtDate(r.landlord_accepted_at)}` : 'not yet'}{r.signed_reference ? ` · Signed ref ${r.signed_reference}` : ''}</p>
                  {r.status === 'accepted' && (
                    <div className="flex gap-2">
                      <input className={inp} placeholder="Reference of the signed agreement you saw" value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                      <button disabled={busy || !(f[r.id] ?? '').trim()} className={btn} onClick={() => call('record_signed_agreement', { p_terms: r.id, p_reference: f[r.id] }, 'Signed agreement recorded.', 'Only record this after you have seen the signed document. Continue?')}>Record</button>
                    </div>
                  )}
                </>
              )}
              {tab === 'maintenance' && (
                <>
                  <div className="flex justify-between gap-2"><p className="font-semibold">{r.title}</p><span className="text-xs border border-border rounded-full px-2 py-1 capitalize h-fit">{label(r.status)}</span></div>
                  <p className="text-xs text-muted-foreground">{code(r)} · <span className="capitalize">{r.priority}</span> · {fmtDate(r.created_at)}</p>
                  <p>{r.description}</p>
                  {['open', 'acknowledged', 'in_progress'].includes(r.status) && (
                    <div className="flex gap-2">
                      <input className={inp} placeholder="What was done (required)" value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                      <button disabled={busy} className={btn2} onClick={() => call('maintenance_action', { p_request: r.id, p_action: 'resolve', p_note: f[r.id] ?? '' }, 'Marked fixed.', 'Mark fixed on the landlord\'s behalf?')}>Mark fixed</button>
                    </div>
                  )}
                </>
              )}
              {tab === 'disputes' && (
                <>
                  <div className="flex justify-between gap-2"><p className="font-semibold capitalize">{label(r.category)} · {code(r)}</p><span className="text-xs border border-border rounded-full px-2 py-1 capitalize h-fit">{label(r.status)}</span></div>
                  <p>{r.summary}</p>
                  {events.filter((e) => e.dispute_id === r.id && e.kind !== 'created').map((e) => <p key={e.id} className="text-xs bg-secondary rounded-md p-2">{fmtDateTime(e.created_at)}: {e.body}</p>)}
                  {r.resolution && <p className="text-xs">Outcome: {r.resolution}</p>}
                  {['open', 'under_review'].includes(r.status) && (
                    <div className="space-y-2">
                      <input className={inp} placeholder="Comment, or the outcome for both sides" value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busy || (f[r.id] ?? '').trim().length < 2} className={btn2} onClick={() => call('add_dispute_comment', { p_dispute: r.id, p_body: f[r.id] }, 'Comment added.')}>Comment</button>
                        {r.status === 'open' && <button disabled={busy} className={btn2} onClick={() => call('admin_update_dispute', { p_dispute: r.id, p_status: 'under_review', p_note: null }, 'Moved to review.')}>Start review</button>}
                        <button disabled={busy} className={btn} onClick={() => call('admin_update_dispute', { p_dispute: r.id, p_status: 'resolved', p_note: f[r.id] ?? '' }, 'Dispute resolved.', 'Resolve this dispute? Both sides will see the outcome.')}>Resolve</button>
                        <button disabled={busy} className={btn2} onClick={() => call('admin_update_dispute', { p_dispute: r.id, p_status: 'closed', p_note: f[r.id] ?? '' }, 'Dispute closed.', 'Close this dispute without a ruling?')}>Close</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {tab === 'settlements' && (
                <>
                  <div className="flex justify-between gap-2"><p className="font-semibold">{code(r)} · refund {naira(r.refund_due)}</p><span className="text-xs border border-border rounded-full px-2 py-1 capitalize h-fit">{label(r.status)}</span></div>
                  <p>Deposit {naira(r.deposit_held)} · Deductions {naira(r.deductions)}</p>
                  {r.deduction_reason && <p className="bg-secondary rounded-md p-2 text-xs">{r.deduction_reason}</p>}
                  {r.tenant_note && <p className="text-xs">Tenant: {r.tenant_note}</p>}
                  {r.refund_reference && <p className="text-xs">Landlord says paid: {r.refund_reference} on {fmtDate(r.refund_paid_on)}</p>}
                  {['agreed', 'disputed'].includes(r.status) && (
                    <div className="space-y-2">
                      <input className={inp} placeholder="Note (required to send back)" value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                      <div className="flex gap-2">
                        {r.status === 'agreed' && <button disabled={busy} className={btn} onClick={() => call('admin_review_settlement', { p_settlement: r.id, p_action: 'approve', p_note: f[r.id] ?? null }, 'Settlement approved.', 'Approve this settlement record? No money moves through EboHomes.')}>Approve record</button>}
                        <button disabled={busy} className={btn2} onClick={() => call('admin_review_settlement', { p_settlement: r.id, p_action: 'reopen', p_note: f[r.id] ?? '' }, 'Sent back to the landlord.')}>Send back</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {tab === 'renewals' && (
                <>
                  <div className="flex justify-between gap-2"><p className="font-semibold">{code(r)} · new rent {naira(r.new_rent)}</p><span className="text-xs border border-border rounded-full px-2 py-1 capitalize h-fit">{applied.has(r.id) ? 'applied' : label(r.status)}</span></div>
                  <p className="text-xs text-muted-foreground">Until {fmtDate(r.new_end_date)} · offered {fmtDate(r.created_at)}</p>
                  {r.status === 'accepted' && !applied.has(r.id) && (
                    <button disabled={busy} className={btn} onClick={() => call('admin_apply_renewal', { p_renewal: r.id }, 'Renewal applied to the tenancy.', 'Update the tenancy rent and end date to match this accepted renewal?')}>Apply to tenancy</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}