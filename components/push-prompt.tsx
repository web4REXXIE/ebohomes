'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PromptCard } from '@/components/ui/prompt-card'
import { useNotifications } from '@/components/notification-provider'
import { enablePush, getPermission, getPushSupport } from '@/lib/push-client'

const STORAGE_KEY = 'ebohomes:push-prompt'
const SHOW_AFTER_MS = 10_000
const REASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const MAX_DISMISSALS = 3

// Pages where a prompt would be in the way
const HIDDEN_PATHS = ['/login', '/forgot-password', '/reset-password', '/verification-pending', '/notifications/preferences']

type Stored = { dismissedAt?: number; count?: number }

function readStored(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    return {}
  }
}

function writeDismissed() {
  try {
    const prev = readStored()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dismissedAt: Date.now(), count: (prev.count ?? 0) + 1 })
    )
  } catch {
    /* storage unavailable: the prompt simply shows again next visit */
  }
}

function dueToShow(): boolean {
  const s = readStored()
  if ((s.count ?? 0) >= MAX_DISMISSALS) return false
  if (!s.dismissedAt) return true
  return Date.now() - s.dismissedAt > REASK_AFTER_MS
}

// A friendly in-app card that suggests turning on push. It NEVER triggers the
// browser permission dialog by itself: that only happens when the person taps
// "Turn on".
export function PushPrompt() {
  const { userId } = useNotifications()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setVisible(false)
    if (!userId) return
    if (getPushSupport() !== 'supported') return
    if (getPermission() !== 'default') return // already allowed, or blocked
    if (!dueToShow()) return

    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible' && getPermission() === 'default') {
        setVisible(true)
      }
    }, SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [userId])

  if (!visible || !userId || HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null
  }

  const dismiss = () => {
    writeDismissed()
    setVisible(false)
  }

  const turnOn = async () => {
    setBusy(true)
    setError(null)
    const result = await enablePush(userId)
    setBusy(false)
    if (result.ok) {
      setVisible(false)
      return
    }
    if (result.reason === 'denied' || result.reason === 'dismissed') {
      dismiss()
      return
    }
    setError(result.message)
  }

  return (
    <aside
      aria-label="Turn on push notifications"
      className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] md:inset-x-auto md:right-6 md:top-6 md:w-[380px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4 motion-safe:duration-500"
    >
      <PromptCard
        onDismiss={dismiss}
        title="Never miss an update."
        icon={<Bell size={22} aria-hidden="true" />}
        actions={
          <>
            <Button onClick={turnOn} loading={busy} className="flex-1">Turn on notifications</Button>
            <Button variant="ghost" onClick={dismiss}>Not now</Button>
          </>
        }
      >
        Get an alert when EboHomes Support replies or your application changes, even when the app is closed.
        We never show private details on your lock screen.
        {error && <span role="alert" className="mt-2 block text-xs text-danger">{error}</span>}
      </PromptCard>
    </aside>
  )
}
