'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarClock, Loader2, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/case-status'
import {
  GROUP_ORDER,
  GROUP_TITLE,
  LANDLORD_ANSWERABLE,
  LANDLORD_PRIVACY_NOTE,
  REASON_MAX,
  TENANT_CANCELLABLE,
  TONE_CLASS,
  checkAccessTime,
  checkReason,
  friendlyError,
  landlordGroup,
  landlordLabel,
  landlordTone,
  localToIso,
  reportHref,
  statusLabel,
  statusTone,
  tenantGroup,
  tenantLine,
  type Group,
  type RequestRow,
} from '@/lib/remote-inspection'

type Props = { role: 'tenant' | 'landlord' }

const inp = 'w-full bg-input border border-border rounded-md px-3 py-2.5 text-base'
const btnP = 'min-h-11 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50'
const btnS = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'

const GROUP_HELP: Record<Props['role'], Record<Group, string>> = {
  tenant: {
    action: 'These are ready for you.',
    scheduled: 'An inspector is booked.',
    waiting: 'Nothing for you to do. EboHomes updates you here.',
    past: 'Cancelled, expired or finished requests.',
  },
  landlord: {
    action: 'These need your answer. No inspector is sent until you agree.',
    scheduled: 'EboHomes booked these visits.',
    waiting: 'EboHomes is arranging these. This is for your information.',
    past: 'Closed requests.',
  },
}

function Badge({ label, tone }: { label: string; tone: keyof typeof TONE_CLASS }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[tone]}`}>{label}</span>
}

// One screen for both people. The database function decides what each person receives. The tenant never gets
// the owner's reply. The owner never gets the tenant, the note or any report.
export function RemoteInspectionsManager({ role }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  // Which request has a form open, and which form.
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<'cancel' | 'confirm' | 'refuse' | null>(null)
  const [reason, setReason] = useState('')
  const [when, setWhen] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      router.push(`/login?redirect=${encodeURIComponent(role === 'tenant' ? '/inspections' : '/dashboard/inspection-requests')}`)
      return
    }
    const { data, error } = await supabase.rpc(role === 'tenant' ? 'my_remote_inspection_requests' : 'my_landlord_inspection_requests')
    if (error) {
      setMsg({ text: 'Could not load your inspection requests. Please refresh and try again.', ok: false })
      console.error('inspection requests load failed:', error.message)
    } else {
      setRows(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [role, router])

  useEffect(() => {
    load()
  }, [load])

  const close = () => {
    setOpenId(null)
    setMode(null)
    setReason('')
    setWhen('')
    setFormError('')
  }

  const start = (id: string, m: 'cancel' | 'confirm' | 'refuse') => {
    setOpenId(id)
    setMode(m)
    setReason('')
    setWhen('')
    setFormError('')
    setMsg(null)
  }

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) {
      setFormError(friendlyError(error.message))
      return
    }
    close()
    setMsg({ text: ok, ok: true })
    await load()
  }

  const submitCancel = (id: string) => {
    const err = checkReason(reason, 'cancelling')
    if (err) return setFormError(err)
    run('tenant_cancel_remote_inspection', { p_request: id, p_reason: reason.trim() }, 'Request cancelled.')
  }

  const submitConfirm = (id: string) => {
    const err = checkAccessTime(when)
    if (err) return setFormError(err)
    run(
      'landlord_respond_remote_inspection',
      { p_request: id, p_decision: 'confirm', p_time: localToIso(when), p_note: reason.trim() || null },
      'Thank you. EboHomes will now arrange an inspector for that time.'
    )
  }

  const submitRefuse = (id: string) => {
    const err = checkReason(reason, 'refusing')
    if (err) return setFormError(err)
    run('landlord_respond_remote_inspection', { p_request: id, p_decision: 'refuse', p_time: null, p_note: reason.trim() }, 'Recorded. The request is closed.')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const groupOf = role === 'tenant' ? tenantGroup : landlordGroup
  const grouped: Record<Group, RequestRow[]> = { action: [], scheduled: [], waiting: [], past: [] }
  rows.forEach((r) => grouped[groupOf(r)].push(r))

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28">
      <h1 className="text-2xl font-extrabold text-foreground">{role === 'tenant' ? 'My inspections' : 'Inspection requests'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {role === 'tenant'
          ? 'Free remote inspections you asked for. Reports are private to you.'
          : LANDLORD_PRIVACY_NOTE}
      </p>

      {msg && (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`mt-4 rounded-lg border p-3 text-sm ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-red-300 bg-red-50 text-red-900'}`}
        >
          {msg.text}
        </p>
      )}

      {rows.length === 0 && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm text-foreground">
          {role === 'tenant' ? (
            <>
              <p className="font-semibold">No inspection requests yet.</p>
              <p className="mt-1 text-muted-foreground">Open a property you like and tap &quot;Request a remote inspection&quot;.</p>
              <Link href="/search" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Find a property
              </Link>
            </>
          ) : (
            <p className="font-semibold">No one has asked to inspect your properties.</p>
          )}
        </div>
      )}

      {GROUP_ORDER.filter((g) => grouped[g].length > 0).map((g) => (
        <section key={g} className="mt-6" aria-label={GROUP_TITLE[g]}>
          <h2 className="text-base font-extrabold text-foreground">
            {GROUP_TITLE[g]} ({grouped[g].length})
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">{GROUP_HELP[role][g]}</p>
          <ul className="space-y-3">
            {grouped[g].map((r) => {
              const active = openId === r.id
              const label = role === 'tenant' ? statusLabel(r.status) : landlordLabel(r.status)
              const tone = role === 'tenant' ? statusTone(r.status) : landlordTone(r.status)
              return (
                <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{r.title || 'Property'}</p>
                      {r.location_text && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={12} aria-hidden /> {r.location_text}
                        </p>
                      )}
                      {r.ref && <p className="mt-0.5 text-xs text-muted-foreground">Ref {r.ref}</p>}
                    </div>
                    <Badge label={label} tone={tone} />
                  </div>

                  {role === 'tenant' ? (
                    <p className="mt-3 text-sm leading-relaxed text-foreground">{tenantLine(r, fmtDateTime)}</p>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-foreground">
                      {LANDLORD_ANSWERABLE.includes(r.status)
                        ? r.landlord_due_at
                          ? `Please answer by ${fmtDateTime(r.landlord_due_at)}.`
                          : 'Please confirm access and a time.'
                        : r.scheduled_for
                          ? `Inspection booked for ${fmtDateTime(r.scheduled_for)}.`
                          : r.landlord_time
                            ? `You offered ${fmtDateTime(r.landlord_time)}.`
                            : ''}
                    </p>
                  )}

                  {role === 'tenant' && r.status === 'awaiting_landlord' && r.preferred_from && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock size={12} aria-hidden /> You asked for {fmtDateTime(r.preferred_from)} to {fmtDateTime(r.preferred_to)}.
                    </p>
                  )}

                  {role === 'tenant' && r.status === 'cancelled' && r.cancel_reason && (
                    <p className="mt-1 text-xs text-muted-foreground">Your reason: {r.cancel_reason}</p>
                  )}

                  {/* actions */}
                  {!active && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {role === 'tenant' && TENANT_CANCELLABLE.includes(r.status) && (
                        <button type="button" className={btnS} onClick={() => start(r.id, 'cancel')}>
                          Cancel request
                        </button>
                      )}
                      {role === 'tenant' && r.status === 'completed' && r.report_ready && (
                        <Link href={reportHref(r.id)} className={`${btnP} inline-flex items-center`}>
                          View report
                        </Link>
                      )}
                      {role === 'landlord' && LANDLORD_ANSWERABLE.includes(r.status) && (
                        <>
                          <button type="button" className={btnP} onClick={() => start(r.id, 'confirm')}>
                            Allow access
                          </button>
                          <button type="button" className={btnS} onClick={() => start(r.id, 'refuse')}>
                            Decline
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {active && mode && (
                    <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
                      {mode === 'confirm' && (
                        <>
                          <label htmlFor={`when-${r.id}`} className="block text-sm font-semibold text-foreground">
                            When can someone let the inspector in?
                          </label>
                          <input id={`when-${r.id}`} type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setFormError('') }} className={inp} />
                          <label htmlFor={`note-${r.id}`} className="block text-sm font-semibold text-foreground">
                            Access instructions (optional)
                          </label>
                          <textarea
                            id={`note-${r.id}`}
                            rows={3}
                            maxLength={500}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="For example: ask for the caretaker at the gate."
                            className={inp}
                          />
                        </>
                      )}
                      {(mode === 'cancel' || mode === 'refuse') && (
                        <>
                          <label htmlFor={`reason-${r.id}`} className="block text-sm font-semibold text-foreground">
                            {mode === 'cancel' ? 'Why are you cancelling?' : 'Why can access not be given?'}
                          </label>
                          <textarea
                            id={`reason-${r.id}`}
                            rows={3}
                            maxLength={REASON_MAX}
                            value={reason}
                            onChange={(e) => { setReason(e.target.value); setFormError('') }}
                            className={inp}
                          />
                          {mode === 'refuse' && (
                            <p className="text-xs text-muted-foreground">EboHomes keeps your reason on record. The tenant is not shown your words.</p>
                          )}
                        </>
                      )}

                      {formError && (
                        <p role="alert" className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-900">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                          {formError}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          className={btnP}
                          onClick={() => (mode === 'cancel' ? submitCancel(r.id) : mode === 'confirm' ? submitConfirm(r.id) : submitRefuse(r.id))}
                        >
                          {busy ? 'Saving…' : mode === 'cancel' ? 'Cancel request' : mode === 'confirm' ? 'Allow access' : 'Decline access'}
                        </button>
                        <button type="button" disabled={busy} className={btnS} onClick={close}>
                          {mode === 'cancel' ? 'Keep request' : 'Back'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
                                                         }
