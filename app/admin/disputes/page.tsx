'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function DisputesPage() {
  const [rows, setRows] = useState<any[]>([])
  const [filter, setFilter] = useState('')
  const [reason, setReason] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, title, location_text, status')
      .in('status', ['approved', 'paused', 'pending', 'suspended'])
      .order('created_at', { ascending: false })
      .limit(200)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const freeze = async (id: string) => {
    setMsg('')
    const why = reason[id] ? reason[id].trim() : ''
    if (!why) {
      setMsg('Write a reason first.')
      return
    }
    const { error } = await supabase.rpc('admin_freeze_listing', { p_listing: id, p_reason: why })
    if (error) setMsg(error.message)
    load()
  }

  const unfreeze = async (id: string) => {
    setMsg('')
    const { error } = await supabase.rpc('admin_unfreeze_listing', { p_listing: id })
    if (error) setMsg(error.message)
    load()
  }

  const q = filter.toLowerCase().trim()
  const shown = rows.filter((r) => {
    if (!q) return true
    return ((r.title ?? '') + ' ' + (r.location_text ?? '')).toLowerCase().includes(q)
  })

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Ownership Disputes</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Freezing suspends the listing and blocks payments on it. Unfreezing sends it back to review.
      </p>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search listings" className="w-full bg-input border border-border rounded-lg px-4 py-2 text-sm mb-4" />
      {msg && <p className="text-sm text-destructive mb-3">{msg}</p>}
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : (
        <div className="space-y-3">
          {shown.map((l) => (
            <div key={l.id} className="bg-card border border-border rounded-lg p-4 text-sm">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.location_text}</p>
                </div>
                <span className="text-xs border border-border rounded-full px-2 py-1 h-fit capitalize">{l.status}</span>
              </div>
              {l.status === 'suspended' ? (
                <button onClick={() => unfreeze(l.id)} className="mt-3 text-xs border border-border rounded-md px-2 py-1">Unfreeze (send to review)</button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input value={reason[l.id] ? reason[l.id] : ''} onChange={(e) => setReason((p) => ({ ...p, [l.id]: e.target.value }))} placeholder="Reason for freeze" className="flex-1 bg-input border border-border rounded-md px-2 py-1.5 text-xs" />
                  <button onClick={() => freeze(l.id)} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs">Freeze</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}