'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Smartphone, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  disablePush,
  enablePush,
  getCurrentSubscription,
  getPermission,
  getPushSupport,
  removeDevice,
  sendTestPush,
} from '@/lib/push-client'

type Device = {
  id: string
  endpoint: string
  device_label: string | null
  created_at: string
  last_success_at: string | null
}

type Status = 'loading' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on'

function formatDate(value: string | null): string {
  if (!value) return 'never'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PushNotificationSettings({
  userId,
  inAppEnabled,
}: {
  userId: string
  inAppEnabled: boolean
}) {
  const [status, setStatus] = useState<Status>('loading')
  const [devices, setDevices] = useState<Device[]>([])
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const support = getPushSupport()
    if (support === 'ios-needs-install') return setStatus('ios-install')
    if (support === 'unsupported') return setStatus('unsupported')

    const { data } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, device_label, created_at, last_success_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const list = (data ?? []) as Device[]
    setDevices(list)

    if (getPermission() === 'denied') return setStatus('blocked')

    const sub = await getCurrentSubscription()
    setCurrentEndpoint(sub?.endpoint ?? null)
    const registered = !!sub && list.some((d) => d.endpoint === sub.endpoint)
    setStatus(getPermission() === 'granted' && registered ? 'on' : 'off')
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onEnable = async () => {
    setBusy(true)
    setMessage(null)
    const result = await enablePush(userId)
    if (!result.ok) setMessage(result.message)
    await refresh()
    setBusy(false)
  }

  const onDisable = async () => {
    setBusy(true)
    setMessage(null)
    const result = await disablePush(userId)
    if (!result.ok) setMessage(result.message)
    await refresh()
    setBusy(false)
  }

  const onTest = async () => {
    setBusy(true)
    const result = await sendTestPush()
    setMessage(result.message)
    setBusy(false)
  }

  const onRemove = async (d: Device) => {
    setBusy(true)
    setMessage(null)
    const ok = await removeDevice(userId, d.id, d.endpoint)
    if (!ok) setMessage('Could not remove that device. Please try again.')
    await refresh()
    setBusy(false)
  }

  return (
    <section className="mt-6" aria-labelledby="push-heading">
      <h2 id="push-heading" className="text-base font-bold text-foreground mb-1">
        Push notifications
      </h2>
      <p className="text-sm text-muted-foreground mb-3">
        Get alerts on this device even when EboHomes is closed.
      </p>

      <div className="bg-card border border-border rounded-lg p-4">
        {status === 'loading' && <Loader2 className="animate-spin text-primary" size={20} />}

        {status === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            This browser does not support push notifications. Try the latest Chrome, Edge,
            Firefox or Samsung Internet. You will still see everything in your EboHomes inbox.
          </p>
        )}

        {status === 'ios-install' && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              On iPhone and iPad, push notifications only work after you add EboHomes to your
              Home Screen (iOS 16.4 or newer).
            </p>
            <p>
              In Safari, tap the Share button, choose <strong>Add to Home Screen</strong>, then
              open EboHomes from your Home Screen and come back to this page.
            </p>
          </div>
        )}

        {status === 'blocked' && (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <BellOff size={18} className="mt-0.5 shrink-0" />
            <p>
              Notifications are blocked for EboHomes in this browser. To turn them on, open your
              browser&apos;s site settings for EboHomes, allow Notifications, then return here.
            </p>
          </div>
        )}

        {status === 'off' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Bell size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Push is off on this device</p>
                <p>
                  We need your permission to show alerts on this device, for example when a
                  landlord answers your application or EboHomes Support replies. Your browser
                  will ask you to confirm after you tap the button.
                </p>
                <p>Alerts never show private details such as amounts or message text.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onEnable}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="animate-spin" size={14} />}
              Enable push notifications
            </button>
          </div>
        )}

        {status === 'on' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Bell size={18} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Push is on for this device</p>
                <p>New alerts will appear here even when EboHomes is closed.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onTest}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
              >
                Send test notification
              </button>
              <button
                type="button"
                onClick={onDisable}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground disabled:opacity-50"
              >
                Turn off on this device
              </button>
            </div>
          </div>
        )}

        {!inAppEnabled && (status === 'on' || status === 'off') && (
          <p className="mt-3 text-xs text-muted-foreground">
            In-app notifications are switched off above, so there is nothing new to push. Push
            alerts follow the same choices you make in the list above.
          </p>
        )}

        {message && (
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            {message}
          </p>
        )}
      </div>

      {devices.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-foreground mb-2">Your devices</h3>
          <ul className="bg-card border border-border rounded-lg divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Smartphone size={16} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {d.device_label || 'Unknown device'}
                      {d.endpoint === currentEndpoint ? ' (this device)' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(d.created_at)} · Last delivered {formatDate(d.last_success_at)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(d)}
                  disabled={busy}
                  aria-label={`Remove ${d.device_label || 'device'}`}
                  className="shrink-0 rounded-md p-2 text-muted-foreground disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}