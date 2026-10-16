'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { notifyNotificationsChanged } from '@/lib/use-unread-notifications'
import Link from 'next/link'

type NotificationRow = {
  id: string
  user_id: string
  type: string | null
  title: string | null
  message: string | null
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

// Only allow links that stay inside EboHomes
function isSafeInternalLink(link: string | null): link is string {
  return (
    typeof link === 'string' &&
    link.startsWith('/') &&
    !link.startsWith('//') &&
    !link.startsWith('/\\')
  )
}

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    setUserId(user.id)

    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, message, body, link, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Failed to load notifications:', error.message)
      setLoadError(true)
    } else {
      setLoadError(false)
      setRows((data ?? []) as NotificationRow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markOneRead = async (n: NotificationRow) => {
    if (n.read || !userId) return

    // Update the screen straight away, undo if the database refuses
    setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: true } : r)))

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', n.id)
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to mark notification read:', error.message)
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: false } : r)))
      return
    }
    notifyNotificationsChanged()
  }

  const handleOpen = async (n: NotificationRow) => {
    await markOneRead(n)
    if (isSafeInternalLink(n.link)) {
      router.push(n.link)
    }
  }

  const markAllRead = async () => {
    if (!userId) return
    setRows((prev) => prev.map((r) => ({ ...r, read: true })))

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      console.error('Failed to mark all read:', error.message)
      load()
      return
    }
    notifyNotificationsChanged()
  }

  const unreadCount = rows.filter((n) => !n.read).length
  const visible = filter === 'unread' ? rows.filter((n) => !n.read) : rows

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-sm text-primary font-medium">
            Mark all read
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            filter === 'unread' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
          }`}
        >
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>
      </div>

      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">
          Could not load notifications. Please refresh and try again.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filter === 'unread' ? 'No unread notifications.' : "You're all caught up."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpen(n)}
              className="w-full text-left"
            >
              <div
                className={`flex items-start gap-3 border rounded-lg p-3 ${
                  n.read ? 'bg-card border-border' : 'bg-primary/5 border-primary/30'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell size={14} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  {n.title && (
                    <p
                      className={`text-sm text-foreground ${
                        n.read ? 'font-normal' : 'font-semibold'
                      }`}
                    >
                      {n.title}
                    </p>
                  )}
                  <p className="text-sm text-foreground">
                    {n.message ? n.message : n.body ? n.body : 'Notification'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {n.created_at ? timeAgo(n.created_at) : ''}
                  </p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}