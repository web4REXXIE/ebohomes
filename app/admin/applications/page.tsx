'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, HelpCircle, Clock, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { ApplicantFacts } from '@/components/application-ui'
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

const TABS = [
  ['pending', 'Needs review'],
  ['info_requested', 'Waiting for tenant'],
  ['approved', 'Approved'],
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
  rejected: { label: 'Declined', cls: 'border-red-300 bg-red-50 text-red-900', icon: XCircle },
  withdrawn: { label: 'Withdrawn', cls: 'border-slate-300 bg-slate-100 text-slate-800', icon: Undo2 },
}

const btnBase =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold disabled:opacity-60'

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
    if (action === 'request_info' && !note) {
      setError('Write the question for the tenant first.')
      return
    }
    if (action === 'reject' && !note) {
      setError('Write a short reason for the tenant first.')
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
      p_note: note === '' ? null : note,
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
        EboHomes makes every final decision. Landlords can only add a recommendation. Approving does not create a tenancy and does not mean any payment was made.
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

                {(a.status === 'approved' || a.status === 'rejected') && (
                  <p className="text-xs text-muted-foreground">
                    {a.decided_by
                      ? `Decided by ${names[a.decided_by] ?? 'EboHomes staff'}${a.decided_at ? ` on ${fmtDate(a.decided_at)}` : ''}.`
                      : 'Decided by the landlord before EboHomes review began.'}
                    {a.decision_note ? ` Note: ${a.decision_note}` : ''}
                  </p>
                )}
                {a.status === 'approved' && (
                  <p className="text-xs text-muted-foreground">
                    {a.tenant_interest_at
                      ? `Tenant confirmed they want to proceed on ${fmtDate(a.tenant_interest_at)}.`
                      : 'Tenant has not yet confirmed they want to proceed.'}
                  </p>
                )}

                {open && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <label className="block text-xs font-semibold text-foreground">
                      Note for the tenant
                      <textarea
                        rows={2}
                        value={notes[a.id] ?? ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                        placeholder="Question for the tenant, or reason / note for the decision"
                        maxLength={600}
                        className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm font-normal"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      A note is required to ask a question or to decline. It is optional when approving.
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
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}