'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Loader2, X } from 'lucide-react'
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
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-[#FAF7F2] p-4 shadow-2xl ring-1 ring-black/5">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0A2E1A] via-amber-400 to-[#0A2E1A]" />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-1.5 top-2 flex h-9 w-9 items-center justify-center rounded-full text-[#0A2E1A]/50 hover:bg-black/5 hover:text-[#0A2E1A]"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-7">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0A2E1A] text-amber-300 shadow-md">
            <Bell size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-extrabold leading-tight text-[#0A2E1A]">Never miss an update.</p>
            <p className="mt-1 text-[13px] leading-snug text-[#0A2E1A]/70">
              Get an alert when EboHomes Support replies or your application changes, even when the
              app is closed. We never show private details on your lock screen.
            </p>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0A7A3B] text-sm font-bold text-white shadow-sm transition hover:bg-[#0A7A3B]/90 active:translate-y-px disabled:opacity-60"
          >
            {busy && <Loader2 className="animate-spin" size={14} />}
            Turn on notifications
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="h-11 rounded-xl px-4 text-sm font-semibold text-[#0A2E1A]/70 hover:bg-black/5"
          >
            Not now
          </button>
        </div>
      </div>
    </aside>
  )
}