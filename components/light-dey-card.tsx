'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EMPTY_LIGHT, lightHeadline, parseLight, reportsLine, timeAgo, type LightInfo } from '@/lib/light-status'

// "Light dey?" for one building. Everyone sees the status; residents can report.
// If the database function is missing or fails, the card simply does not show and the page works as before.
export function LightDeyCard({ estateId, isResident }: { estateId: string; isResident: boolean }) {
  const [info, setInfo] = useState<LightInfo>(EMPTY_LIGHT)
  const [available, setAvailable] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('estate_light_status', { p_estate: estateId })
    if (error) return
    setInfo(parseLight(data))
    setAvailable(true)
  }, [estateId])

  useEffect(() => {
    load()
  }, [load])

  const report = async (status: 'on' | 'off') => {
    if (sending) return
    setSending(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('report_light', { p_estate: estateId, p_status: status })
    setSending(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not send it. Try again.' })
      return
    }
    setInfo(parseLight(data))
    setMsg({ ok: true, text: 'Thanks, your neighbours can see it.' })
  }

  if (!available) return null

  const tone =
    info.status === 'on'
      ? 'border-success bg-success-soft text-success'
      : info.status === 'off'
        ? 'border-danger bg-danger-soft text-danger'
        : 'border-border bg-card text-foreground'
  const icon = info.status === 'on' ? '💡' : info.status === 'off' ? '🕯️' : '❔'
  const when = timeAgo(info.updatedAt)

  return (
    <section aria-label="Light status" className="mt-4 rounded-card border border-border bg-card p-3">
      <div className={`flex items-center gap-3 rounded-md border p-3 ${tone}`} role="status">
        <span aria-hidden className="text-2xl">{icon}</span>
        <div>
          <p className="text-base font-bold">{lightHeadline(info.status)}</p>
          <p className="text-xs">{when ? `Updated ${when}. ` : ''}{reportsLine(info)}</p>
        </div>
      </div>

      {isResident && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-muted-foreground">Help your neighbours. How is the light right now?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => report('on')}
              className="focus-ring min-h-12 rounded-button border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
            >
              💡 Light dey
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => report('off')}
              className="focus-ring min-h-12 rounded-button border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
            >
              🕯️ No light
            </button>
          </div>
          {msg && (
            <p role="status" className={`mt-2 rounded-card border p-3 text-sm ${msg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
              {msg.text}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
