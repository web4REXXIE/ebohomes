'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params?.code ?? '')
  const [r, setR] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data } = await supabase.rpc('get_receipt', { p_code: code })
      setR(data && data.length > 0 ? data[0] : null)
      setLoading(false)
    }
    run()
  }, [code, router])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={26} />
      </div>
    )
  }
  if (!r) {
    return <p className="text-center py-16 text-sm text-muted-foreground">Receipt not found, or it is not yours to view.</p>
  }
  const confirmed = r.status === 'confirmed'
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-card border border-border rounded-lg p-6 space-y-3 text-sm">
        <h1 className="text-lg font-bold text-foreground">EboHomes Rental Receipt</h1>
        <p><span className="text-muted-foreground block text-xs">Receipt</span>{r.receipt_code}</p>
        <p><span className="text-muted-foreground block text-xs">Tenancy</span>{r.tenancy_code ?? '—'}</p>
        <p><span className="text-muted-foreground block text-xs">Property</span>{r.listing_title ?? '—'}</p>
        <p><span className="text-muted-foreground block text-xs">Tenant</span>{r.tenant_name ?? '—'}</p>
        <p><span className="text-muted-foreground block text-xs">Landlord</span>{r.landlord_name ?? '—'}</p>
        <p><span className="text-muted-foreground block text-xs">Amount</span>₦{Number(r.amount).toLocaleString()} ({r.payment_type})</p>
        <p><span className="text-muted-foreground block text-xs">Date</span>{new Date(r.paid_on).toLocaleDateString()}</p>
        <p><span className="text-muted-foreground block text-xs">Payment reference</span>{r.reference ?? '—'}</p>
        <p><span className="text-muted-foreground block text-xs">Status</span><span className="capitalize">{r.status}</span></p>
        {!confirmed && (
          <p className="text-xs rounded-md bg-secondary px-3 py-2">
            This payment was recorded by the landlord. EboHomes did not collect or confirm it, so EboHomes cannot provide payment protection for it.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Check this receipt anytime at /verify-receipt using the receipt number.</p>
        <button onClick={() => window.print()} className="w-full mt-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm print:hidden">Print</button>
      </div>
    </div>
  )
}