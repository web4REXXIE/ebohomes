'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { notifyPreferencesChanged, playNotificationSound } from '@/lib/notification-sound'
import { NotificationProvider } from '@/components/notification-provider'

type Prefs = {
  in_app_enabled: boolean
  messages: boolean
  applications: boolean
  listings: boolean
  renewals: boolean
  sound_enabled: boolean
}

const DEFAULTS: Prefs = {
  in_app_enabled: true,
  messages: true,
  applications: true,
  listings: true,
  renewals: true,
  sound_enabled: false,
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function Row({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  )
}

export default function NotificationPreferencesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
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
        .from('notification_preferences')
        .select('in_app_enabled, messages, applications, listings, renewals, sound_enabled')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Failed to load preferences:', error.message)
        setLoadError(true)
      } else if (data) {
        setPrefs(data as Prefs)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = async (key: keyof Prefs, value: boolean) => {
    if (!userId) return
    const previous = prefs
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setStatus('saving')

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: userId, ...next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Failed to save preferences:', error.message)
      setPrefs(previous)
      setStatus('error')
      return
    }
    setStatus('saved')
    // Tell the notification system straight away (sound on/off)
    notifyPreferencesChanged()
  }

  const saving = status === 'saving'

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <Link
        href="/notifications"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft size={14} /> Back to notifications
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-1">Notification settings</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Choose what you want to be told about. Changes apply to new notifications only.
      </p>

      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : loadError ? (
        <p className="text-sm text-muted-foreground">
          Could not load your settings. Please refresh and try again.
        </p>
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg px-4 divide-y divide-border">
            <Row
              title="In-app notifications"
              description="Turn this off to stop getting new notifications. The ones you already have stay in your inbox."
              checked={prefs.in_app_enabled}
              onChange={(v) => update('in_app_enabled', v)}
              disabled={saving}
            />
            <Row
              title="Messages"
              description="When someone sends you a message."
              checked={prefs.messages}
              onChange={(v) => update('messages', v)}
              disabled={saving || !prefs.in_app_enabled}
            />
            <Row
              title="Applications"
              description="New applications and status changes."
              checked={prefs.applications}
              onChange={(v) => update('applications', v)}
              disabled={saving || !prefs.in_app_enabled}
            />
            <Row
              title="Listings"
              description="When the status of a listing changes."
              checked={prefs.listings}
              onChange={(v) => update('listings', v)}
              disabled={saving || !prefs.in_app_enabled}
            />
            <Row
              title="Renewals"
              description="Renewal offers and responses."
              checked={prefs.renewals}
              onChange={(v) => update('renewals', v)}
              disabled={saving || !prefs.in_app_enabled}
            />
            <Row
              title="Notification sound"
              description="Play a short chime when a new notification arrives while EboHomes is open. Your browser may stay silent until you have tapped the page."
              checked={prefs.sound_enabled}
              onChange={(v) => update('sound_enabled', v)}
              disabled={saving || !prefs.in_app_enabled}
            />
          </div>

          <button
            type="button"
            onClick={playNotificationSound}
            className="mt-3 text-sm text-primary font-medium"
          >
            Play test sound
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            No sound? Check your phone volume and silent mode. Sound only plays while EboHomes is
            open in your browser.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Security alerts about your account, such as changes to your bank, phone or
            email, are always on.
          </p>

          <p className="mt-2 h-4 text-xs text-muted-foreground" aria-live="polite">
            {status === 'saving' ? 'Saving...' : null}
            {status === 'saved' ? 'Saved' : null}
            {status === 'error' ? 'Could not save. Please try again.' : null}
          </p>
        </>
      )}
    </div>
  )
}