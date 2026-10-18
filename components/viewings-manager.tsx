'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Phone, CalendarClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime, toIso } from '@/lib/case-status'
import {
  OPEN_STATUSES, TONE_CLASS, eventLabel, normaliseNgPhone, tenantPanel, viewingLabel, viewingTone,
} from '@/lib/viewing-status'
import { PropertySummary, usePropertyData } from '@/components/property-summary'

type Props = { role: 'tenant' | 'landlord' }

const inp = 'w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm'
const btnP = 'min-h-11 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50'
const btnS = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[viewingTone(status)]}`}>
      {viewingLabel(status)}
    </span>
  )
}

export function History({ events }: { events: any[] }) {
  if (!events.length) return null
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-foreground">Activity history ({events.length})</summary>
      <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
        {events.map((e) => (
          <li key={e.id}>
            <p className="font-medium text-foreground">{eventLabel(e.event_type)}</p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)} · {e.actor_role ?? 'system'}</p>
            {e.note && <p className="text-xs text-foreground">{e.note}</p>}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function ViewingsManager({ role }: Props) {
  const [viewings, setViewings] = useState<any[]>([])
  const [apps, setApps] = useState<any[]>([])
  const [events, setEvents] = useState<Record<string, any[]>>({})
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [profilePhone, setProfilePhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [when, setWhen] = useState<Record<string, string>>({})
  const [phone, setPhone] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data: v, error } = await supabase.from('viewings').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) {
      setMsg({ text: 'Could not load your viewings. Please refresh and try again.', ok: false })
      console.error('viewings load failed:', error.message)
      setLoading(false)
      return
    }
    const list = v ?? []
    setViewings(list)

    if (role === 'tenant') {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      const [{ data: a }, { data: p }, { data: c }] = await Promise.all([
        supabase.from('applications').select('id, status, listing_id').in('status', ['pending', 'info_requested', 'approved']),
        uid ? supabase.from('profiles').select('phone').eq('id', uid).maybeSingle() : Promise.resolve({ data: null } as any),
        supabase.from('viewing_contacts').select('viewing_id, phone'),
      ])
      setApps(a ?? [])
      setProfilePhone((p as any)?.phone ?? '')
      setPhones(Object.fromEntries((c ?? []).map((x: any) => [x.viewing_id, x.phone])))
    } else if (list.length) {
      const ids = Array.from(new Set(list.map((x: any) => x.tenant_id)))
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((p ?? []).map((x: any) => [x.id, x.full_name || 'Applicant'])))
    }

    if (list.length) {
      const { data: ev } = await supabase.from('viewing_events').select('*').in('viewing_id', list.map((x: any) => x.id)).order('created_at', { ascending: false })
      const grouped: Record<string, any[]> = {}
      ;(ev ?? []).forEach((e: any) => { (grouped[e.viewing_id] ||= []).push(e) })
      setEvents(grouped)
    }
    setLoading(false)
  }, [role])

  useEffect(() => { load() }, [load])

  const listingIds = useMemo(() => [...viewings.map((x) => x.listing_id), ...apps.map((x) => x.listing_id)], [viewings, apps])
  const { listings, inspected } = usePropertyData(listingIds)

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

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>

  const openFor = (appId: string) => viewings.some((v) => v.application_id === appId && OPEN_STATUSES.includes(v.status))
  const requestable = apps.filter((a) => !openFor(a.id))

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Viewings</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {role === 'tenant'
          ? 'See the property in person before you pay anything. EboHomes confirms every appointment and will call you to coordinate.'
          : 'Viewings for your properties. EboHomes schedules and manages them, so this page is for your information.'}
      </p>
      {msg && <p role="status" className={`text-sm rounded-md p-3 mb-4 font-medium ${msg.ok ? 'text-emerald-900 bg-emerald-50 border border-emerald-300' : 'text-red-900 bg-red-50 border border-red-300'}`}>{msg.text}</p>}

      {role === 'tenant' && requestable.length > 0 && (
        <div className="space-y-3 mb-8">
          <h2 className="text-sm font-bold text-foreground">REQUEST A VIEWING</h2>
          {requestable.map((a) => {
            const ph = phone[a.id] ?? profilePhone
            const phoneOk = !!normaliseNgPhone(ph)
            const iso = toIso(when[a.id] ?? '')
            return (
              <div key={a.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
                <PropertySummary listing={listings[a.listing_id]} inspected={inspected.has(a.listing_id)} />
                <label className="block text-xs font-semibold text-foreground">Preferred date and time
                  <input type="datetime-local" value={when[a.id] ?? ''} onChange={(e) => setWhen((p) => ({ ...p, [a.id]: e.target.value }))} className={`${inp} mt-1`} />
                </label>
                <label className="block text-xs font-semibold text-foreground">Phone number EboHomes can call
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={ph} onChange={(e) => setPhone((p) => ({ ...p, [a.id]: e.target.value }))} className={`${inp} mt-1`} />
                </label>
                {ph && !phoneOk && <p className="text-xs text-red-700">Enter a valid Nigerian mobile number, for example 0803 123 4567.</p>}
                <input value={note[a.id] ?? ''} onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))} maxLength={300} placeholder="Anything we should know? (optional)" className={inp} />
                <button
                  disabled={busy || !phoneOk || !iso}
                  onClick={() => call('request_viewing', { p_application: a.id, p_preferred: iso, p_note: (note[a.id] ?? '').trim() || null, p_phone: ph }, 'VIEWING REQUEST RECEIVED. EboHomes has received your request. We will confirm the appointment here.')}
                  className={`${btnP} w-full sm:w-auto`}
                >
                  Request viewing
                </button>
              </div>
            )
          })}
        </div>
      )}

      {viewings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-lg">No viewings yet.</p>
      ) : (
        <div className="space-y-6">
          {viewings.map((v) => {
            const panel = tenantPanel(v, fmtDateTime)
            const ref = 'VW-' + String(v.id).slice(0, 8).toUpperCase()
            const mine = role === 'tenant'
            return (
              <section key={v.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {mine ? (
                  <div className={`border-b p-4 space-y-2 ${TONE_CLASS[panel.tone]}`}>
                    <p className="text-base font-extrabold leading-tight">{panel.heading}</p>
                    <p className="text-sm">{panel.body}</p>
                    {v.admin_response && (
                      <div className="rounded-md bg-white/70 p-3 text-sm">
                        <p className="text-xs font-bold">LATEST MESSAGE FROM EBOHOMES{v.admin_responded_at ? ` · ${fmtDateTime(v.admin_responded_at)}` : ''}</p>
                        <p>{v.admin_response}</p>
                      </div>
                    )}
                    {v.meeting_instructions && v.status === 'scheduled' && (
                      <p className="text-sm"><span className="font-bold">Meeting instructions: </span>{v.meeting_instructions}</p>
                    )}
                    <p className="text-sm font-bold">NEXT STEP: {panel.next}</p>
                    <p className="text-xs">{panel.owner === 'tenant' ? 'Action needed from you.' : panel.owner === 'ebohomes' ? 'Action needed from EboHomes.' : 'No action needed.'}</p>
                  </div>
                ) : (
                  <div className={`border-b p-4 flex flex-wrap items-center justify-between gap-2 ${TONE_CLASS[viewingTone(v.status)]}`}>
                    <StatusBadge status={v.status} />
                    <span className="text-xs font-semibold">{ref}</span>
                  </div>
                )}

                <div className="p-4 space-y-4">
                  {mine && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold">Reference {ref}</span>
                      <StatusBadge status={v.status} />
                    </div>
                  )}
                  {!mine && <p className="text-sm font-semibold text-foreground">Applicant: {names[v.tenant_id] ?? '—'}</p>}

                  <div className="rounded-lg bg-secondary p-3 text-sm space-y-1">
                    <p className="flex items-center gap-2"><CalendarClock size={15} />
                      {v.scheduled_for ? <span><b>Confirmed:</b> {fmtDateTime(v.scheduled_for)}</span>
                        : v.proposed_at ? <span><b>Proposed:</b> {fmtDateTime(v.proposed_at)}</span>
                        : <span><b>Requested:</b> {fmtDateTime(v.preferred_at)}</span>}
                    </p>
                    {mine && phones[v.id] && <p className="flex items-center gap-2"><Phone size={15} /> EboHomes will call {phones[v.id]}</p>}
                  </div>

                  <PropertySummary listing={listings[v.listing_id]} inspected={inspected.has(v.listing_id)} full={mine} />

                  {mine && v.status === 'reschedule_proposed' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <button disabled={busy} className={btnP} onClick={() => call('tenant_respond_proposal', { p_viewing: v.id, p_accept: true, p_message: null }, 'Viewing scheduled for the proposed time.')}>Accept proposed time</button>
                        <button disabled={busy} className={btnS} onClick={() => call('tenant_respond_proposal', { p_viewing: v.id, p_accept: false, p_message: (note[v.id] ?? '').trim() || null }, 'Declined. EboHomes will offer another time.')}>Decline proposed time</button>
                      </div>
                      <input value={note[v.id] ?? ''} onChange={(e) => setNote((p) => ({ ...p, [v.id]: e.target.value }))} maxLength={300} placeholder="Tell EboHomes what time suits you (optional)" className={inp} />
                    </div>
                  )}

                  {mine && v.status === 'completed' && !v.tenant_decision && (
                    <div className="space-y-2 rounded-lg border-2 border-primary p-3">
                      <p className="text-sm font-extrabold text-foreground">WHAT WOULD YOU LIKE TO DO NEXT?</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button disabled={busy} className={btnP} onClick={() => call('tenant_viewing_decision', { p_viewing: v.id, p_interested: true }, 'Recorded. EboHomes will review your application and confirm the property and rental terms.', 'Continue with renting this property? This does not approve your application or reserve the property.')}>I&apos;m interested — continue with renting</button>
                        <button disabled={busy} className={btnS} onClick={() => call('tenant_viewing_decision', { p_viewing: v.id, p_interested: false }, 'Recorded. The property may stay available to others.', 'Tell EboHomes you are no longer interested in this property?')}>I&apos;m no longer interested</button>
                      </div>
                    </div>
                  )}

                  {mine && OPEN_STATUSES.includes(v.status) && (
                    <button disabled={busy} onClick={() => call('cancel_viewing', { p_viewing: v.id, p_note: null }, 'Viewing cancelled.', 'Cancel this viewing?')} className="text-sm text-muted-foreground underline hover:text-destructive">Cancel this viewing</button>
                  )}

                  <History events={events[v.id] ?? []} />
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}