'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

export default function AdminApplicationsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [listings, setListings] = useState<Record<string, { title: string; status: string }>>({})
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
    const listingIds = Array.from(new Set(list.map((a) => a.listing_id)))
    if (listingIds.length > 0) {
      const { data: ls } = await supabase.from('listings').select('id, title, status').in('id', listingIds)
      setListings(Object.fromEntries((ls ?? []).map((l: any) => [l.id, { title: l.title, status: l.status }])))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Application review</h1>
      <p className="text-sm text-muted-foreground mb-4">
        EboHomes makes every final decision. Landlords can only add a recommendation. Approving does not create a tenancy and does not mean any payment was made.
      </p>

      <div className="flex gap-2 mb-4 overflow-x-auto border-b border-border">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === key ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}
          >
            {label} ({count(key)})
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3 mb-3">{error}</p>}
      {notice && <p className="text-sm text-primary bg-primary/10 rounded-md p-3 mb-3">{notice}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nothing in this list.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => {
            const listing = listings[a.listing_id]
            const open = a.status === 'pending' || a.status === 'info_requested'
            return (
              <div key={a.id} className="bg-card border border-border rounded-lg p-4 text-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{a.case_ref ?? '—'} · {listing?.title ?? 'Listing'}</p>
                    <p className="text-xs text-muted-foreground">
                      Property status: {listing?.status ?? 'unknown'} · Applied {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tenant: {names[a.tenant_id] ?? '—'} · Landlord: {names[a.landlord_id] ?? '—'}
                </p>

                {a.message && <p className="bg-secondary rounded-md p-2">{a.message}</p>}

                {a.application_data && typeof a.application_data === 'object' && Object.keys(a.application_data).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-primary">Application details</summary>
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(a.application_data).map(([k, v]) => (
                        <p key={k}>
                          <span className="text-muted-foreground">{k.replace(/_/g, ' ')}:</span>{' '}
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </p>
                      ))}
                    </div>
                  </details>
                )}

                {a.landlord_recommendation && (
                  <p className="rounded-md border border-border p-2">
                    <span className="font-medium">{RECOMMENDATION[a.landlord_recommendation] ?? a.landlord_recommendation}.</span>
                    {a.landlord_recommendation_note ? ` ${a.landlord_recommendation_note}` : ''}
                  </p>
                )}

                {a.info_request && (a.status === 'info_requested' || a.tenant_reply) && (
                  <p className="text-xs"><span className="font-medium">Question sent:</span> {a.info_request}</p>
                )}
                {a.tenant_reply && (
                  <p className="text-xs bg-primary/5 border border-primary/20 rounded-md p-2">
                    <span className="font-medium">Tenant replied:</span> {a.tenant_reply}
                  </p>
                )}

                {(a.status === 'approved' || a.status === 'rejected') && (
                  <p className="text-xs text-muted-foreground">
                    {a.decided_by
                      ? `Decided by ${names[a.decided_by] ?? 'EboHomes staff'}${a.decided_at ? ` on ${new Date(a.decided_at).toLocaleDateString()}` : ''}.`
                      : 'Decided by the landlord before EboHomes review began.'}
                    {a.decision_note ? ` Note: ${a.decision_note}` : ''}
                  </p>
                )}
                {a.status === 'approved' && (
                  <p className="text-xs text-muted-foreground">
                    {a.tenant_interest_at ? `Tenant confirmed they want to proceed on ${new Date(a.tenant_interest_at).toLocaleDateString()}.` : 'Tenant has not yet confirmed they want to proceed.'}
                  </p>
                )}

                {open && (
                  <div className="pt-2 space-y-2">
                    <textarea
                      rows={2}
                      value={notes[a.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                      placeholder="Question for the tenant, or reason / note for the decision"
                      maxLength={600}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      {a.status === 'pending' && (
                        <button
                          onClick={() => decide(a, 'approve')}
                          disabled={busyId !== null}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-60"
                        >
                          {busyId === a.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                        </button>
                      )}
                      {a.status === 'pending' && (
                        <button
                          onClick={() => decide(a, 'request_info')}
                          disabled={busyId !== null}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-60"
                        >
                          <HelpCircle size={14} /> Ask tenant a question
                        </button>
                      )}
                      <button
                        onClick={() => decide(a, 'reject')}
                        disabled={busyId !== null}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-destructive text-destructive text-xs disabled:opacity-60"
                      >
                        <XCircle size={14} /> Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}