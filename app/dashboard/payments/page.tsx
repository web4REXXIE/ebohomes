'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home as HomeIcon, Wallet, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { RecordPaymentModal } from '@/components/record-payment-modal'

type TenancyRow = {
  id: string
  rent_amount: number
  rent_period: string
  start_date: string
  status: string
  listing_id: string
  tenant_id: string
  listing?: { title: string; location_text: string; photos: string[] }
  tenant?: { full_name: string }
}

type PaymentRow = {
  id: string
  tenancy_id: string
  amount: number
  type: string
  payment_method: string | null
  status: string
  confirmed_at: string | null
}

export default function LandlordPaymentsPage() {
  const router = useRouter()
  const [tenancies, setTenancies] = useState<TenancyRow[]>([])
  const [paymentsByTenancy, setPaymentsByTenancy] = useState<Record<string, PaymentRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [recordModalTenancy, setRecordModalTenancy] = useState<TenancyRow | null>(null)
  const [landlordId, setLandlordId] = useState<string | null>(null)

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
    setLandlordId(user.id)

    const { data: tenancyRows } = await supabase
      .from('tenancies')
      .select('id, rent_amount, rent_period, start_date, status, listing_id, tenant_id')
      .eq('landlord_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (!tenancyRows || tenancyRows.length === 0) {
      setTenancies([])
      setLoading(false)
      return
    }

    const listingIds = [...new Set(tenancyRows.map((t) => t.listing_id))]
    const tenantIds = [...new Set(tenancyRows.map((t) => t.tenant_id))]

    const [{ data: listings }, { data: tenants }] = await Promise.all([
      supabase.from('listings').select('id, title, location_text, photos').in('id', listingIds),
      supabase.from('profiles').select('id, full_name').in('id', tenantIds),
    ])

    const merged = tenancyRows.map((t) => ({
      ...t,
      listing: listings?.find((l) => l.id === t.listing_id),
      tenant: tenants?.find((p) => p.id === t.tenant_id),
    }))

    setTenancies(merged)

    const tenancyIds = merged.map((t) => t.id)
    const { data: payments } = await supabase
      .from('payments')
      .select('id, tenancy_id, amount, type, payment_method, status, confirmed_at')
      .in('tenancy_id', tenancyIds)
      .order('confirmed_at', { ascending: false })

    const map: Record<string, PaymentRow[]> = {}
    payments?.forEach((p) => {
      if (!map[p.tenancy_id]) map[p.tenancy_id] = []
      map[p.tenancy_id].push(p)
    })
    setPaymentsByTenancy(map)

    setLoading(false)
  }

  const methodLabel = (method: string | null) => {
    if (method === 'bank_transfer') return 'Bank Transfer'
    if (method === 'cash') return 'Cash'
    if (method === 'card') return 'Card'
    return method ?? '—'
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Payments</h1>
      <p className="text-sm text-muted-foreground mb-6">Track rent payments for your active tenancies.</p>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-40 bg-secondary rounded-lg" />
          <div className="h-40 bg-secondary rounded-lg" />
        </div>
      ) : tenancies.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Wallet size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No active tenancies yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tenancies.map((t) => {
            const payments = paymentsByTenancy[t.id] ?? []
            return (
              <div key={t.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <img
                    src={t.listing?.photos?.[0] || '/placeholder.jpg'}
                    alt={t.listing?.title}
                    className="w-14 h-14 rounded-md object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <HomeIcon size={13} className="text-muted-foreground shrink-0" />
                      <p className="font-semibold text-foreground truncate">{t.listing?.title ?? 'Property'}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Tenant: {t.tenant?.full_name ?? 'Tenant'}</p>
                    <p className="text-sm text-foreground mt-1">
                      Rent: ₦{t.rent_amount?.toLocaleString()} / {t.rent_period}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Payment history</p>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {payments.map((p) => (
                        <div key={p.id} className="bg-secondary/50 rounded-md p-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">
                              ₦{p.amount?.toLocaleString()} — <span className="capitalize">{p.type}</span>
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                            {methodLabel(p.payment_method)} · {p.status}
                          </p>
                          {p.confirmed_at && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.confirmed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setRecordModalTenancy(t)}
                  className="flex items-center gap-1 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-md px-3 py-1.5 mt-3"
                >
                  <Wallet size={14} /> Record Payment
                </button>
              </div>
            )
          })}
        </div>
      )}

      {recordModalTenancy && landlordId && (
        <RecordPaymentModal
          tenancy={recordModalTenancy}
          landlordId={landlordId}
          onClose={() => setRecordModalTenancy(null)}
          onCreated={(payment) => {
            setPaymentsByTenancy((prev) => ({
              ...prev,
              [payment.tenancy_id]: [payment, ...(prev[payment.tenancy_id] ?? [])],
            }))
            setRecordModalTenancy(null)
          }}
        />
      )}
    </div>
  )
}