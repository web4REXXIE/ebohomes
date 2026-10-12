'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function AuditLogPage() {
  const [rows, setRows] = useState<any[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase
        .from('audit_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
      const list = data ?? []
      setRows(list)
      const ids = [...new Set(list.map((r: any) => r.actor_id).filter(Boolean))]
      if (ids.length > 0) {
        const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids as string[])
        const m: Record<string, string> = {}
        ps?.forEach((p: any) => { m[p.id] = p.full_name ?? '' })
        setNames(m)
      }
      setLoading(false)
    }
    run()
  }, [])

  const shown = rows.filter((r) => {
    const q = filter.toLowerCase().trim()
    if (!q) return true
    return (r.action + ' ' + r.object_type).toLowerCase().includes(q)
  })

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Audit Log</h1>
      <p className="text-sm text-muted-foreground mb-4">Records cannot be edited or deleted. Showing the latest 300.</p>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter, e.g. listing or payment" className="w-full bg-input border border-border rounded-lg px-4 py-2 text-sm mb-4" />
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium text-foreground">{r.action}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.object_type} · by {r.actor_id ? (names[r.actor_id] ? names[r.actor_id] : 'user') : 'system'}
                {r.actor_role ? ` (${r.actor_role})` : ''}
              </p>
              {(r.previous_state ? true : r.new_state ? true : false) && (
                <p className="text-xs mt-1">
                  {r.previous_state ? JSON.stringify(r.previous_state) : ''} {r.previous_state ? '→' : ''} {r.new_state ? JSON.stringify(r.new_state) : ''}
                </p>
              )}
              {r.reason && <p className="text-xs mt-1">Reason: {r.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}