'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle2, XCircle, FileText } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'

type ApplicationRow = {
  id: string
  status: string
  message: string | null
  created_at: string
  listing_id: string
  listing?: { title: string; location_text: string; price_monthly: number; photos: string[] }
}

export default function MyApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login?redirect=/applications')
        return
      }

      const { data: apps } = await supabase
        .from('applications')
        .select('id, status, message, created_at, listing_id')
        .eq('tenant_id', user.id)
        .order('created_at', { ascending: false })

      if (!apps || apps.length === 0) {
        setApplications([])
        setLoading(false)
        return
      }

      const listingIds = [...new Set(apps.map((a) => a.listing_id))]
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, location_text, price_monthly, photos')
        .in('id', listingIds)

      const merged = apps.map((a) => ({
        ...a,
        listing: listings?.find((l) => l.id === a.listing_id),
      }))

      setApplications(merged)
      setLoading(false)
    }

    load()
  }, [router])

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
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-xl font-bold text-foreground mb-1">My Applications</h1>
        <p className="text-sm text-muted-foreground mb-6">Track the status of properties you've applied to.</p>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-24 bg-secondary rounded-lg" />
            <div className="h-24 bg-secondary rounded-lg" />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-4">You haven't applied to any properties yet.</p>
            <button onClick={() => router.push('/search')} className="text-primary text-sm font-medium hover:underline">
              Browse properties →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <div
                key={app.id}
                onClick={() => router.push(`/listing/${app.listing_id}`)}
                className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 cursor-pointer hover:border-primary transition-colors"
              >
                <img
                  src={app.listing?.photos?.[0] || '/placeholder.jpg'}
                  alt={app.listing?.title}
                  className="w-16 h-16 rounded-md object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{app.listing?.title ?? 'Listing'}</p>
                  <p className="text-xs text-muted-foreground truncate">{app.listing?.location_text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
                {statusBadge(app.status)}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
