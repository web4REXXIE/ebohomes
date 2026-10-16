'use client'

import { useEffect } from 'react'
import { useNotifications } from '@/components/notification-provider'
import { dropLocalSubscription, syncPush } from '@/lib/push-client'
import { supabase } from '@/lib/supabase'

// Mounted once in app/layout.tsx. It never shows anything and never asks for
// permission. It only keeps this device registered for people who already
// turned push on, and detaches the device when someone signs out.
export function PushSync() {
  const { userId } = useNotifications()

  useEffect(() => {
    if (userId) void syncPush(userId)
  }, [userId])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') void dropLocalSubscription()
    })
    return () => subscription.unsubscribe()
  }, [])

  return null
}