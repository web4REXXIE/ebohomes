'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, CheckCircle2, XCircle, HelpCircle, Clock, Undo2, BadgeCheck, UserX, History as HistoryIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { ApplicantFacts } from '@/components/application-ui'
import { ApplicationDocuments } from '@/components/application-documents'
import { fmtDate } from '@/lib/case-status'

type App = {
  id: string
  case_ref: string | null
  status: string
  message: string | null
  created_at: string
  listing_id: string
  tenant_id: string
  landlord_id: string
  application_data: any
  info_request: string | null
  tenant_reply: string | null
  decision_note: string | null
  decided_at: string | null
  decided_by: string | null
  landlord_recommendation: string | null
  landlord_recommendation_note: string | null
  landlord_recommended_at: string | null
  tenant_interest_at: string | null
}

type Ev = {
  id: string
  event: string
  from_status: string | null
  to_status: string | null
  actor_role: string | null
  note: string | null
  created_at: string
}

const MIN_NOTE = 5
const MIN_REASON = 10

const TABS = [
  ['pending', 'Needs review'],
  ['info_requested', 'Waiting for tenant'],
  ['approved', 'Approved'],
  ['accepted', 'Accepted'],
  ['not_selected', 'Not selected'],
  ['rejected', 'Declined'],
  ['withdrawn', 'Withdrawn'],
] as const

const RECOMMENDATION: Record<string, string> = {
  recommend: 'Landlord recommends this applicant',
  neutral: 'Landlord has no preference',
  not_recommend: 'Landlord does not recommend this applicant',
}

const REC_TONE: Record<string, string> = {
  recommend: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  neutral: 'border-slate-300 bg-slate-100 text-slate-800',
  not_recommend: 'border-amber-300 bg-amber-50 text-amber-900',
}

const BADGES: Record<string, { label: string; cls: string; icon: any }> = {
  pending: { label: 'Needs review', cls: 'border-amber-300 bg-amber-50 text-amber-900', icon: Clock },
  info_requested: { label: 'Waiting for tenant', cls: 'border-amber-300 bg-amber-50 text-amber-900', icon: HelpCircle },
  approved: { label: 'Approved', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  accepted: { label: 'Accepted', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900', icon: BadgeCheck },
  not_selected: { label: 'Not selected', cls: 'border-slate-300 bg-slate-100 text-slate-800', icon: UserX },
  rejected: { label: 'Declined', cls: 'border-red-300 bg-red-50 text-red-900', icon: XCircle },
  withdrawn: { label: 'Withdrawn', cls: 'border-slate-300 bg-slate-100 text-slate-800', icon: Undo2 },
}

const CORRECTIONS: Record<string, [string, string][]> = {
  approved: [['pending', 'Send back for review'], ['rejected', 'Decline instead']],
  rejected: [['pending', 'Reopen for review']],
  not_selected: [['pending', 'Reopen for review'], ['rejected', 'Decline instead']],
}

const btnBase =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold disabled:opacity-60'

const lab = (s: string | null) => (s && BADGES[s]?.label) || s || '—'

function eventText(e: Ev) {
  if (e.event === 'submitted') return 'Application submitted'
  if (e.event === 'admin_override') return `Corrected by staff: ${lab(e.from_status)} to ${lab(e.to_status)}`
  if (e.event === 'document_added') return 'Document added'
  if (e.event === 'document_removed') return 'Document removed'
  return `${lab(e.from_status)} to ${lab(e.to_status)}`
}

function HistoryList({ appId }: { appId: string }) {
  const [rows, setRows] = useState<Ev[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('application_events')
      .select('id, event, from_status, to_status, actor_role, note, created_at')
      .eq('application_id', appId)
      .order('created_at', { ascending: true })
    if (error) {
      setFailed(true)
      return
    }
    setRows((data ?? []) as Ev[])
  }, [appId])

  return (
    <details
      className="text-xs"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && rows === null && !failed) void load()
      }}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 py-3 font-semibold text-primary">
        <HistoryIcon size={13} aria-hidden /> History
      </summary>
      {failed ? (
        <p className="pb-2 text-muted-foreground">History is not available yet.</p>
      ) : rows === null ? (
        <p className="pb-2 text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="pb-2 text-muted-foreground">No history recorded.</p>
      ) : (
        <ol className="space-y-1.5 pb-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md bg-secondary/60 px-3 py-2">
              <span className="font-semibold text-foreground">{eventText(r)}</span>
              <span className="block text-muted-foreground">
                {new Date(r.created_at).toLocaleString('en-NG')}
                {r.actor_role ? ` · ${r.actor_role}` : ''}
              </span>
              {r.note && <span className="block break-words text-foreground">{r.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

function CorrectPanel({
  app,
  onDone,
  onError,
}: {
  app: App
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const options = CORRECTIONS[app.status] ?? []
  const [target, setTarget] = useState(options[0]?.[0] ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (options.length === 0) return null

  const submit = async () => {
    if (busy) return
    if (reason.trim().length < MIN_REASON) {
      onError(`Write a clear reason for the correction (at least ${MIN_REASON} characters).`)
      return
    }
    if (!window.confirm('Correct this decision? The reason is recorded in the history.')) return
    setBusy(true)
    const { error } = await supabase.rpc('eb_admin_override_application', {
      p_application: app.id,
      p_new_status: target,
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) {
      onError(error.message)
      return
    }
    setReason('')
    onDone('Decision corrected and recorded.')
  }

  return (
    <details className="text-xs">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-muted-foreground">Correct this decision</summary>
      <div className="space-y-2 rounded-md border border-border p-3">
        <label className="block font-semibold text-foreground">
          Change to
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-md border border-border bg-input px-3 py-2 text-sm font-normal"
          >
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-semibold text-foreground">
          Reason (recorded)
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={600}
            className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm font-normal"
          />
        </label>
        <p className="text-muted-foreground">
          This does not work once a tenancy exists for the application. Use the tenancy process instead.
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className={`${btnBase} border border-border`}
        >
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />} Save correction
        </button>
      </div>
    </details>
  )
}

export default function AdminApplicationsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('applications')
      .select('id, case_ref, status, message, created_at, listing_id, tenant_id, landlord_id, application_data, info_request, tenant_reply, decision_note, decided_at, decided_by, landlord_recommendation, landlord_recommendation_note, landlord_recommended_at, tenant_interest_at')
      .order('created_at', { ascending: true })
      .limit(500)
    if (e) {
      setError(e.message)
      setLoading(false)
      return
    }
    const list = (data ?? []) as App[]
    setApps(list)

    const peopleIds = Array.from(new Set(list.flatMap((a) => [a.tenant_id, a.landlord_id, a.decided_by]).filter(Boolean) as string[]))
    if (peopleIds.length > 0) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', peopleIds)
      setNames(Object.fromEntries((people ?? []).map((p: any) => [p.id, p.full_name || 'Unnamed'])))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { listings, inspected } = usePropertyData(useMemo(() => apps.map((a) => a.listing_id), [apps]))

  const decide = async (app: App, action: 'request_info' | 'approve' | 'reject') => {
    if (busyId) return
    const note = (notes[app.id] ?? '').trim()
    if (note.length < MIN_NOTE) {
      setNotice(null)
      setError(
        action === 'request_info'
          ? 'Write the question for the tenant first.'
          : action === 'reject'
            ? 'Write a short reason for the tenant first.'
            : `Write the reason for approving (at least ${MIN_NOTE} characters). Every decision records why.`
      )
      return
    }
    const confirmText =
      action === 'approve'
        ? 'Approve this application? This does not create a tenancy or record any payment.'
        : action === 'reject'
          ? 'Decline this application? The tenant will be told.'
          : 'Send this question to the tenant?'
    if (!window.confirm(confirmText)) return

    setBusyId(app.id)
    setError(null)
    setNotice(null)
    const { error: e } = await supabase.rpc('admin_decide_application', {
      p_application: app.id,
      p_action: action,
      p_note: note,
    })
    if (e) {
      setError(e.message)
    } else {
      setNotice(action === 'approve' ? 'Application approved.' : action === 'reject' ? 'Application declined.' : 'Question sent to the tenant.')
      setNotes((n) => ({ ...n, [app.id]: '' }))
      await load()
    }
    setBusyId(null)
  }

  const visible = apps.filter((a) => a.status === tab)
  const count = (s: string) => apps.filter((a) => a.status === s).length

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} aria-label="Loading applications" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Application review</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        EboHomes makes every final decision. Landlords can only add a recommendation. Approving does not create a tenancy and does not mean any payment was made. Every decision needs a reason and is recorded in the history.
      </p>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Application status">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-sm ${
              tab === key ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label} ({count(key)})
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          {notice}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nothing in this list.</p>
      ) : (
        <div className="space-y-4">
          {visible.map((a) => {
            const open = a.status === 'pending' || a.status === 'info_requested'
            const b = BADGES[a.status] ?? BADGES.pending
            const Icon = b.icon
            const hasData =
              a.application_data && typeof a.application_data === 'object' && Object.keys(a.application_data).length > 0
            return (
              <section key={a.id} className="space-y-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${b.cls}`}>
                    <Icon size={12} aria-hidden /> {b.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.case_ref ? `${a.case_ref} · ` : ''}Applied {fmtDate(a.created_at)}
                  </span>
                </div>

                <PropertySummary compact listing={listings[a.listing_id]} inspected={inspected.has(a.listing_id)} />

                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3">
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Tenant</dt>
                    <dd className="truncate font-medium text-foreground">{names[a.tenant_id] ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Landlord</dt>
                    <dd className="truncate font-medium text-foreground">{names[a.landlord_id] ?? '—'}</dd>
                  </div>
                </dl>

                {a.landlord_recommendation ? (
                  <p
                    className={`rounded-md border p-3 ${
                      REC_TONE[a.landlord_recommendation] ?? 'border-slate-300 bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="font-semibold">
                      {RECOMMENDATION[a.landlord_recommendation] ?? a.landlord_recommendation}.
                    </span>
                    {a.landlord_recommendation_note ? ` ${a.landlord_recommendation_note}` : ''}
                    {a.landlord_recommended_at && (
                      <span className="mt-1 block text-xs opacity-80">Added {fmtDate(a.landlord_recommended_at)}</span>
                    )}
                  </p>
                ) : (
                  open && <p className="text-xs text-muted-foreground">The landlord has not added a recommendation.</p>
                )}

                {a.message && <p className="rounded-md bg-secondary p-3">{a.message}</p>}

                <ApplicantFacts data={a.application_data} />

                {hasData && (
                  <details className="text-xs">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">All submitted details</summary>
                    <div className="space-y-0.5 pb-1">
                      {Object.entries(a.application_data).map(([k, v]) => (
                        <p key={k} className="break-words">
                          <span className="text-muted-foreground">{k.replace(/_/g, ' ')}:</span>{' '}
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </p>
                      ))}
                    </div>
                  </details>
                )}

                <ApplicationDocuments applicationId={a.id} mode="admin" />

                {a.info_request && (a.status === 'info_requested' || a.tenant_reply) && (
                  <p className="text-xs">
                    <span className="font-semibold">Question sent:</span> {a.info_request}
                  </p>
                )}
                {a.tenant_reply && (
                  <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
                    <span className="font-semibold">Tenant replied:</span> {a.tenant_reply}
                  </p>
                )}

                {(a.status === 'approved' || a.status === 'rejected' || a.status === 'not_selected' || a.status === 'accepted') && (
                  <p className="text-xs text-muted-foreground">
                    {a.decided_by
                      ? `Decided by ${names[a.decided_by] ?? 'EboHomes staff'}${a.decided_at ? ` on ${fmtDate(a.decided_at)}` : ''}.`
                      : 'Decided by the landlord before EboHomes review began.'}
                    {a.decision_note ? ` Reason: ${a.decision_note}` : ''}
                  </p>
                )}
                {a.status === 'approved' && (
                  <p className="text-xs text-muted-foreground">
                    {a.tenant_interest_at
                      ? `Tenant confirmed they want to proceed on ${fmtDate(a.tenant_interest_at)}.`
                      : 'Tenant has not yet confirmed they want to proceed.'}
                  </p>
                )}

                <HistoryList appId={a.id} />

                {open && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <label className="block text-xs font-semibold text-foreground">
                      Reason or question
                      <textarea
                        rows={2}
                        value={notes[a.id] ?? ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                        placeholder="Your question for the tenant, or the reason for your decision"
                        maxLength={600}
                        className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm font-normal"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      A reason is required for every decision (approve, decline or ask a question). The tenant can see it. It is also saved in the history.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {a.status === 'pending' && (
                        <button
                          onClick={() => decide(a, 'approve')}
                          disabled={busyId !== null}
                          className={`${btnBase} bg-primary text-primary-foreground`}
                        >
                          {busyId === a.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CheckCircle2 size={14} aria-hidden />} Approve
                        </button>
                      )}
                      {a.status === 'pending' && (
                        <button
                          onClick={() => decide(a, 'request_info')}
                          disabled={busyId !== null}
                          className={`${btnBase} border border-border`}
                        >
                          <HelpCircle size={14} aria-hidden /> Ask tenant a question
                        </button>
                      )}
                      <button
                        onClick={() => decide(a, 'reject')}
                        disabled={busyId !== null}
                        className={`${btnBase} border border-red-300 text-red-800`}
                      >
                        <XCircle size={14} aria-hidden /> Decline
                      </button>
                    </div>
                  </div>
                )}

                <CorrectPanel
                  key={`${a.id}-${a.status}`}
                  app={a}
                  onError={(m) => {
                    setNotice(null)
                    setError(m)
                  }}
                  onDone={async (m) => {
                    setError(null)
                    setNotice(m)
                    await load()
                  }}
                />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
                }
