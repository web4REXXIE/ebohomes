'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, XCircle, FileText, Loader2, Home, Undo2, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CreateTenancyModal } from '@/components/create-tenancy-modal'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { tenancyPath, fmtDate, naira } from '@/lib/case-status'

type ApplicationRow = {
  id: string
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
  tenant_interest_at: string | null
  tenant_inspected: boolean | null
  case_ref: string | null
  decided_by: string | null
  landlord_recommendation: string | null
  landlord_recommendation_note: string | null
  listing?: { id: string; title: string; location_text: string; price_monthly: number; photos: string[] }
  tenant?: { full_name: string; phone: string }
}

type TenancyRow = {
  id: string
  application_id: string
  status: string
  rent_amount: number
  rent_period: string
  start_date: string
}

const TABS = ['pending', 'info_requested', 'approved', 'rejected', 'withdrawn'] as const
const TAB_LABELS: Record<string, string> = {
  pending: 'With EboHomes',
  info_requested: 'Waiting for tenant',
  approved: 'Approved',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  recommend: 'I recommend this applicant',
  neutral: 'No preference',
  not_recommend: 'I do not recommend this applicant',
}

const BADGES: Record<string, { label: string; cls: string; icon: any }> = {
  approved: { label: 'Approved', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  rejected: { label: 'Declined', cls: 'border-red-300 bg-red-50 text-red-900', icon: XCircle },
  withdrawn: { label: 'Withdrawn', cls: 'border-slate-300 bg-slate-100 text-slate-800', icon: Undo2 },
  info_requested: { label: 'Waiting for tenant', cls: 'border-amber-300 bg-amber-50 text-amber-900', icon: Clock },
  pending: { label: 'With EboHomes', cls: 'border-slate-300 bg-slate-100 text-slate-800', icon: Clock },
}

const field = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm'

export default function LandlordApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tenanciesByApp, setTenanciesByApp] = useState<Record<string, TenancyRow>>({})
  const [tenancyModalApp, setTenancyModalApp] = useState<ApplicationRow | null>(null)
  const [recChoice, setRecChoice] = useState<Record<string, string>>({})
  const [recNote, setRecNote] = useState<Record<string, string>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setLoadError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: apps, error: appsError } = await supabase
      .from('applications')
      .select('id, status, message, created_at, listing_id, tenant_id, landlord_id, application_data, info_request, tenant_reply, decision_note, tenant_interest_at, tenant_inspected, case_ref, decided_by, landlord_recommendation, landlord_recommendation_note')
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false })

    if (appsError) {
      setLoadError('Could not load applications. Please refresh and try again.')
      setLoading(false)
      return
    }

    if (!apps || apps.length === 0) {
      setApplications([])
      setLoading(false)
      return
    }

    const listingIds = [...new Set(apps.map((a) => a.listing_id))]
    const tenantIds = [...new Set(apps.map((a) => a.tenant_id))]

    const [{ data: listings }, { data: tenants }] = await Promise.all([
      supabase.from('listings').select('id, title, location_text, price_monthly, photos').in('id', listingIds),
      supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds),
    ])

    const merged = apps.map((a) => ({
      ...a,
      listing: listings?.find((l) => l.id === a.listing_id),
      tenant: tenants?.find((t) => t.id === a.tenant_id),
    }))

    setApplications(merged)

    const approvedIds = merged.filter((a) => a.status === 'approved').map((a) => a.id)
    if (approvedIds.length > 0) {
      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('id, application_id, status, rent_amount, rent_period, start_date')
        .in('application_id', approvedIds)

      const map: Record<string, TenancyRow> = {}
      tenancies?.forEach((t) => {
        map[t.application_id] = t
      })
      setTenanciesByApp(map)
    } else {
      setTenanciesByApp({})
    }

    setLoading(false)
  }

  const { listings: summaries, inspected } = usePropertyData(
    useMemo(() => applications.map((a) => a.listing_id), [applications]),
  )

  const setError = (id: string, message: string) => setActionErrors((prev) => ({ ...prev, [id]: message }))

  // Landlords can only add a recommendation. EboHomes records every decision.
  const handleRecommend = async (app: ApplicationRow) => {
    const choice = recChoice[app.id] ?? app.landlord_recommendation ?? ''
    if (!choice || busyId) return
    setBusyId(app.id)
    setError(app.id, '')
    const note = (recNote[app.id] ?? app.landlord_recommendation_note ?? '').trim()
    const { data, error } = await supabase
      .from('applications')
      .update({ landlord_recommendation: choice, landlord_recommendation_note: note === '' ? null : note })
      .eq('id', app.id)
      .in('status', ['pending', 'info_requested'])
      .select('id')

    if (error) {
      setError(app.id, error.message)
    } else if (!data || data.length === 0) {
      setError(app.id, 'This application has already been decided. The page has been refreshed.')
      await load(true)
    } else {
      setRecChoice((prev) => ({ ...prev, [app.id]: '' }))
      setRecNote((prev) => ({ ...prev, [app.id]: '' }))
      await load(true)
    }
    setBusyId(null)
  }

  const needsLandlord = (a: ApplicationRow) =>
    a.status === 'approved' && !!a.tenant_interest_at && !tenanciesByApp[a.id]

  const countFor = (tab: string) => applications.filter((a) => a.status === tab).length
  const filtered = applications.filter((a) => a.status === activeTab)
  const actionCount = applications.filter(needsLandlord).length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Applications</h1>
      <p className="mb-2 text-sm text-muted-foreground">
        Tenants who applied to your properties. EboHomes reviews every application and makes the final decision. You can add a recommendation to help.
      </p>
      {!loading && actionCount > 0 && (
        <p className="mb-4 text-sm font-semibold text-amber-900">
          {actionCount} approved {actionCount === 1 ? 'applicant is' : 'applicants are'} ready for you to create a tenancy.
        </p>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Application status">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[tab]}
            {!loading && <span className="ml-1 text-xs">({countFor(tab)})</span>}
          </button>
        ))}
      </div>

      {loadError && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading applications">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="h-5 w-32 rounded-full bg-secondary" />
              <div className="flex gap-3">
                <div className="h-16 w-20 rounded-lg bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-secondary" />
                  <div className="h-3 w-1/2 rounded bg-secondary" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center">
          <FileText size={30} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No {TAB_LABELS[activeTab].toLowerCase()} applications.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((app) => {
            const b = BADGES[app.status] ?? BADGES.pending
            const Icon = b.icon
            const tenancy = tenanciesByApp[app.id]
            const mine = needsLandlord(app)
            return (
              <section
                key={app.id}
                className={`overflow-hidden rounded-xl border bg-card ${mine ? 'border-amber-300' : 'border-border'}`}
              >
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${b.cls}`}>
                      <Icon size={12} aria-hidden /> {b.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {app.case_ref ? `${app.case_ref} · ` : ''}Applied {fmtDate(app.created_at)}
                    </span>
                  </div>

                  <PropertySummary compact listing={summaries[app.listing_id]} inspected={inspected.has(app.listing_id)} />

                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Applicant</dt>
                      <dd className="truncate font-medium text-foreground">{app.tenant?.full_name ?? 'Tenant'}</dd>
                    </div>
                    {app.application_data?.move_in_date && (
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Preferred move-in</dt>
                        <dd className="font-medium text-foreground">{app.application_data.move_in_date}</dd>
                      </div>
                    )}
                    {app.status === 'approved' && app.tenant?.phone && (
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</dt>
                        <dd className="font-medium text-foreground">{app.tenant.phone}</dd>
                      </div>
                    )}
                  </dl>

                  {app.message && (
                    <p className="rounded-md bg-secondary p-3 text-sm text-foreground">{app.message}</p>
                  )}

                  {app.tenant_reply && app.status !== 'info_requested' && (
                    <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                      <span className="font-semibold">Tenant replied:</span> {app.tenant_reply}
                    </p>
                  )}

                  {app.status === 'info_requested' && app.info_request && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      <span className="font-semibold">EboHomes asked:</span> {app.info_request}
                    </p>
                  )}

                  {app.status === 'rejected' && app.decision_note && (
                    <p className="rounded-md bg-secondary p-3 text-sm">
                      <span className="font-semibold">EboHomes&apos; note:</span> {app.decision_note}
                    </p>
                  )}

                  {(app.status === 'pending' || app.status === 'info_requested') && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">
                        {app.status === 'pending'
                          ? 'EboHomes is reviewing this application and will make the final decision.'
                          : 'EboHomes asked the tenant a question and is waiting for the answer.'}
                      </p>
                      {app.landlord_recommendation && (
                        <p className="rounded-md bg-secondary p-2 text-xs">
                          <span className="font-semibold">Your recommendation:</span>{' '}
                          {RECOMMENDATION_LABELS[app.landlord_recommendation] ?? app.landlord_recommendation}
                          {app.landlord_recommendation_note ? `: ${app.landlord_recommendation_note}` : ''}
                        </p>
                      )}
                      <select
                        aria-label="Your recommendation for EboHomes"
                        value={recChoice[app.id] ?? app.landlord_recommendation ?? ''}
                        onChange={(e) => setRecChoice((prev) => ({ ...prev, [app.id]: e.target.value }))}
                        className={field}
                      >
                        <option value="">Add a recommendation for EboHomes…</option>
                        <option value="recommend">{RECOMMENDATION_LABELS.recommend}</option>
                        <option value="neutral">{RECOMMENDATION_LABELS.neutral}</option>
                        <option value="not_recommend">{RECOMMENDATION_LABELS.not_recommend}</option>
                      </select>
                      <input
                        aria-label="Optional note for EboHomes"
                        value={recNote[app.id] ?? app.landlord_recommendation_note ?? ''}
                        onChange={(e) => setRecNote((prev) => ({ ...prev, [app.id]: e.target.value }))}
                        placeholder="Optional note for EboHomes"
                        maxLength={400}
                        className={field}
                      />
                      <button
                        onClick={() => handleRecommend(app)}
                        disabled={busyId === app.id || !(recChoice[app.id] ?? app.landlord_recommendation)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {busyId === app.id && <Loader2 size={14} className="animate-spin" aria-hidden />}
                        Send recommendation
                      </button>
                      {actionErrors[app.id] && (
                        <p role="alert" className="text-xs font-medium text-red-800">{actionErrors[app.id]}</p>
                      )}
                    </div>
                  )}

                  {app.status === 'approved' && (
                    <div className="space-y-1 rounded-lg bg-secondary/60 p-3 text-sm">
                      {mine && <p className="text-xs font-semibold text-amber-900">Your action</p>}
                      {app.tenant_inspected && (
                        <p className="font-medium text-primary">Viewing has been marked as completed.</p>
                      )}
                      {app.tenant_interest_at ? (
                        <p className="font-medium text-primary">
                          Tenant confirmed they want to proceed on {fmtDate(app.tenant_interest_at)}.
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Waiting for the tenant to confirm they want to proceed. Approval is not a tenancy and does not record any payment.
                        </p>
                      )}
                    </div>
                  )}

                  {app.status === 'approved' &&
                    (tenancy ? (
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                        <p className="font-semibold capitalize text-primary">Tenancy: {tenancy.status}</p>
                        <p className="text-muted-foreground">
                          {naira(tenancy.rent_amount)} / {tenancy.rent_period} · from {fmtDate(tenancy.start_date)}
                        </p>
                        <Link
                          href={tenancyPath('landlord', tenancy.id)}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold hover:bg-secondary"
                        >
                          Open tenancy <ArrowRight size={14} aria-hidden />
                        </Link>
                      </div>
                    ) : app.tenant_interest_at ? (
                      <button
                        onClick={() => setTenancyModalApp(app)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        <Home size={14} aria-hidden /> Create tenancy
                      </button>
                    ) : null)}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {tenancyModalApp && (
        <CreateTenancyModal
          application={tenancyModalApp}
          listing={tenancyModalApp.listing!}
          landlordId={tenancyModalApp.landlord_id}
          onClose={() => setTenancyModalApp(null)}
          onCreated={(tenancy) => {
            setTenanciesByApp((prev) => ({ ...prev, [tenancy.application_id]: tenancy }))
            setTenancyModalApp(null)
          }}
        />
      )}
    </div>
  )
}