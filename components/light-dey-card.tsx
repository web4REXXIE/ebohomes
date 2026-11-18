'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EMPTY_LIGHT, lightHeadline, parseLight, reportsLine, timeAgo, type LightInfo, type LightState } from '@/lib/light-status'

// "Light dey?" for one building. Everyone sees the status; residents can report.
// If the database function is missing or fails, the card simply does not show and the page works as before.
type AskInfo = { open: boolean; mine: boolean; canAsk: boolean }
const NO_ASK: AskInfo = { open: false, mine: false, canAsk: false }

export function LightDeyCard({ estateId, isResident, onStatus }: { estateId: string; isResident: boolean; onStatus?: (s: LightState) => void }) {
  const [info, setInfo] = useState<LightInfo>(EMPTY_LIGHT)
  const [ask, setAsk] = useState<AskInfo>(NO_ASK)
  const [available, setAvailable] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('estate_light_status', { p_estate: estateId })
    if (error) return
    setInfo(parseLight(data))
    setAvailable(true)
  }, [estateId])

  // Is a neighbour asking? Can I ask? Only residents get an answer, so a failure just hides the ask buttons.
  const loadAsk = useCallback(async () => {
    if (!isResident) {
      setAsk(NO_ASK)
      return
    }
    const { data, error } = await supabase.rpc('estate_light_ask', { p_estate: estateId })
    if (error || typeof data !== 'object' || data === null) return
    const r = data as Record<string, unknown>
    setAsk({ open: r.open === true, mine: r.mine === true, canAsk: r.can_ask === true })
  }, [estateId, isResident])

  useEffect(() => {
    load()
    loadAsk()
    const t = setInterval(() => {
      load()
      loadAsk()
    }, 60000)
    return () => clearInterval(t)
  }, [load, loadAsk])

  // Lets the building picture glow when neighbours say the light is on.
  useEffect(() => {
    onStatus?.(info.status)
  }, [info.status, onStatus])

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
    loadAsk()
  }

  const askNeighbours = async () => {
    if (sending) return
    setSending(true)
    setMsg(null)
    const { error } = await supabase.rpc('ask_light', { p_estate: estateId })
    setSending(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not ask. Try again.' })
      return
    }
    setMsg({ ok: true, text: 'Asked. Your neighbours have been told. No names are shown.' })
    loadAsk()
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
          {ask.open && !ask.mine && (
            <p role="status" className="mb-2 rounded-card border border-primary/40 bg-secondary p-3 text-sm font-semibold text-foreground">
              A neighbour is asking: Light dey? Tap your answer below.
            </p>
          )}
          {ask.open && ask.mine && (
            <p role="status" className="mb-2 rounded-card border border-border bg-secondary p-3 text-sm text-foreground">
              You asked. We will show the answer here as soon as a neighbour replies.
            </p>
          )}
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
          {ask.canAsk && (
            <button
              type="button"
              disabled={sending}
              onClick={askNeighbours}
              className="focus-ring mt-2 min-h-12 w-full rounded-button border border-primary bg-card px-3 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-50"
            >
              ❓ Ask neighbours: Light dey?
            </button>
          )}
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
