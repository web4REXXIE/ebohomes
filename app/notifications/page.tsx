
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Bell, CheckCircle2, Loader2 } from 'lucide-react'
import {
  resolveNotificationLink,
  useNotifications,
  type NotificationItem,
} from '@/components/notification-provider'
import { supabase } from '@/lib/supabase'

// One Inbox: "Needs your action" first (soonest deadline on top), then the list of updates.
// The action rows come from the database function eb_my_actions(), which only returns the signed-in person's own items.

type ActionItem = {
  kind: string
  ref_id: string
  title: string
  detail: string | null
  link: string
  due_at: string | null
}

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

// Returns null when there is no deadline or it has already passed.
function dueText(iso: string | null): { text: string; soon: boolean } | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const ms = t - Date.now()
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return { text: `${Math.floor(hours / 24)} days left`, soon: false }
  if (hours >= 1) return { text: `${hours} ${hours === 1 ? 'hour' : 'hours'} left`, soon: hours < 24 }
  return { text: 'Less than an hour left', soon: true }
}

export default function NotificationsPage() {
  const router = useRouter()
  const { items, unreadCount, loading, error, role, markRead, markAllRead, refresh } =
    useNotifications()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [signedOut, setSignedOut] = useState(false)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [actionsLoading, setActionsLoading] = useState(true)
  const [actionsError, setActionsError] = useState(false)

  const loadActions = useCallback(async () => {
    setActionsLoading(true)
    setActionsError(false)
    const { data, error: rpcError } = await supabase.rpc('eb_my_actions')
    if (rpcError) {
      setActionsError(true)
      setActions([])
    } else {
      setActions((data ?? []) as ActionItem[])
    }
    setActionsLoading(false)
  }, [])

  // The provider only knows the signed-in person once it has checked.
  // Send signed-out visitors to the login page.
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) {
        setSignedOut(true)
        router.push('/login')
      } else {
        void loadActions()
      }
    })
    return () => {
      active = false
    }
  }, [router, loadActions])

  const handleOpen = async (n: NotificationItem) => {
    void markRead(n.id)
    const destination = resolveNotificationLink(n.link, role)
    if (destination) router.push(destination)
  }

  const visible = filter === 'unread' ? items.filter((n) => !n.read) : items

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">Inbox</h1>
          <Link href="/notifications/preferences" className="focus-ring inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline">
            Settings
          </Link>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={() => void markAllRead()} className="focus-ring min-h-11 rounded-chip px-2 text-sm font-medium text-primary">
            Mark all read
          </button>
        )}
      </div>

      {!signedOut && (
        <section aria-labelledby="needs-action" className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="needs-action" className="text-base font-bold text-foreground">Needs your action</h2>
            {actions.length > 0 && (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground" aria-label={`${actions.length} things need you`}>
                {actions.length}
              </span>
            )}
          </div>

          {actionsLoading ? (
            <Loader2 className="animate-spin text-primary" size={20} role="status" aria-label="Loading your actions" />
          ) : actionsError ? (
            <div role="alert" className="text-sm text-muted-foreground">
              <p>Could not check what needs you.</p>
              <button type="button" onClick={() => void loadActions()} className="focus-ring mt-2 min-h-11 rounded-chip px-2 font-medium text-primary">
                Try again
              </button>
            </div>
          ) : actions.length === 0 ? (
            <div className="rounded-card border border-dashed border-border bg-card p-4 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 size={16} className="text-primary" aria-hidden /> You are up to date
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Nothing needs your action right now.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {actions.map((a) => {
                const due = dueText(a.due_at)
                return (
                  <li
                    key={`${a.kind}-${a.ref_id}`}
                    className={`rounded-card border border-border border-l-4 bg-card p-4 shadow-rest ${due?.soon ? 'border-l-warning' : 'border-l-primary'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 text-base font-bold text-foreground">{a.title}</h3>
                      {due && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {due.text}
                        </span>
                      )}
                    </div>
                    {a.detail && <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>}
                    <Link
                      href={a.link}
                      className="focus-ring mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Open <ArrowRight size={14} aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <h2 className="mb-3 text-base font-bold text-foreground">Updates</h2>

      <div role="group" aria-label="Filter updates" className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
          className={`focus-ring min-h-11 rounded-full px-4 text-xs font-medium ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
          }`}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={filter === 'unread'}
          onClick={() => setFilter('unread')}
          className={`focus-ring min-h-11 rounded-full px-4 text-xs font-medium ${
            filter === 'unread' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
          }`}
        >
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>
      </div>

      {signedOut ? (
        <p className="text-sm text-muted-foreground">Please log in to see your inbox.</p>
      ) : loading ? (
        <Loader2 className="animate-spin text-primary" size={24} role="status" aria-label="Loading updates" />
      ) : error ? (
        <div role="alert" className="text-sm text-muted-foreground">
          <p>Could not load updates.</p>
          <button type="button" onClick={() => void refresh()} className="focus-ring mt-2 min-h-11 rounded-chip px-2 font-medium text-primary">
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filter === 'unread' ? 'No unread updates.' : "You're all caught up."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpen(n)}
              className="focus-ring w-full rounded-card text-left"
            >
              <div
                className={`flex items-start gap-3 border rounded-lg p-3 ${
                  n.read ? 'bg-card border-border' : 'bg-primary/5 border-primary/30'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell size={14} className="text-primary" aria-hidden />
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
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && (
                  <>
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="sr-only">Unread</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
