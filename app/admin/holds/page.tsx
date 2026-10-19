'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ShieldCheck } from 'lucide-react'

export default function AdminHoldsPage() {
  const [holds, setHolds] = useState<any[]>([])
  const [publicId, setPublicId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [showReleased, setShowReleased] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 5000)
  }

  const load = async () => {
    const { data, error } = await supabase
      .from('property_holds')
      .select('id, reason, placed_at, released_at, release_note, properties(public_id, location_text)')
      .order('placed_at', { ascending: false })
      .limit(100)
    if (error) return flash('Could not load holds: ' + error.message)
    setHolds(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const place = async () => {
    if (!publicId.trim() || !reason.trim()) return flash('Enter the property reference and a reason.')
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_place_property_hold', {
      p_public_id: publicId.trim(),
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) return flash('Failed: ' + error.message)
    if (data !== 'ok') return flash(String(data))
    setPublicId('')
    setReason('')
    flash('Hold placed. New applications, viewings and tenancies are blocked for this property.')
    load()
  }

  const release = async (id: string) => {
    const note = (notes[id] ?? '').trim()
    if (!note) return flash('Add a note before releasing a hold.')
    const { data, error } = await supabase.rpc('admin_release_property_hold', { p_hold_id: id, p_note: note })
    if (error) return flash('Failed: ' + error.message)
    if (data !== 'ok') return flash(String(data))
    flash('Hold released.')
    load()
  }

  const prop = (h: any) => (Array.isArray(h.properties) ? h.properties[0] : h.properties)
  const visible = holds.filter((h) => showReleased || !h.released_at)

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
        <ShieldCheck size={22} /> Property holds
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        A hold blocks new applications, viewings and tenancies for every listing of the property, and hides its inspected badge.
        Existing tenancies and payments are not affected.
      </p>

      {msg && <div className="mb-4 text-sm rounded-lg border border-border bg-secondary px-3 py-2">{msg}</div>}

      <div className="bg-card border border-border rounded-lg p-4 space-y-2 mb-6">
        <p className="text-sm font-semibold">Place a hold</p>
        <input
          value={publicId}
          onChange={(e) => setPublicId(e.target.value)}
          placeholder="Property reference, e.g. EBO-P-000123"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason (kept in the audit record)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <Button onClick={place} disabled={busy}>Place hold</Button>
      </div>

      <label className="flex items-center gap-2 text-xs mb-3">
        <input type="checkbox" checked={showReleased} onChange={(e) => setShowReleased(e.target.checked)} /> Show released holds
      </label>

      <div className="space-y-3">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">No holds to show.</p>}
        {visible.map((h) => (
          <div key={h.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-1">
            <p className="font-semibold">
              {prop(h)?.public_id ?? 'Property'} <span className="font-normal text-muted-foreground">· {prop(h)?.location_text}</span>
            </p>
            <p className="text-xs">Reason: {h.reason}</p>
            <p className="text-xs text-muted-foreground">Placed {new Date(h.placed_at).toLocaleString()}</p>
            {h.released_at ? (
              <p className="text-xs text-emerald-700">
                Released {new Date(h.released_at).toLocaleString()}
                {h.release_note ? ` · ${h.release_note}` : ''}
              </p>
            ) : (
              <div className="flex gap-2 pt-1">
                <input
                  value={notes[h.id] ?? ''}
                  onChange={(e) => setNotes((p) => ({ ...p, [h.id]: e.target.value }))}
                  placeholder="Note required to release"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
                />
                <Button variant="outline" onClick={() => release(h.id)}>Release</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}