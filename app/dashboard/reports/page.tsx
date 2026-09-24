'use client'

import { useEffect, useState } from 'react'
import { Flag, MapPin, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-50 text-amber-600',
  reviewing: 'bg-blue-50 text-blue-600',
  resolved: 'bg-emerald-50 text-emerald-600',
  dismissed: 'bg-gray-100 text-gray-600',
}

export default function LandlordReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('reports')
        .select('*, listings!inner(title, location_text, landlord_id)')
        .eq('listings.landlord_id', user.id)
        .order('created_at', { ascending: false })

      if (!error) setReports(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-card rounded-xl border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-bold text-foreground mb-1">Reports on My Properties</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Reports submitted by users about your listed properties.
      </p>

      {reports.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Flag size={28} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No reports filed against your properties.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-foreground text-sm">{r.listings?.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin size={12} /> {r.listings?.location_text}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {r.status}
                </span>
              </div>
              <p className="text-sm text-foreground font-medium">{r.reason}</p>
              {r.details && <p className="text-xs text-muted-foreground mt-1">{r.details}</p>}
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                <Clock size={11} /> {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}