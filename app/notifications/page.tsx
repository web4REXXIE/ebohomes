'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function NotificationsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    load()
  }

  const hasUnread = rows.some((n) => !n.read)

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Notifications</h1>
        {hasUnread && (
          <button onClick={markAllRead} className="text-sm text-primary font-medium">Mark all read</button>
        )}
      </div>
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You're all caught up.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((n) => {
            const body = (
              <div className="flex items-start gap-3 bg-card border border-border rounded-lg p-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell size={14} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  {n.title && <p className="text-sm font-medium text-foreground">{n.title}</p>}
                  <p className="text-sm text-foreground">{n.message ? n.message : n.body ? n.body : 'Notification'}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
              </div>
            )
            return n.link ? (
              <Link key={n.id} href={n.link}>{body}</Link>
            ) : (
              <div key={n.id}>{body}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}