'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, ClipboardList } from 'lucide-react'
import {
  QUEUE_ORDER, QUEUE_TITLE, dueText, isOverdue, checkAdminReason, checkBudgetAmount, suggestionLine, friendlyError,
  type QueueRow, type Suggestion,
} from '@/lib/remote-inspection'

const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const naira = (n: number) => '₦' + Number(n || 0).toLocaleString()

type Settings = {
  landlord_response_hours: number; escalate_after_hours: number; assign_timeout_hours: number; inspector_accept_minutes: number
  cost_per_inspection: number; enforce_budget: boolean; max_open_per_tenant: number; max_requests_per_30_days: number
  rescheduling_expiry_days: number; visit_grace_hours: number
}

// Remote inspections are tenant-requested and free to tenants. This page never shows the tenant or any report.
export default function AdminRemoteInspectionsPage() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [budget, setBudget] = useState(0)
  const [cost, setCost] = useState(0)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<'offer' | 'back' | null>(null)
  const [sugg, setSugg] = useState<Suggestion[]>([])
  const [pick, setPick] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState('')

  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [draft, setDraft] = useState<Settings | null>(null)

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 6000) }

  const load = useCallback(async (runTimers = false) => {
    // Applying the deadlines first means this screen is never stale, even before a cron job exists.
    if (runTimers) await supabase.rpc('admin_remote_run_timers')
    const { data, error } = await supabase.rpc('admin_remote_queue')
    if (error) { flash(friendlyError(error.message), false); setLoading(false); return }
    setRows((data?.requests ?? []) as QueueRow[])
    setBudget(Number(data?.budget_available ?? 0))
    setCost(Number(data?.cost_per_inspection ?? 0))
    setSettings(data?.settings as Settings)
    setLoading(false)
  }, [])

  useEffect(() => { load(true) }, [load])

  const close = () => { setOpenId(null); setMode(null); setSugg([]); setPick(''); setReason(''); setFormError('') }

  const openOffer = async (r: QueueRow) => {
    close(); setOpenId(r.id); setMode('offer')
    const { data, error } = await supabase.rpc('admin_remote_suggest_inspectors', { p_request: r.id })
    if (error) return setFormError(friendlyError(error.message))
    setSugg((data ?? []) as Suggestion[])
  }

  const submit = async (r: QueueRow) => {
    setFormError('')
    if (mode === 'offer') {
      if (!pick) return setFormError('Choose an inspector.')
      if (r.status === 'offered') { const e = checkAdminReason(reason); if (e) return setFormError(e) }
      setBusy(true)
      const { error } = await supabase.rpc('admin_remote_offer', { p_request: r.id, p_inspector: pick, p_note: reason.trim() || null })
      setBusy(false)
      if (error) return setFormError(friendlyError(error.message))
      flash('Offer sent. The inspector has the accept window to answer.')
    } else {
      const e = checkAdminReason(reason); if (e) return setFormError(e)
      setBusy(true)
      const { error } = await supabase.rpc('admin_remote_return_to_queue', { p_request: r.id, p_reason: reason.trim() })
      setBusy(false)
      if (error) return setFormError(friendlyError(error.message))
      flash('Taken back. The request is in the queue again.')
    }
    close(); load()
  }

  const addBudget = async () => {
    const e = checkBudgetAmount(amount); if (e) return flash(e, false)
    if (source.trim().length < 3) return flash('Say where this money comes from.', false)
    setBusy(true)
    const { error } = await supabase.rpc('admin_remote_add_budget', { p_amount: Number(amount.replace(/,/g, '')), p_note: source.trim() })
    setBusy(false)
    if (error) return flash(friendlyError(error.message), false)
    setAmount(''); setSource(''); flash('Added to the remote inspection budget.'); load()
  }

  const saveSettings = async () => {
    if (!draft) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_remote_save_settings', {
      p_landlord_hours: draft.landlord_response_hours, p_escalate_hours: draft.escalate_after_hours, p_assign_hours: draft.assign_timeout_hours,
      p_accept_minutes: draft.inspector_accept_minutes, p_cost: draft.cost_per_inspection, p_enforce_budget: draft.enforce_budget,
      p_max_open: draft.max_open_per_tenant, p_max_30: draft.max_requests_per_30_days, p_resched_days: draft.rescheduling_expiry_days, p_grace_hours: draft.visit_grace_hours,
    })
    setBusy(false)
    if (error) return flash(friendlyError(error.message), false)
    flash('Settings saved.'); setShowSettings(false); load()
  }

  const num = (k: keyof Settings, label: string) => (
    <label className="text-xs">{label}
      <input className={field} type="number" value={draft ? String(draft[k]) : ''} onChange={(e) => setDraft((d) => (d ? { ...d, [k]: Number(e.target.value) } : d))} />
    </label>
  )

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList size={20} /> Remote inspections</h1>
        <p className="text-sm text-muted-foreground">Tenant-requested inspections. Free to tenants, private reports, never a verification badge. The landlord has already confirmed access for anything that needs an inspector.</p>
      </div>
      {msg && <div role="status" className={`text-sm rounded-lg border px-3 py-2 ${msg.ok ? 'border-border bg-secondary' : 'border-destructive/40 text-destructive'}`}>{msg.text}</div>}

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Remote inspection budget: {naira(budget)} free</p>
            <p className="text-xs text-muted-foreground">
              {cost > 0 ? `Each inspection reserves ${naira(cost)} when offered.` : 'No cost per inspection is set, so the budget check is switched off. Set a cost in Settings to turn it on.'}
              {' '}This is separate from the property verification budget.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => { setDraft(settings); setShowSettings((v) => !v) }}>Settings</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_auto] gap-2">
          <input className={field} inputMode="numeric" placeholder="Amount ₦" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className={field} placeholder="Where the money comes from" value={source} onChange={(e) => setSource(e.target.value)} />
          <Button type="button" onClick={addBudget} disabled={busy}>Add budget</Button>
        </div>
        {showSettings && draft && (
          <div className="border-t border-border pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {num('landlord_response_hours', 'Landlord answers within (working hours)')}
              {num('escalate_after_hours', 'Escalate after (working hours)')}
              {num('assign_timeout_hours', 'Unassigned expires after (working hours)')}
              {num('inspector_accept_minutes', 'Inspector answers within (minutes)')}
              {num('rescheduling_expiry_days', 'Waiting for landlord expires after (days)')}
              {num('visit_grace_hours', 'Visit overdue after (hours)')}
              {num('max_open_per_tenant', 'Open requests per tenant')}
              {num('max_requests_per_30_days', 'Requests per tenant in 30 days')}
              {num('cost_per_inspection', 'Cost per inspection reserved (₦)')}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.enforce_budget} onChange={(e) => setDraft({ ...draft, enforce_budget: e.target.checked })} /> Do not offer an inspection the budget cannot cover
            </label>
            <Button type="button" onClick={saveSettings} disabled={busy}>Save settings</Button>
          </div>
        )}
      </div>

      <Button type="button" variant="outline" onClick={() => load(true)}>Refresh and apply deadlines</Button>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">No open remote inspection requests.</p>}

      {QUEUE_ORDER.map((st) => {
        const list = rows.filter((r) => r.status === st)
        if (list.length === 0) return null
        return (
          <section key={st} className="space-y-2">
            <h2 className="text-sm font-semibold">{QUEUE_TITLE[st]} ({list.length})</h2>
            {list.map((r) => (
              <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold">{r.title ?? 'Property'} <span className="text-xs font-normal text-muted-foreground">{r.ref}</span></p>
                <p className="text-xs text-muted-foreground">{r.location_text}</p>
                <p className="text-xs">Access time: {fmt(r.landlord_time ?? r.scheduled_for)}</p>
                {r.landlord_note && <p className="text-xs text-muted-foreground">Landlord note: {r.landlord_note}</p>}
                {st === 'ready_for_assignment' && (
                  <p className={`text-xs ${isOverdue(r.assign_due_at) ? 'text-destructive' : ''}`}>
                    Expires {dueText(r.assign_due_at)}{r.escalated_at ? ' · escalated' : ''}
                  </p>
                )}
                {st === 'offered' && <p className="text-xs">Offered to {r.inspector_name ?? 'an inspector'} · answer due {dueText(r.offer_due_at)}</p>}
                {st === 'scheduled' && <p className="text-xs">Inspector: {r.inspector_name ?? '—'}{isOverdue(r.scheduled_for) ? ' · visit time has passed' : ''}</p>}

                <div className="flex flex-wrap gap-2 pt-1">
                  {(st === 'ready_for_assignment' || st === 'offered') && (
                    <Button type="button" size="sm" onClick={() => openOffer(r)}>{st === 'offered' ? 'Change inspector' : 'Choose inspector'}</Button>
                  )}
                  {(st === 'offered' || st === 'scheduled') && (
                    <Button type="button" size="sm" variant="outline" onClick={() => { close(); setOpenId(r.id); setMode('back') }}>Take back</Button>
                  )}
                </div>

                {openId === r.id && mode && (
                  <div className="border-t border-border pt-2 space-y-2">
                    {mode === 'offer' && (
                      <>
                        {sugg.length === 0 && <p className="text-xs text-muted-foreground">No active inspector is available for this request.</p>}
                        {sugg.map((s) => (
                          <label key={s.user_id} className="flex items-start gap-2 rounded-lg border border-border p-2">
                            <input type="radio" name={`pick-${r.id}`} checked={pick === s.user_id} onChange={() => setPick(s.user_id)} className="mt-1" />
                            <span>
                              <span className="block text-sm font-medium">{s.name ?? 'Inspector'}{s.areas ? ` · ${s.areas}` : ''}</span>
                              <span className="block text-xs text-muted-foreground">{suggestionLine(s)}</span>
                            </span>
                          </label>
                        ))}
                        <input className={field} placeholder={r.status === 'offered' ? 'Why change the inspector? (required)' : 'Note (optional)'} value={reason} onChange={(e) => setReason(e.target.value)} />
                      </>
                    )}
                    {mode === 'back' && (
                      <input className={field} placeholder="Why take this back? (declined later, no-show, other)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    )}
                    {formError && <p role="alert" className="text-xs text-destructive">{formError}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => submit(r)} disabled={busy}>{mode === 'offer' ? 'Send offer' : 'Take back'}</Button>
                      <Button type="button" size="sm" variant="outline" onClick={close}>Close</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
