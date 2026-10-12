'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function TrustPage() {
  const [rows, setRows] = useState<any[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase
        .from('landlord_trust')
        .select('*')
        .order('score', { ascending: true })
        .limit(200)
      const list = data ?? []
      setRows(list)
      const ids = list.map((r: any) => r.landlord_id)
      if (ids.length > 0) {
        const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        const m: Record<string, string> = {}
        ps?.forEach((p: any) => { m[p.id] = p.full_name ?? '' })
        setNames(m)
      }
      setLoading(false)
    }
    run()
  }, [])

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Landlord Trust</h1>
      <p className="text-sm text-muted-foreground mb-4">
        A guide for reviewers. It moves up and down with behaviour and never approves or bans anyone. Lowest scores first.
      </p>
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No landlords yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.landlord_id} className="bg-card border border-border rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <p className="font-medium text-foreground">{names[r.landlord_id] ? names[r.landlord_id] : r.landlord_id}</p>
                <p className="font-semibold capitalize">{r.score} · {r.level}</p>
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-4 mt-1">
                {(r.reasons ?? []).map((x: string) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}