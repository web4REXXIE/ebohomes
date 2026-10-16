'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, Loader2 } from 'lucide-react'
import {
  resolveNotificationLink,
  useNotifications,
  type NotificationItem,
} from '@/components/notification-provider'
import { supabase } from '@/lib/supabase'

function timeAgo(iso: string | null) {
  if (!iso) return ''
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
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
  const { items, unreadCount, loading, error, role, markRead, markAllRead, refresh } =
    useNotifications()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [signedOut, setSignedOut] = useState(false)

  // The provider only knows the signed-in person once it has checked.
  // Send signed-out visitors to the login page.
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) {
        setSignedOut(true)
        router.push('/login')
      }
    })
    return () => {
      active = false
    }
  }, [router])

  const handleOpen = async (n: NotificationItem) => {
    void markRead(n.id)
    const destination = resolveNotificationLink(n.link, role)
    if (destination) router.push(destination)
  }

  const visible = filter === 'unread' ? items.filter((n) => !n.read) : items

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">Notifications</h1>
          <Link href="/notifications/preferences" className="text-xs text-muted-foreground underline">
            Settings
          </Link>
        </div>
        {unreadCount > 0 && (
          <button onClick={() => void markAllRead()} className="text-sm text-primary font-medium">
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

      {signedOut ? (
        <p className="text-sm text-muted-foreground">Please log in to see your notifications.</p>
      ) : loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : error ? (
        <div className="text-sm text-muted-foreground">
          <p>Could not load notifications.</p>
          <button onClick={() => void refresh()} className="mt-2 text-primary font-medium">
            Try again
          </button>
        </div>
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
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
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