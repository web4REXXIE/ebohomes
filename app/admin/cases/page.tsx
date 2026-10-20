'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtDateTime, label, naira, toIso } from '@/lib/case-status'
import { PropertySummary, usePropertyData } from '@/components/property-summary'

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

const box = 'bg-card border border-border rounded-xl p-4 text-sm space-y-3'
const inp = 'w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm'
const btn = 'min-h-11 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50'
const btn2 = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'

const GREEN = ['completed', 'resolved', 'approved', 'signed', 'applied', 'accepted']
const BLUE = ['scheduled']
const AMBER = ['open', 'requested', 'proposed', 'under_review', 'acknowledged', 'in_progress', 'agreed', 'disputed', 'offered']

function pillTone(status: string | null | undefined) {
  const s = status ?? ''
  if (GREEN.includes(s)) return 'border-emerald-300 bg-emerald-50 text-emerald-900'
  if (BLUE.includes(s)) return 'border-blue-300 bg-blue-50 text-blue-900'
  if (AMBER.includes(s)) return 'border-amber-300 bg-amber-50 text-amber-900'
  return 'border-slate-300 bg-slate-100 text-slate-800'
}

function Pill({ status, text }: { status: string | null | undefined; text: string }) {
  return (
    <span className={`h-fit shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${pillTone(status)}`}>
      {text}
    </span>
  )
}

export default function AdminCasesPage() {
  const [tab, setTab] = useState<Tab>('legacy')
  const [rows, setRows] = useState<any[]>([])
  const [codes, setCodes] = useState<Record<string, string>>({})
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

  // Property photos and details for the lists that show a property (old decisions and viewings).
  const { listings, inspected } = usePropertyData(
    useMemo(() => rows.map((r) => r.listing_id).filter(Boolean) as string[], [rows])
  )

  const call = async (fn: string, args: Record<string, any>, ok: string, confirmText?: string) => {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setMsg(error ? { text: error.message, ok: false } : { text: ok, ok: true })
    setBusy(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!error) await load()
  }

  const code = (r: any) => codes[r.tenancy_id] ?? String(r.tenancy_id ?? '').slice(0, 8)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Cases</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Viewings, agreements, repairs, disputes, deposit settlements and renewals. EboHomes records decisions here. It does not move money.
      </p>

      <div className="flex gap-1 mb-4 overflow-x-auto border-b border-border" role="tablist" aria-label="Case type">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 px-3 text-sm whitespace-nowrap border-b-2 -mb-px ${
              tab === k ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`text-sm font-medium rounded-md border p-3 mb-3 ${
            msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {msg.text}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={26} aria-label="Loading cases" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-xl">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <section key={r.id} className={box}>
              {tab === 'legacy' && (
                <>
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-foreground">Landlord decision</p>
                    <Pill status={r.status} text={r.status} />
                  </div>
                  <PropertySummary compact listing={listings[r.listing_id]} inspected={inspected.has(r.listing_id)} />
                  <p className="text-xs text-muted-foreground">
                    Decided by the landlord before EboHomes review began. Applied {fmtDate(r.created_at)}.{r.decision_note ? ` Note: ${r.decision_note}` : ''}
                  </p>
                  <input
                    aria-label="Note (optional)"
                    className={inp}
                    placeholder="Note (optional)"
                    value={f[r.id] ?? ''}
                    onChange={(e) => set(r.id, e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy} className={btn} onClick={() => call('admin_review_legacy_decision', { p_application: r.id, p_action: 'ratify', p_note: f[r.id] ?? null }, 'Decision confirmed by EboHomes.', 'Confirm this landlord decision as EboHomes-reviewed?')}>Confirm decision</button>
                    <button disabled={busy} className={btn2} onClick={() => call('admin_review_legacy_decision', { p_application: r.id, p_action: 'reopen', p_note: null }, 'Application reopened for review.', 'Send this application back to the review queue? The tenant and landlord will be told.')}>Reopen for review</button>
                  </div>
                </>
              )}

              {tab === 'viewings' && (
                <>
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-foreground">Viewing</p>
                    <Pill status={r.status} text={label(r.status)} />
                  </div>
                  <PropertySummary compact listing={listings[r.listing_id]} inspected={inspected.has(r.listing_id)} />
                  <p className="text-xs text-muted-foreground">
                    {r.scheduled_for ? `Set for ${fmtDateTime(r.scheduled_for)}` : r.preferred_at ? `Tenant prefers ${fmtDateTime(r.preferred_at)}` : 'No preferred time given'}
                    {r.tenant_note ? ` · ${r.tenant_note}` : ''}
                  </p>
                  {['requested', 'scheduled'].includes(r.status) && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-foreground">
                        Date and time
                        <input type="datetime-local" className={`${inp} mt-1`} value={f[r.id] ?? ''} onChange={(e) => set(r.id, e.target.value)} />
                      </label>
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
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-foreground">{code(r)} · version {r.version}</p>
                    <Pill status={r.status} text={label(r.status)} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/60 p-3">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Rent</dt>
                      <dd className="font-bold text-foreground">{naira(r.rent_amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Deposit</dt>
                      <dd className="font-bold text-foreground">{naira(r.deposit_amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Fees</dt>
                      <dd className="font-bold text-foreground">{naira(r.fees_amount)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Tenant {r.tenant_accepted_at ? `accepted ${fmtDate(r.tenant_accepted_at)}` : 'has not accepted yet'} · Landlord {r.landlord_accepted_at ? `accepted ${fmtDate(r.landlord_accepted_at)}` : 'has not accepted yet'}
                    {r.signed_reference ? ` · Signed ref ${r.signed_reference}` : ''}
                  </p>
                  {r.status === 'accepted' && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        aria-label="Reference of the signed agreement"
                        className={inp}
                        placeholder="Reference of the signed agreement you saw"
                        value={f[r.id] ?? ''}
                        onChange={(e) => set(r.id, e.target.value)}
                      />
                      <button disabled={busy || !(f[r.id] ?? '').trim()} className={btn} onClick={() => call('record_signed_agreement', { p_terms: r.id, p_reference: f[r.id] }, 'Signed agreement recorded.', 'Only record this after you have seen the signed document. Continue?')}>Record</button>
                    </div>
                  )}
                </>
              )}

              {tab === 'maintenance' && (
                <>
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-foreground">{r.title}</p>
                    <Pill status={r.status} text={label(r.status)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{code(r)} · <span className="capitalize">{r.priority}</span> · {fmtDate(r.created_at)}</p>
                  <p className="text-foreground">{r.description}</p>
                  {['open', 'acknowledged', 'in_progress'].includes(r.status) && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        aria-label="What was done"
                        className={inp}
                        placeholder="What was done (required)"
                        value={f[r.id] ?? ''}
                        onChange={(e) => set(r.id, e.target.value)}
                      />
                      <button disabled={busy} className={btn2} onClick={() => call('maintenance_action', { p_request: r.id, p_action: 'resolve', p_note: f[r.id] ?? '' }, 'Marked fixed.', 'Mark fixed on the landlord\'s behalf?')}>Mark fixed</button>
                    </div>
                  )}
                </>
              )}

              {tab === 'disputes' && (
                <>
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold capitalize text-foreground">{label(r.category)} · {code(r)}</p>
                    <Pill status={r.status} text={label(r.status)} />
                  </div>
                  <p className="text-foreground">{r.summary}</p>
                  {events.filter((e) => e.dispute_id === r.id && e.kind !== 'created').map((e) => (
                    <p key={e.id} className="text-xs bg-secondary rounded-md p-2">{fmtDateTime(e.created_at)}: {e.body}</p>
                  ))}
                  {r.resolution && <p className="text-xs text-foreground"><span className="font-semibold">Outcome:</span> {r.resolution}</p>}
                  {['open', 'under_review'].includes(r.status) && (
                    <div className="space-y-2">
                      <input
                        aria-label="Comment, or the outcome for both sides"
                        className={inp}
                        placeholder="Comment, or the outcome for both sides"
                        value={f[r.id] ?? ''}
                        onChange={(e) => set(r.id, e.target.value)}
                      />
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
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-foreground">{code(r)} · refund {naira(r.refund_due)}</p>
                    <Pill status={r.status} text={label(r.status)} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 rounded-lg bg-secondary/60 p-3">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Deposit held</dt>
                      <dd className="font-bold text-foreground">{naira(r.deposit_held)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Deductions</dt>
                      <dd className="font-bold text-foreground">{naira(r.deductions)}</dd>
                    </div>
                  </dl>
                  {r.deduction_reason && <p className="bg-secondary rounded-md p-2 text-xs">{r.deduction_reason}</p>}
                  {r.tenant_note && <p className="text-xs"><span className="font-semibold">Tenant:</span> {r.tenant_note}</p>}
                  {r.refund_reference && <p className="text-xs">Landlord says paid: {r.refund_reference} on {fmtDate(r.refund_paid_on)}</p>}
                  {['agreed', 'disputed'].includes(r.status) && (
                    <div className="space-y-2">
                      <input
                        aria-label="Note (required to send back)"
                        className={inp}
                        placeholder="Note (required to send back)"
                        value={f[r.id] ?? ''}
                        onChange={(e) => set(r.id, e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        {r.status === 'agreed' && <button disabled={busy} className={btn} onClick={() => call('admin_review_settlement', { p_settlement: r.id, p_action: 'approve', p_note: f[r.id] ?? null }, 'Settlement approved.', 'Approve this settlement record? No money moves through EboHomes.')}>Approve record</button>}
                        <button disabled={busy} className={btn2} onClick={() => call('admin_review_settlement', { p_settlement: r.id, p_action: 'reopen', p_note: f[r.id] ?? '' }, 'Sent back to the landlord.')}>Send back</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === 'renewals' && (
                <>
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-foreground">{code(r)} · new rent {naira(r.new_rent)}</p>
                    <Pill status={applied.has(r.id) ? 'applied' : r.status} text={applied.has(r.id) ? 'Applied' : label(r.status)} />
                  </div>
                  <p className="text-xs text-muted-foreground">Until {fmtDate(r.new_end_date)} · offered {fmtDate(r.created_at)}</p>
                  {r.status === 'accepted' && !applied.has(r.id) && (
                    <button disabled={busy} className={btn} onClick={() => call('admin_apply_renewal', { p_renewal: r.id }, 'Renewal applied to the tenancy.', 'Update the tenancy rent and end date to match this accepted renewal?')}>Apply to tenancy</button>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}