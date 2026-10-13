'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, XCircle, FileText, Loader2, Home, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CreateTenancyModal } from '@/components/create-tenancy-modal'

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
  listing?: { title: string; location_text: string; price_monthly: number; photos: string[] }
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
  pending: 'Pending',
  info_requested: 'Waiting for tenant',
  approved: 'Accepted',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

export default function LandlordApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tenanciesByApp, setTenanciesByApp] = useState<Record<string, TenancyRow>>({})
  const [tenancyModalApp, setTenancyModalApp] = useState<ApplicationRow | null>(null)
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null)
  const [infoText, setInfoText] = useState('')
  const [declineNotes, setDeclineNotes] = useState<Record<string, string>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
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
      .select('id, status, message, created_at, listing_id, tenant_id, landlord_id, application_data, info_request, tenant_reply, decision_note, tenant_interest_at, tenant_inspected')
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

  const setError = (id: string, message: string) =>
    setActionErrors((prev) => ({ ...prev, [id]: message }))

  const handleDecision = async (
    id: string,
    newStatus: 'approved' | 'rejected' | 'info_requested',
    extra: Record<string, any> = {}
  ) => {
    if (newStatus === 'rejected' && !window.confirm('Decline this application? This cannot be undone.')) return
    if (newStatus === 'approved' && !window.confirm('Accept this application? This does not create a tenancy or record any payment.')) return

    setBusyId(id)
    setError(id, '')
    const patch = { status: newStatus, updated_at: new Date().toISOString(), ...extra }
    const { error } = await supabase.from('applications').update(patch).eq('id', id)

    if (error) {
      setError(id, error.message)
    } else {
      setInfoOpenId(null)
      setInfoText('')
      setDeclineNotes((prev) => ({ ...prev, [id]: '' }))
      await load(true)
    }
    setBusyId(null)
  }

  const filtered = applications.filter((a) => a.status === activeTab)
  const pendingCount = applications.filter((a) => a.status === 'pending').length

  const statusBadge = (status: string) => {
    if (status === 'approved')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
          <CheckCircle2 size={12} /> Accepted
        </span>
      )
    if (status === 'rejected')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-full">
          <XCircle size={12} /> Declined
        </span>
      )
    if (status === 'withdrawn')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-full">
          <Undo2 size={12} /> Withdrawn
        </span>
      )
    if (status === 'info_requested')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
          <Clock size={12} /> Waiting for tenant
        </span>
      )
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-full">
        <Clock size={12} /> Pending
      </span>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Applications</h1>
      <p className="text-sm text-muted-foreground mb-6">Review tenants who applied to your properties.</p>

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {TAB_LABELS[tab]}
            {tab === 'pending' && pendingCount > 0 && <span className="ml-1 text-xs">({pendingCount})</span>}
          </button>
        ))}
      </div>

      {loadError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3 mb-4">{loadError}</p>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-28 bg-secondary rounded-lg" />
          <div className="h-28 bg-secondary rounded-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No {TAB_LABELS[activeTab].toLowerCase()} applications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <div key={app.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start gap-4">
                <img
                  src={app.listing?.photos?.[0] || '/placeholder.jpg'}
                  alt={app.listing?.title ?? 'Listing'}
                  className="w-16 h-16 rounded-md object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{app.listing?.title ?? 'Listing'}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.listing?.location_text}</p>
                    </div>
                    {statusBadge(app.status)}
                  </div>

                  <div className="mt-2 text-sm text-foreground">
                    <span className="font-medium">{app.tenant?.full_name ?? 'Tenant'}</span>
                    {app.status === 'approved' && app.tenant?.phone && (
                      <span className="text-muted-foreground"> · {app.tenant.phone}</span>
                    )}
                  </div>

                  {app.application_data?.move_in_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Preferred move-in: {app.application_data.move_in_date}
                    </p>
                  )}

                  {app.message && (
                    <p className="text-sm text-muted-foreground mt-2 bg-secondary rounded-md p-2">{app.message}</p>
                  )}

                  <p className="text-xs text-muted-foreground mt-2">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>

                  {app.tenant_reply && app.status !== 'info_requested' && (
                    <p className="text-sm mt-2 bg-primary/5 border border-primary/20 rounded-md p-2">
                      <span className="font-medium">Tenant replied:</span> {app.tenant_reply}
                    </p>
                  )}

                  {app.status === 'info_requested' && app.info_request && (
                    <p className="text-sm mt-2 bg-amber-50 border border-amber-300 rounded-md p-2">
                      <span className="font-medium">You asked:</span> {app.info_request}
                    </p>
                  )}

                  {app.status === 'rejected' && app.decision_note && (
                    <p className="text-sm mt-2 bg-secondary rounded-md p-2">
                      <span className="font-medium">Your note:</span> {app.decision_note}
                    </p>
                  )}

                  {(app.status === 'pending' || app.status === 'info_requested') && (
                    <div className="mt-3 space-y-2">
                      {infoOpenId === app.id && (
                        <div className="space-y-2">
                          <textarea
                            rows={2}
                            value={infoText}
                            onChange={(e) => setInfoText(e.target.value)}
                            placeholder="What do you need to know? e.g. Where do you work? How many people will live here?"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                          />
                          <button
                            disabled={busyId === app.id || !infoText.trim()}
                            onClick={() => handleDecision(app.id, 'info_requested', { info_request: infoText.trim() })}
                            className="text-sm font-semibold text-primary-foreground bg-primary rounded-md px-3 py-1.5 disabled:opacity-50"
                          >
                            Send question
                          </button>
                        </div>
                      )}
                      <input
                        value={declineNotes[app.id] ?? ''}
                        onChange={(e) => setDeclineNotes((prev) => ({ ...prev, [app.id]: e.target.value }))}
                        placeholder="Optional note to the tenant if you decline"
                        className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleDecision(app.id, 'approved')}
                          disabled={busyId === app.id}
                          className="flex items-center gap-1 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-md px-3 py-1.5"
                        >
                          {busyId === app.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Accept
                        </button>
                        <button
                          onClick={() => {
                            setInfoText('')
                            setInfoOpenId(infoOpenId === app.id ? null : app.id)
                          }}
                          disabled={busyId === app.id}
                          className="text-sm font-semibold border border-border hover:bg-secondary rounded-md px-3 py-1.5"
                        >
                          Request more info
                        </button>
                        <button
                          onClick={() =>
                            handleDecision(app.id, 'rejected', { decision_note: (declineNotes[app.id] ?? '').trim() || null })
                          }
                          disabled={busyId === app.id}
                          className="flex items-center gap-1 text-sm font-semibold text-destructive border border-destructive hover:bg-destructive hover:text-white disabled:opacity-50 rounded-md px-3 py-1.5"
                        >
                          <XCircle size={14} /> Decline
                        </button>
                      </div>
                      {actionErrors[app.id] && <p className="text-xs text-destructive">{actionErrors[app.id]}</p>}
                    </div>
                  )}

                  {app.status === 'approved' && (
                    <div className="mt-2 space-y-1">
                      {app.tenant_inspected && (
                        <p className="text-xs font-medium text-primary">Viewing has been marked as completed.</p>
                      )}
                      {app.tenant_interest_at ? (
                        <p className="text-xs font-medium text-primary">
                          Tenant has confirmed they want to proceed ({new Date(app.tenant_interest_at).toLocaleDateString()}).
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Waiting for the tenant to confirm they want to proceed. Accepting an application is not a tenancy and does not record any payment.
                        </p>
                      )}
                    </div>
                  )}

                  {app.status === 'approved' &&
                    (tenanciesByApp[app.id] ? (
                      <div className="mt-3 bg-primary/5 border border-primary/20 rounded-md p-2 text-xs">
                        <p className="font-semibold text-primary capitalize">Tenancy: {tenanciesByApp[app.id].status}</p>
                        <p className="text-muted-foreground mt-0.5">
                          ₦{tenanciesByApp[app.id].rent_amount?.toLocaleString()} / {tenanciesByApp[app.id].rent_period} · from {tenanciesByApp[app.id].start_date}
                        </p>
                      </div>
                    ) : app.tenant_interest_at ? (
                      <button
                        onClick={() => setTenancyModalApp(app)}
                        className="flex items-center gap-1 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 mt-3"
                      >
                        <Home size={14} /> Create Tenancy
                      </button>
                    ) : null)}
                </div>
              </div>
            </div>
          ))}
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