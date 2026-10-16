'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  NOTIFICATION_PREFS_CHANGED_EVENT,
  playNotificationSound,
  unlockNotificationSound,
} from '@/lib/notification-sound'

// Mounted once in app/layout.tsx. It has no visible UI.
// Its only job: when a genuinely NEW notification arrives for the logged-in
// person, play the notification sound, but only if they turned sound on in
// their notification settings.
//
// Two ways a new notification is noticed:
//  1. Live, through a Supabase Realtime subscription (needs the notifications
//     table to be added to the realtime publication).
//  2. When the person comes back to the tab or app, we check for anything newer
//     than the last notification we already knew about. This also covers the
//     case where Realtime is not switched on yet.
export function NotificationListener() {
  const userIdRef = useRef<string | null>(null)
  const soundOnRef = useRef(false)
  const lastSeenRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    const loadSoundPreference = async (userId: string) => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('sound_enabled')
        .eq('user_id', userId)
        .maybeSingle()
      if (!active) return
      if (error) {
        console.error('Failed to read sound preference:', error.message)
        return
      }
      soundOnRef.current = data?.sound_enabled === true
    }

    const loadLastSeen = async (userId: string) => {
      const { data } = await supabase
        .from('notifications')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!active) return
      lastSeenRef.current = data?.created_at ?? new Date().toISOString()
    }

    const stop = () => {
      if (channel) {
        supabase.removeChannel(channel)
        channel = null
      }
    }

    const start = async (userId: string | null) => {
      stop()
      userIdRef.current = userId
      soundOnRef.current = false
      lastSeenRef.current = null
      if (!userId) return

      await Promise.all([loadSoundPreference(userId), loadLastSeen(userId)])
      if (!active || userIdRef.current !== userId) return

      channel = supabase
        .channel(`notification-listener-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const createdAt = (payload.new as { created_at?: string })?.created_at
            if (createdAt) lastSeenRef.current = createdAt
            if (soundOnRef.current) playNotificationSound()
          }
        )
        .subscribe()
    }

    // Check for anything that arrived while the tab was in the background
    const checkForMissed = async () => {
      const userId = userIdRef.current
      const since = lastSeenRef.current
      if (!userId || !since) return
      const { data, error } = await supabase
        .from('notifications')
        .select('created_at')
        .eq('user_id', userId)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error || !data || data.length === 0) return
      lastSeenRef.current = data[0].created_at
      if (soundOnRef.current) playNotificationSound()
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForMissed()
    }

    const onPrefsChanged = () => {
      const userId = userIdRef.current
      if (userId) void loadSoundPreference(userId)
    }

    // Browsers only allow sound after a tap, so unlock it on the first one
    const onFirstTap = () => {
      unlockNotificationSound()
      window.removeEventListener('pointerdown', onFirstTap)
      window.removeEventListener('keydown', onFirstTap)
    }
    window.addEventListener('pointerdown', onFirstTap)
    window.addEventListener('keydown', onFirstTap)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, onPrefsChanged)

    supabase.auth
      .getSession()
      .then(({ data }) => start(data.session?.user?.id ?? null))
      .catch((err) => console.error('Notification listener session error:', err))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null
      if (nextId !== userIdRef.current) void start(nextId)
    })

    return () => {
      active = false
      stop()
      subscription.unsubscribe()
      window.removeEventListener('pointerdown', onFirstTap)
      window.removeEventListener('keydown', onFirstTap)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, onPrefsChanged)
    }
  }, [])

  return null
}