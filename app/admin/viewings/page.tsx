'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime, toIso } from '@/lib/case-status'
import { TONE_CLASS, staffNext, viewingTone } from '@/lib/viewing-status'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { History, StatusBadge } from '@/components/viewings-manager'

const TABS: [string, string, (v: any) => boolean][] = [
  ['respond', 'Needs response', (v) => v.status === 'requested'],
  ['schedule', 'Scheduling needed', (v) => v.status === 'approved'],
  ['upcoming', 'Scheduled & proposed', (v) => ['scheduled', 'reschedule_proposed'].includes(v.status)],
  ['done', 'Completed', (v) => v.status === 'completed'],
  ['closed', 'Closed', (v) => ['no_show', 'cancelled', 'rejected'].includes(v.status)],
]

const inp = 'w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm'
const btnP = 'min-h-11 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50'
const btnS = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'

export default function AdminViewingsPage() {
  const [tab, setTab] = useState('respond')
  const [rows, setRows] = useState<any[]>([])
  const [events, setEvents] = useState<Record<string, any[]>>({})
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [f, setF] = useState<Record<string, string>>({})
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('viewings').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) {
      setMsg({ text: 'Could not load viewings. Make sure the viewing workflow SQL has been run.', ok: false })
      console.error('admin viewings load failed:', error.message)
      setLoading(false)
      return
    }
    const list = data ?? []
    setRows(list)
    if (list.length) {
      const ids = list.map((x: any) => x.id)
      const tenantIds = Array.from(new Set(list.map((x: any) => x.tenant_id)))
      const [{ data: c }, { data: p }, { data: ev }] = await Promise.all([
        supabase.from('viewing_contacts').select('viewing_id, phone').in('viewing_id', ids),
        supabase.from('profiles').select('id, full_name').in('id', tenantIds),
        supabase.from('viewing_events').select('*').in('viewing_id', ids).order('created_at', { ascending: false }),
      ])
      setPhones(Object.fromEntries((c ?? []).map((x: any) => [x.viewing_id, x.phone])))
      setNames(Object.fromEntries((p ?? []).map((x: any) => [x.id, x.full_name || 'Applicant'])))
      const g: Record<string, any[]> = {}
      ;(ev ?? []).forEach((e: any) => { (g[e.viewing_id] ||= []).push(e) })
      setEvents(g)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const { listings, inspected } = usePropertyData(useMemo(() => rows.map((r) => r.listing_id), [rows]))

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

  const current = TABS.find((t) => t[0] === tab)!
  const shown = rows.filter(current[2])

  return (
    <div className="max-w-4xl mx-auto w-full p-4">
      <h1 className="text-2xl font-bold text-foreground mb-1">Viewings</h1>
      <p className="text-sm text-muted-foreground mb-4">Approving a viewing does not approve the application, reserve the property, or start a tenancy.</p>

      <div className="flex gap-2 mb-4 overflow-x-auto border-b border-border">
        {TABS.map(([k, l, fn]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground'}`}>
            {l} ({rows.filter(fn).length})
          </button>
        ))}
      </div>

      {msg && <p role="status" className={`text-sm rounded-md p-3 mb-3 font-medium ${msg.ok ? 'text-emerald-900 bg-emerald-50 border border-emerald-300' : 'text-red-900 bg-red-50 border border-red-300'}`}>{msg.text}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nothing here.</p>
      ) : (
        <div className="space-y-4">
          {shown.map((v) => {
            const ref = 'VW-' + String(v.id).slice(0, 8).toUpperCase()
            const iso = toIso(f[`when-${v.id}`] ?? '')
            const msgText = (f[`msg-${v.id}`] ?? '').trim()
            const open = ['requested', 'approved', 'reschedule_proposed', 'scheduled'].includes(v.status)
            return (
              <article key={v.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-foreground">{names[v.tenant_id] ?? 'Applicant'}</p>
                    <p className="text-xs text-muted-foreground">{ref} · requested {fmtDateTime(v.created_at)}</p>
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <PropertySummary listing={listings[v.listing_id]} inspected={inspected.has(v.listing_id)} />

                <div className="rounded-lg bg-secondary p-3 text-sm space-y-1">
                  <p><b>Tenant prefers:</b> {fmtDateTime(v.preferred_at)}</p>
                  {v.proposed_at && <p><b>Proposed to tenant:</b> {fmtDateTime(v.proposed_at)}</p>}
                  <p><b>Confirmed appointment:</b> {v.scheduled_for ? fmtDateTime(v.scheduled_for) : 'Not scheduled'}</p>
                  {v.tenant_note && <p><b>Tenant note:</b> {v.tenant_note}</p>}
                  {v.meeting_instructions && <p><b>Meeting instructions:</b> {v.meeting_instructions}</p>}
                  <p className="flex flex-wrap items-center gap-2">
                    <Phone size={14} />
                    {phones[v.id] ? (
                      <a href={`tel:${phones[v.id]}`} className="font-bold text-primary underline">Call tenant {phones[v.id]}</a>
                    ) : <span>No contact number on record</span>}
                    <span className="text-xs text-muted-foreground">· contact: {String(v.contact_status).replace(/_/g, ' ')}</span>
                  </p>
                  {v.tenant_decision && (
                    <p className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${v.tenant_decision === 'interested' ? TONE_CLASS.amber : TONE_CLASS.grey}`}>
                      {v.tenant_decision === 'interested' ? 'TENANT WANTS TO CONTINUE — REVIEW APPLICATION' : 'TENANT NO LONGER INTERESTED'}
                    </p>
                  )}
                </div>

                <p className={`text-sm font-semibold rounded-md border p-2 ${TONE_CLASS[viewingTone(v.status)]}`}>Next: {staffNext(v)}</p>

                {open && (
                  <div className="space-y-2">
                    {['requested', 'approved', 'scheduled', 'reschedule_proposed'].includes(v.status) && (
                      <>
                        <label className="block text-xs font-semibold">Date and time
                          <input type="datetime-local" className={`${inp} mt-1`} value={f[`when-${v.id}`] ?? ''} onChange={(e) => set(`when-${v.id}`, e.target.value)} />
                        </label>
                        <input className={inp} maxLength={400} placeholder="Message to the tenant (required to reject)" value={f[`msg-${v.id}`] ?? ''} onChange={(e) => set(`msg-${v.id}`, e.target.value)} />
                        <input className={inp} maxLength={300} placeholder="Meeting instructions, e.g. meet at the gate (optional)" value={f[`ins-${v.id}`] ?? ''} onChange={(e) => set(`ins-${v.id}`, e.target.value)} />
                        <div className="flex flex-wrap gap-2">
                          {v.status !== 'reschedule_proposed' && (
                            <button disabled={busy || (v.status !== 'requested' && !iso)} className={btnP}
                              onClick={() => call('admin_respond_viewing', { p_viewing: v.id, p_action: 'approve', p_when: iso, p_message: msgText || null, p_instructions: (f[`ins-${v.id}`] ?? '').trim() || null },
                                iso ? 'Appointment scheduled. The tenant has been notified.' : 'Request approved. Choose a time next, the tenant is told it is not scheduled yet.')}>
                              {v.status === 'scheduled' ? 'Reschedule appointment' : iso ? 'Approve and schedule' : 'Approve — schedule later'}
                            </button>
                          )}
                          {v.status !== 'scheduled' && (
                            <button disabled={busy || !iso} className={btnS}
                              onClick={() => call('admin_respond_viewing', { p_viewing: v.id, p_action: 'propose', p_when: iso, p_message: msgText || null, p_instructions: (f[`ins-${v.id}`] ?? '').trim() || null }, 'New time proposed to the tenant.')}>
                              Propose this time
                            </button>
                          )}
                          {v.status !== 'scheduled' && (
                            <button disabled={busy || !msgText} className={btnS}
                              onClick={() => call('admin_respond_viewing', { p_viewing: v.id, p_action: 'reject', p_when: null, p_message: msgText, p_instructions: null }, 'Request rejected. The tenant can see your reason.', 'Reject this viewing request?')}>
                              Reject with reason
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {v.status === 'scheduled' && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button disabled={busy} className={btnS} onClick={() => call('record_viewing_contact', { p_viewing: v.id, p_status: 'attempted', p_note: null }, 'Recorded: contact attempted.')}>Record call attempted</button>
                        <button disabled={busy} className={btnS} onClick={() => call('record_viewing_contact', { p_viewing: v.id, p_status: 'reached', p_note: null }, 'Recorded: tenant reached.')}>Record tenant reached</button>
                        <button disabled={busy} className={btnP} onClick={() => call('complete_viewing', { p_viewing: v.id, p_outcome: 'completed', p_note: msgText || null }, 'Viewing recorded as completed. The tenant can now choose what to do next.', 'Record this viewing as completed?')}>Record viewing completed</button>
                        <button disabled={busy} className={btnS} onClick={() => call('complete_viewing', { p_viewing: v.id, p_outcome: 'no_show', p_note: msgText || null }, 'Viewing recorded as missed.', 'Record this viewing as missed?')}>Record viewing missed</button>
                      </div>
                    )}

                    <button disabled={busy} className="text-sm text-muted-foreground underline hover:text-destructive" onClick={() => call('cancel_viewing', { p_viewing: v.id, p_note: msgText || null }, 'Viewing cancelled.', 'Cancel this viewing? The tenant will be told.')}>Cancel viewing</button>
                  </div>
                )}

                <History events={events[v.id] ?? []} />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}