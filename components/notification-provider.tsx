'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import {
  NOTIFICATION_PREFS_CHANGED_EVENT,
  playNotificationSound,
  unlockNotificationSound,
} from '@/lib/notification-sound'

export type NotificationItem = {
  id: string
  user_id: string
  type: string | null
  title: string | null
  message: string | null
  body: string | null
  link: string | null
  read: boolean
  read_at: string | null
  created_at: string | null
}

type NotificationsContextValue = {
  userId: string | null
  role: string | null
  items: NotificationItem[]
  unreadCount: number
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<boolean>
  markAllRead: () => Promise<boolean>
  // Call after the person opens a conversation. Marks that person's message
  // notifications as read.
  markMessageNotificationsRead: (partnerId: string) => Promise<void>
  // Tell the provider which conversation is open right now (or null), so new
  // message notifications from that person are marked read straight away.
  setActiveConversation: (partnerId: string | null) => void
}

const COLUMNS = 'id, user_id, type, title, message, body, link, read, read_at, created_at'
const PAGE_SIZE = 100

// Older code calls notifyNotificationsChanged() after changing notifications.
export const NOTIFICATIONS_CHANGED_EVENT = 'ebohomes:notifications-changed'

export function notifyNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
  }
}

// Only allow links that stay inside EboHomes
export function isSafeInternalLink(link: string | null | undefined): link is string {
  return (
    typeof link === 'string' &&
    link.startsWith('/') &&
    !link.startsWith('//') &&
    !link.startsWith('/\\')
  )
}

// Landlords and tenants use different message pages. Old notifications were
// saved with "/messages" for everyone, so fix the destination here.
export function resolveNotificationLink(
  link: string | null | undefined,
  role: string | null
): string | null {
  if (!isSafeInternalLink(link)) return null
  if (role === 'landlord' && (link === '/messages' || link.startsWith('/messages?'))) {
    return '/dashboard' + link
  }
  if (role !== 'landlord' && link.startsWith('/dashboard/messages')) {
    return link.replace('/dashboard/messages', '/messages')
  }
  return link
}

function sortItems(list: NotificationItem[]): NotificationItem[] {
  return [...list].sort((a, b) => {
    // created_at can be missing, so those go last and ties fall back to id
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    if (tb !== ta) return tb - ta
    return a.id < b.id ? 1 : -1
  })
}

const NOOP_VALUE: NotificationsContextValue = {
  userId: null,
  role: null,
  items: [],
  unreadCount: 0,
  loading: false,
  error: false,
  refresh: async () => {},
  markRead: async () => false,
  markAllRead: async () => false,
  markMessageNotificationsRead: async () => {},
  setActiveConversation: () => {},
}

const NotificationsContext = createContext<NotificationsContextValue>(NOOP_VALUE)

export function useNotifications() {
  return useContext(NotificationsContext)
}

// Mounted once in app/layout.tsx. It is the ONLY place that talks to the
// notifications table live. The bell, both sidebars and the inbox all read
// from here, so their numbers always agree.
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const userIdRef = useRef<string | null>(null)
  const itemsRef = useRef<NotificationItem[]>([])
  const unreadRef = useRef(0)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const readyRef = useRef(false) // true after the first successful load
  const soundOnRef = useRef(false)
  const connectedRef = useRef(false)
  const activeConversationRef = useRef<string | null>(null)
  const inflightRef = useRef(false)
  const queuedRef = useRef(false)
  const recountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commitItems = useCallback((next: NotificationItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  const commitUnread = useCallback((next: number) => {
    const safe = Math.max(0, next)
    unreadRef.current = safe
    setUnreadCount(safe)
  }, [])

  const maybePlaySound = useCallback(() => {
    if (!readyRef.current || !soundOnRef.current) return
    playNotificationSound()
  }, [])

  // ---- load everything (also used to recover anything we missed) ----
  const load = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return
    if (inflightRef.current) {
      queuedRef.current = true
      return
    }
    inflightRef.current = true
    try {
      const [listRes, countRes] = await Promise.all([
        supabase
          .from('notifications')
          .select(COLUMNS)
          .eq('user_id', uid)
          .order('created_at', { ascending: false, nullsFirst: false })
          .limit(PAGE_SIZE),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('read', false),
      ])
      // The person may have signed out or switched account while we waited
      if (userIdRef.current !== uid) return

      if (listRes.error) {
        console.error('Failed to load notifications:', listRes.error.message)
        // Keep what is already on screen if we have it
        if (!readyRef.current) setError(true)
        return
      }

      const fresh = sortItems((listRes.data ?? []) as NotificationItem[])
      const known = knownIdsRef.current
      const newUnread = fresh.filter((n) => !n.read && !known.has(n.id))
      for (const n of fresh) known.add(n.id)

      commitItems(fresh)
      if (countRes.error) {
        commitUnread(fresh.filter((n) => !n.read).length)
      } else {
        commitUnread(countRes.count ?? 0)
      }
      setError(false)

      // Anything new that we did not see live (tab was in the background,
      // connection dropped...) gets ONE sound, not one per notification.
      if (readyRef.current && newUnread.length > 0) maybePlaySound()
      readyRef.current = true
    } finally {
      inflightRef.current = false
      setLoading(false)
      if (queuedRef.current) {
        queuedRef.current = false
        void load()
      }
    }
  }, [commitItems, commitUnread, maybePlaySound])

  // Re-count on the server shortly after a live event, so the number can
  // never drift away from the database.
  const scheduleRecount = useCallback(() => {
    if (recountTimerRef.current) clearTimeout(recountTimerRef.current)
    recountTimerRef.current = setTimeout(() => {
      recountTimerRef.current = null
      void load()
    }, 400)
  }, [load])

  // ---- who is signed in ----
  useEffect(() => {
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user?.id ?? null)
      })
      .catch((err) => console.error('Notification provider session error:', err))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Only set state here. No Supabase calls inside this callback.
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // ---- everything that depends on WHO is signed in ----
  useEffect(() => {
    // Reset for the new person (or for nobody)
    userIdRef.current = userId
    knownIdsRef.current = new Set()
    readyRef.current = false
    soundOnRef.current = false
    connectedRef.current = false
    queuedRef.current = false
    activeConversationRef.current = null
    commitItems([])
    commitUnread(0)
    setRole(null)
    setError(false)

    if (!userId) {
      setLoading(false)
      return
    }

    setLoading(true)
    let active = true

    const loadSoundPreference = async () => {
      const { data, error: prefError } = await supabase
        .from('notification_preferences')
        .select('sound_enabled')
        .eq('user_id', userId)
        .maybeSingle()
      if (!active) return
      if (prefError) {
        console.error('Failed to read sound preference:', prefError.message)
        return
      }
      soundOnRef.current = data?.sound_enabled === true
    }

    const loadRole = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      if (active) setRole(data?.role ?? null)
    }

    void loadSoundPreference()
    void loadRole()
    void load()

    // One live channel for this person
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (userIdRef.current !== userId) return

          if (payload.eventType === 'INSERT') {
            const row = payload.new as NotificationItem
            if (!row?.id || knownIdsRef.current.has(row.id)) return // duplicate
            knownIdsRef.current.add(row.id)

            // A message from the person whose chat is open right now:
            // mark it read instead of alerting.
            const partner = activeConversationRef.current
            const isOpenChat =
              !row.read &&
              row.type === 'message' &&
              !!partner &&
              typeof row.link === 'string' &&
              (row.link.includes(`thread=${partner}`) || row.link.includes(`to=${partner}`))

            const stored: NotificationItem = isOpenChat ? { ...row, read: true } : row
            commitItems(sortItems([stored, ...itemsRef.current]).slice(0, PAGE_SIZE))

            if (isOpenChat) {
              void supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', row.id)
                .eq('user_id', userId)
            } else if (!row.read) {
              commitUnread(unreadRef.current + 1)
              maybePlaySound()
            }
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as NotificationItem
            if (!row?.id) return
            const before = itemsRef.current.find((n) => n.id === row.id)
            if (before) {
              commitItems(itemsRef.current.map((n) => (n.id === row.id ? { ...n, ...row } : n)))
              if (!before.read && row.read) commitUnread(unreadRef.current - 1)
              if (before.read && !row.read) commitUnread(unreadRef.current + 1)
            }
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id
            if (oldId) commitItems(itemsRef.current.filter((n) => n.id !== oldId))
          }
          scheduleRecount()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          connectedRef.current = true
          // Pick up anything created before we were connected, or while we
          // were disconnected. Safe to repeat: duplicates are ignored.
          void load()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          connectedRef.current = false
        }
      })

    // Browsers only allow sound after a tap, so unlock it on the first one
    const onFirstTap = () => {
      unlockNotificationSound()
      window.removeEventListener('pointerdown', onFirstTap)
      window.removeEventListener('keydown', onFirstTap)
    }
    window.addEventListener('pointerdown', onFirstTap)
    window.addEventListener('keydown', onFirstTap)

    // Coming back to the app or getting internet again: catch up
    const onWake = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onOnline = () => void load()
    const onPrefsChanged = () => void loadSoundPreference()
    const onChanged = () => void load()

    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onOnline)
    window.addEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, onPrefsChanged)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)

    // Safety net: if the live connection is down, check every 45 seconds
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && !connectedRef.current) void load()
    }, 45000)

    return () => {
      active = false
      clearInterval(poll)
      if (recountTimerRef.current) {
        clearTimeout(recountTimerRef.current)
        recountTimerRef.current = null
      }
      supabase.removeChannel(channel)
      window.removeEventListener('pointerdown', onFirstTap)
      window.removeEventListener('keydown', onFirstTap)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, onPrefsChanged)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    }
  }, [userId, load, commitItems, commitUnread, maybePlaySound, scheduleRecount])

  // ---- actions ----
  const markIdsRead = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const uid = userIdRef.current
      if (!uid || ids.length === 0) return true
      const idSet = new Set(ids)
      const before = itemsRef.current
      const flipped = before.filter((n) => idSet.has(n.id) && !n.read).length
      if (flipped === 0) return true

      const nowIso = new Date().toISOString()
      commitItems(
        before.map((n) => (idSet.has(n.id) ? { ...n, read: true, read_at: n.read_at ?? nowIso } : n))
      )
      commitUnread(unreadRef.current - flipped)

      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', ids)
        .eq('user_id', uid)

      if (updateError) {
        console.error('Failed to mark notifications read:', updateError.message)
        if (userIdRef.current === uid) void load() // put the screen back in line with the database
        return false
      }
      return true
    },
    [commitItems, commitUnread, load]
  )

  const markRead = useCallback((id: string) => markIdsRead([id]), [markIdsRead])

  const markAllRead = useCallback(async (): Promise<boolean> => {
    const uid = userIdRef.current
    if (!uid) return false
    const nowIso = new Date().toISOString()
    commitItems(itemsRef.current.map((n) => (n.read ? n : { ...n, read: true, read_at: nowIso })))
    commitUnread(0)

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', uid)
      .eq('read', false)

    if (updateError) {
      console.error('Failed to mark all notifications read:', updateError.message)
      if (userIdRef.current === uid) void load()
      return false
    }
    return true
  }, [commitItems, commitUnread, load])

  const markMessageNotificationsRead = useCallback(
    async (partnerId: string) => {
      const uid = userIdRef.current
      if (!uid) return
      const unreadMessages = itemsRef.current.filter((n) => n.type === 'message' && !n.read)
      const ids = unreadMessages
        .filter((n) => typeof n.link === 'string' && (n.link.includes(`thread=${partnerId}`) || n.link.includes(`to=${partnerId}`)))
        .map((n) => n.id)

      // Old message notifications have no sender in their link. If this
      // person has no unread messages left at all, those are stale too.
      if (unreadMessages.length > ids.length) {
        const { data: remaining, error: countError } = await supabase.rpc('my_unread_message_count')
        if (!countError && (remaining ?? 0) === 0) {
          await markIdsRead(unreadMessages.map((n) => n.id))
          return
        }
      }
      await markIdsRead(ids)
    },
    [markIdsRead]
  )

  const setActiveConversation = useCallback((partnerId: string | null) => {
    activeConversationRef.current = partnerId
  }, [])

  const value = useMemo<NotificationsContextValue>(
    () => ({
      userId,
      role,
      items,
      unreadCount,
      loading,
      error,
      refresh: load,
      markRead,
      markAllRead,
      markMessageNotificationsRead,
      setActiveConversation,
    }),
    [
      userId,
      role,
      items,
      unreadCount,
      loading,
      error,
      load,
      markRead,
      markAllRead,
      markMessageNotificationsRead,
      setActiveConversation,
    ]
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}