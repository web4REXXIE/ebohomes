'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, XCircle, FileText, Loader2, Home } from 'lucide-react'
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

const TABS = ['pending', 'approved', 'rejected'] as const

export default function LandlordApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tenanciesByApp, setTenanciesByApp] = useState<Record<string, TenancyRow>>({})
  const [tenancyModalApp, setTenancyModalApp] = useState<ApplicationRow | null>(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: apps } = await supabase
      .from('applications')
      .select('id, status, message, created_at, listing_id, tenant_id, landlord_id, application_data')
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false })

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
    }

    setLoading(false)
  }

  const handleDecision = async (id: string, newStatus: 'approved' | 'rejected') => {
    setBusyId(id)
    const { error } = await supabase
      .from('applications')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)))
    }
    setBusyId(null)
  }

  const filtered = applications.filter((a) => a.status === activeTab)
  const pendingCount = applications.filter((a) => a.status === 'pending').length

  const statusBadge = (status: string) => {
    if (status === 'approved')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
          <CheckCircle2 size={12} /> Approved
        </span>
      )
    if (status === 'rejected')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-full">
          <XCircle size={12} /> Rejected
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

      <div className="flex gap-2 mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'pending' && pendingCount > 0 && <span className="ml-1 text-xs">({pendingCount})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-28 bg-secondary rounded-lg" />
          <div className="h-28 bg-secondary rounded-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No {activeTab} applications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <div key={app.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start gap-4">
                <img
                  src={app.listing?.photos?.[0] || '/placeholder.jpg'}
                  alt={app.listing?.title}
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
                    {app.tenant?.phone && <span className="text-muted-foreground"> · {app.tenant.phone}</span>}
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

                  {app.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleDecision(app.id, 'approved')}
                        disabled={busyId === app.id}
                        className="flex items-center gap-1 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-md px-3 py-1.5"
                      >
                        {busyId === app.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecision(app.id, 'rejected')}
                        disabled={busyId === app.id}
                        className="flex items-center gap-1 text-sm font-semibold text-destructive border border-destructive hover:bg-destructive hover:text-white disabled:opacity-50 rounded-md px-3 py-1.5"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}

                  {app.status === 'approved' && (
                    tenanciesByApp[app.id] ? (
                      <div className="mt-3 bg-primary/5 border border-primary/20 rounded-md p-2 text-xs">
                        <p className="font-semibold text-primary capitalize">Tenancy: {tenanciesByApp[app.id].status}</p>
                        <p className="text-muted-foreground mt-0.5">
                          ₦{tenanciesByApp[app.id].rent_amount?.toLocaleString()} / {tenanciesByApp[app.id].rent_period} · from {tenanciesByApp[app.id].start_date}
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => setTenancyModalApp(app)}
                        className="flex items-center gap-1 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 mt-3"
                      >
                        <Home size={14} /> Create Tenancy
                      </button>
                    )
                  )}
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