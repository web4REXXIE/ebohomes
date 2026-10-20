'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Phone, CalendarClock, CheckCircle2, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime, toIso } from '@/lib/case-status'
import {
  OPEN_STATUSES, TONE_CLASS, eventLabel, normaliseNgPhone, tenantPanel, viewingLabel, viewingTone,
} from '@/lib/viewing-status'
import { VIEWING_GROUP_ORDER, VIEWING_GROUP_TITLE, groupViewings, type ViewingGroup } from '@/lib/viewing-groups'
import { displayTitle, listingIsLive } from '@/lib/property-display'
import { PropertySummary, usePropertyData } from '@/components/property-summary'

type Props = { role: 'tenant' | 'landlord' }

const inp = 'w-full bg-input border border-border rounded-md px-3 py-2.5 text-sm'
const btnP = 'min-h-11 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50'
const btnS = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'

// Some status text is stored in capitals. Show it in normal sentence case.
// Text that is not entirely capitals is left exactly as written.
function tidy(s: string | null | undefined): string {
  if (!s) return ''
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s
  const lower = s.toLowerCase().replace(/ebohomes/g, 'EboHomes')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const GROUP_HELP: Record<'tenant' | 'landlord', Record<ViewingGroup, string>> = {
  tenant: {
    action: 'These need a reply or a decision from you.',
    scheduled: 'EboHomes confirmed these appointments.',
    waiting: 'Nothing for you to do. EboHomes will update you here.',
    past: 'Finished, missed or cancelled viewings.',
  },
  landlord: {
    action: 'These need attention.',
    scheduled: 'EboHomes confirmed these appointments.',
    waiting: 'EboHomes is arranging these. This page is for your information.',
    past: 'Finished, missed or cancelled viewings.',
  },
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[viewingTone(status)]}`}>
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

  // One request form, shared by every property.
  const [picked, setPicked] = useState<string | null>(null)
  const [when, setWhen] = useState('')
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null)
  const [reqNote, setReqNote] = useState('')
  // Optional message when declining a proposed time. Keyed by viewing id.
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
        supabase.from('applications').select('id, status, listing_id, tenant_interest_at').in('status', ['pending', 'info_requested', 'approved']),
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
  const nameOf = (listingId: string) => displayTitle(listings[listingId])
  const hrefOf = (listingId: string) => (listingIsLive(listings[listingId]?.status) ? `/listing/${listingId}` : undefined)

  // Returns true when the database accepted the action.
  const call = async (fn: string, args: Record<string, any>, ok: string, confirmText?: string): Promise<boolean> => {
    if (busy) return false
    if (confirmText && !window.confirm(confirmText)) return false
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setMsg(error ? { text: error.message, ok: false } : { text: ok, ok: true })
    setBusy(false)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!error) await load()
    return !error
  }

  const groups = useMemo(() => groupViewings(viewings), [viewings])

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} aria-label="Loading viewings" /></div>

  const openFor = (appId: string) => viewings.some((v) => v.application_id === appId && OPEN_STATUSES.includes(v.status))
  const requestable = apps.filter((a) => !openFor(a.id))
  const selectedId = picked && requestable.some((a) => a.id === picked) ? picked : requestable.length === 1 ? requestable[0].id : null
  const selected = requestable.find((a) => a.id === selectedId) ?? null
  const ph = phoneEdit ?? profilePhone
  const phoneOk = !!normaliseNgPhone(ph)
  const iso = toIso(when)

  const renderViewing = (v: any) => {
    const app = role === 'tenant' && v.application_id ? (apps.find((a) => a.id === v.application_id) ?? { status: 'closed' }) : undefined
    const panel = tenantPanel(v, fmtDateTime, app)
    const ref = 'VW-' + String(v.id).slice(0, 8).toUpperCase()
    const mine = role === 'tenant'
    const ownerText =
      panel.owner === 'tenant'
        ? 'Action needed from you'
        : panel.owner === 'ebohomes'
          ? 'Action needed from EboHomes'
          : 'No action needed'

    return (
      <section key={v.id} className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <PropertySummary compact listing={listings[v.listing_id]} inspected={inspected.has(v.listing_id)} href={hrefOf(v.listing_id)} />
        </div>

        {mine ? (
          <div className={`space-y-3 border-b p-4 ${TONE_CLASS[panel.tone]}`}>
            <p className="text-base font-bold leading-snug">{tidy(panel.heading)}</p>
            <p className="text-sm">{panel.body}</p>
            {v.admin_response && (
              <div className="rounded-md bg-white/70 p-3 text-sm">
                <p className="text-xs font-semibold">
                  Latest message from EboHomes{v.admin_responded_at ? ` · ${fmtDateTime(v.admin_responded_at)}` : ''}
                </p>
                <p>{v.admin_response}</p>
              </div>
            )}
            {v.meeting_instructions && v.status === 'scheduled' && (
              <p className="text-sm"><span className="font-semibold">Meeting instructions: </span>{v.meeting_instructions}</p>
            )}
            <div className="rounded-md bg-white/70 p-3">
              <p className="flex items-start gap-1.5 text-sm font-semibold">
                <ArrowRight size={15} className="mt-0.5 shrink-0" aria-hidden />
                <span>Next step: {tidy(panel.next)}</span>
              </p>
              <p className="mt-1 pl-5 text-xs">{ownerText}</p>
            </div>
            {panel.href && panel.cta && (
              <Link href={panel.href} className="inline-flex min-h-11 items-center rounded-md border border-current px-4 text-sm font-semibold">{panel.cta}</Link>
            )}
          </div>
        ) : (
          <div className={`flex flex-wrap items-center justify-between gap-2 border-b p-4 ${TONE_CLASS[viewingTone(v.status)]}`}>
            <StatusBadge status={v.status} />
            <span className="text-xs font-semibold">{ref}</span>
          </div>
        )}

        <div className="space-y-4 p-4">
          {mine && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">Reference {ref}</span>
              <StatusBadge status={v.status} />
            </div>
          )}
          {!mine && <p className="text-sm font-semibold text-foreground">Applicant: {names[v.tenant_id] ?? '—'}</p>}

          <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
            <p className="flex items-center gap-2">
              <CalendarClock size={15} aria-hidden />
              {v.scheduled_for ? <span><b>Confirmed:</b> {fmtDateTime(v.scheduled_for)}</span>
                : v.proposed_at ? <span><b>Proposed:</b> {fmtDateTime(v.proposed_at)}</span>
                : v.preferred_at ? <span><b>Requested:</b> {fmtDateTime(v.preferred_at)}</span>
                : <span className="text-muted-foreground">No preferred time given. EboHomes will suggest one.</span>}
            </p>
            {mine && phones[v.id] && <p className="flex items-center gap-2"><Phone size={15} aria-hidden /> EboHomes will call {phones[v.id]}</p>}
          </div>

          {mine && v.status === 'reschedule_proposed' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className={btnP} onClick={() => call('tenant_respond_proposal', { p_viewing: v.id, p_accept: true, p_message: null }, `Accepted. Your viewing of "${nameOf(v.listing_id)}" is scheduled for the proposed time.`)}>Accept proposed time</button>
                <button disabled={busy} className={btnS} onClick={() => call('tenant_respond_proposal', { p_viewing: v.id, p_accept: false, p_message: (note[v.id] ?? '').trim() || null }, `Declined. EboHomes will offer another time for "${nameOf(v.listing_id)}".`)}>Decline proposed time</button>
              </div>
              <input aria-label="Tell EboHomes what time suits you" value={note[v.id] ?? ''} onChange={(e) => setNote((p) => ({ ...p, [v.id]: e.target.value }))} maxLength={300} placeholder="Tell EboHomes what time suits you (optional)" className={inp} />
            </div>
          )}

          {mine && v.status === 'completed' && !v.tenant_decision && (
            <div className="space-y-2 rounded-lg border-2 border-primary p-3">
              <p className="text-sm font-bold text-foreground">What would you like to do next?</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button disabled={busy} className={btnP} onClick={() => call('tenant_viewing_decision', { p_viewing: v.id, p_interested: true }, `Recorded for "${nameOf(v.listing_id)}". EboHomes will review your application and confirm the property and rental terms. Nothing is approved or reserved yet.`, 'Continue with renting this property? This does not approve your application or reserve the property.')}>I&apos;m interested — continue with renting</button>
                <button disabled={busy} className={btnS} onClick={() => call('tenant_viewing_decision', { p_viewing: v.id, p_interested: false }, `Recorded. You are no longer interested in "${nameOf(v.listing_id)}".`, 'Tell EboHomes you are no longer interested in this property?')}>I&apos;m no longer interested</button>
              </div>
            </div>
          )}

          {mine && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-foreground">Full property details</summary>
              <div className="mt-3">
                <PropertySummary listing={listings[v.listing_id]} inspected={inspected.has(v.listing_id)} full />
              </div>
            </details>
          )}

          {mine && OPEN_STATUSES.includes(v.status) && (
            <button disabled={busy} onClick={() => call('cancel_viewing', { p_viewing: v.id, p_note: null }, `Viewing of "${nameOf(v.listing_id)}" cancelled.`, 'Cancel this viewing?')} className="min-h-11 text-sm text-muted-foreground underline hover:text-destructive">Cancel this viewing</button>
          )}

          <History events={events[v.id] ?? []} />
        </div>
      </section>
    )
  }

  const submitRequest = async () => {
    if (!selected || !iso || !phoneOk) return
    const title = nameOf(selected.listing_id)
    const ok = await call(
      'request_viewing',
      { p_application: selected.id, p_preferred: iso, p_note: reqNote.trim() || null, p_phone: ph },
      `Viewing requested for "${title}". EboHomes has received it and will confirm the appointment here.`,
    )
    if (ok) {
      setPicked(null)
      setWhen('')
      setReqNote('')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Viewings</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {role === 'tenant'
          ? 'See the property in person before you pay anything. EboHomes confirms every appointment and will call you to coordinate.'
          : 'Viewings for your properties. EboHomes schedules and manages them, so this page is for your information.'}
      </p>

      {msg && (
        <div role="status" className={`mb-4 flex items-start gap-2 rounded-md p-3 text-sm font-medium ${msg.ok ? 'border border-emerald-300 bg-emerald-50 text-emerald-900' : 'border border-red-300 bg-red-50 text-red-900'}`}>
          {msg.ok && <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />}
          <span>{msg.text}</span>
        </div>
      )}

      {role === 'tenant' && requestable.length > 0 && (
        <div className="mb-8 space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-bold text-foreground">Request a viewing</h2>
          <p className="text-sm text-muted-foreground">
            {requestable.length > 1 ? '1. Choose the property you want to see.' : 'Property you want to see:'}
          </p>
          <div role="radiogroup" aria-label="Choose a property" className="space-y-2">
            {requestable.map((a) => {
              const on = a.id === selectedId
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(a.id)}
                  className={`block w-full rounded-lg border-2 p-3 text-left transition ${on ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary/60'}`}
                >
                  <PropertySummary compact listing={listings[a.listing_id]} inspected={inspected.has(a.listing_id)} />
                  {on && <p className="mt-2 text-xs font-semibold text-primary">✓ Selected</p>}
                </button>
              )
            })}
          </div>

          {selected ? (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">{requestable.length > 1 ? '2. ' : ''}Tell us when and how to reach you.</p>
              <label className="block text-xs font-semibold text-foreground">Preferred date and time
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${inp} mt-1`} />
              </label>
              <label className="block text-xs font-semibold text-foreground">Phone number EboHomes can call
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={ph} onChange={(e) => setPhoneEdit(e.target.value)} className={`${inp} mt-1`} />
              </label>
              {ph && !phoneOk && <p className="text-xs text-red-700">Enter a valid Nigerian mobile number, for example 0803 123 4567.</p>}
              <input aria-label="Anything we should know?" value={reqNote} onChange={(e) => setReqNote(e.target.value)} maxLength={300} placeholder="Anything we should know? (optional)" className={inp} />
              <button disabled={busy || !phoneOk || !iso} onClick={submitRequest} className={`${btnP} w-full`}>
                Request viewing for {nameOf(selected.listing_id)}
              </button>
              {(!phoneOk || !iso) && <p className="text-xs text-muted-foreground">Choose a date and enter a valid phone number to continue.</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tap a property above to continue.</p>
          )}
        </div>
      )}

      {role === 'tenant' && requestable.length === 0 && (
        <div className="mb-8 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold text-foreground">Request a viewing</p>
          {apps.length === 0 ? (
            <p className="mt-1 text-muted-foreground">
              To request a viewing, first apply for a property. <Link href="/search" className="font-semibold text-primary underline">Browse properties</Link>
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">You already have an open viewing for every property you applied for.</p>
          )}
        </div>
      )}

      {viewings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No viewings yet.</p>
      ) : (
        <div className="space-y-8">
          {VIEWING_GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => {
            const title = `${VIEWING_GROUP_TITLE[role][g]} (${groups[g].length})`
            if (g === 'past') {
              return (
                <details key={g}>
                  <summary className="cursor-pointer text-lg font-bold text-foreground">{title}</summary>
                  <p className="mb-3 mt-1 text-sm text-muted-foreground">{GROUP_HELP[role][g]}</p>
                  <div className="space-y-4">{groups[g].map(renderViewing)}</div>
                </details>
              )
            }
            return (
              <div key={g}>
                <h2 className="text-lg font-bold text-foreground">{title}</h2>
                <p className="mb-3 text-sm text-muted-foreground">{GROUP_HELP[role][g]}</p>
                <div className="space-y-4">{groups[g].map(renderViewing)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}