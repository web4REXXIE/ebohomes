'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Other parts of the app can call notifyNotificationsChanged() after
// marking notifications read, so the bell updates straight away.
export const NOTIFICATIONS_CHANGED_EVENT = 'ebohomes:notifications-changed'

export function notifyNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
  }
}

export function useUnreadNotifications() {
  const [userId, setUserId] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  // Know who is logged in, and react to login / logout
  useEffect(() => {
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user?.id ?? null)
      })
      .catch((err) => console.error('Failed to read session:', err))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0)
      return
    }
    const { count: unread, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      console.error('Failed to count unread notifications:', error.message)
      return
    }
    setCount(unread ?? 0)
  }, [userId])

  useEffect(() => {
    refresh()
    if (!userId) return

    const channel = supabase
      .channel(`unread-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refresh()
        }
      )
      .subscribe()

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh)
    }
  }, [userId, refresh])

  return { count, refresh }
}