'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ContactMessagesPage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const setHandled = async (id: string, handled: boolean) => {
    await supabase.from('contact_messages').update({ handled }).eq('id', id)
    load()
  }

  const shown = showAll ? rows : rows.filter((r) => !r.handled)

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Contact Messages</h1>
        <button onClick={() => setShowAll(!showAll)} className="text-sm text-primary font-medium">
          {showAll ? 'Show open only' : 'Show all'}
        </button>
      </div>
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((m) => (
            <div key={m.id} className="bg-card border border-border rounded-lg p-4 text-sm">
              <div className="flex justify-between gap-2">
                <p className="font-medium text-foreground">{m.name} {m.subject ? `· ${m.subject}` : ''}</p>
                <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground">{m.email}{m.phone ? ` · ${m.phone}` : ''}</p>
              <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
              <button onClick={() => setHandled(m.id, !m.handled)} className="mt-3 text-xs border border-border rounded-md px-2 py-1">
                {m.handled ? 'Reopen' : 'Mark handled'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}