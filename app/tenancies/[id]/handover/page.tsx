'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Circle, XCircle, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PAYOUT_STATE_TEXT, partyState, validateAction, type PayoutState } from '@/lib/handover'

const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '')
const field = 'w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function HandoverPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [h, setH] = useState<any>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [ticked, setTicked] = useState(false)
  const [mode, setMode] = useState<null | 'dispute'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const r = await api(`/api/handover?tenancy=${id}`)
    if (!r.ok) { setLoadErr(r.j?.error ?? 'Could not load this page.'); return }
    setH(r.j)
  }, [id, router])
  useEffect(() => { load() }, [load])

  const send = async (action: 'confirm' | 'dispute') => {
    if (busy) return
    const v = validateAction(action, note)
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/handover', { method: 'POST', body: JSON.stringify({ tenancy_id: id, action, note }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Could not record this.'); return }
    setMode(null); setNote(''); setTicked(false)
    await load()
  }

  if (loadErr) return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{loadErr}</p>
      <button onClick={load} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">Try again</button>
    </div>)
  if (!h) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>
  if (!h.found) return <div className="mx-auto max-w-lg p-4"><p className="rounded-lg border border-border bg-card p-4 text-sm">We could not find this tenancy on your account.</p></div>

  const isTenant = h.role === 'tenant'
  const disputed = h.status === 'disputed'
  const done = h.status === 'completed'
  const mineDone = !!h.my_confirmed_at
  const otherLabel = isTenant ? 'The landlord' : 'The tenant'
  const claim = isTenant ? 'I received the keys and the property as agreed.' : 'I handed over the keys and the property as agreed.'
  const steps: { label: string; state: 'done' | 'current' | 'todo' | 'bad' }[] = [
    { label: 'EboHomes verified the payment', state: h.eligible ? 'done' : 'current' },
    { label: 'You confirm the handover', state: disputed ? 'bad' : mineDone ? 'done' : h.eligible ? 'current' : 'todo' },
    { label: `${otherLabel} confirms the handover`, state: disputed ? 'bad' : h.other_confirmed_at ? 'done' : mineDone ? 'current' : 'todo' },
    { label: 'Handover complete', state: done ? 'done' : disputed ? 'bad' : 'todo' },
  ]
  const tone = disputed ? 'border-red-300 bg-red-50 text-red-900' : done ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Key handover</h1>
        <p className="text-sm text-muted-foreground">{h.listing_title}{h.location ? ` · ${h.location}` : ''} · {h.tenancy_code}</p>
      </div>

      <ol className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Handover progress">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            {s.state === 'done' ? <CheckCircle2 size={20} className="text-emerald-700" aria-hidden />
              : s.state === 'bad' ? <XCircle size={20} className="text-red-700" aria-hidden />
              : s.state === 'current' ? <Loader2 size={20} className="animate-spin text-amber-700" aria-hidden />
              : <Circle size={20} className="text-muted-foreground" aria-hidden />}
            <span className={s.state === 'todo' ? 'text-muted-foreground' : 'font-semibold text-foreground'}>{s.label}</span>
          </li>))}
      </ol>

      <div className={`space-y-1 rounded-lg border p-3 text-sm ${tone}`}>
        <p className="font-bold">{partyState(h.status, h.my_confirmed_at, h.other_confirmed_at)}</p>
        {h.my_confirmed_at && <p className="text-xs">You confirmed on {when(h.my_confirmed_at)}.</p>}
        {h.other_confirmed_at && <p className="text-xs">{otherLabel} confirmed on {when(h.other_confirmed_at)}.</p>}
        <p className="text-xs">{PAYOUT_STATE_TEXT[h.payout_state as PayoutState]}{h.hold_reason ? `: ${h.hold_reason}.` : '.'}</p>
        {disputed && h.disputed_by_me && h.dispute_note && <p className="text-xs">Your note: {h.dispute_note}</p>}
        {disputed && !h.disputed_by_me && <p className="text-xs">The other party raised a concern. EboHomes is reviewing it.</p>}
        {done && h.completed_via === 'admin_review' && <p className="text-xs">EboHomes completed this handover after reviewing a dispute.{h.resolution_note ? ` ${h.resolution_note}` : ''}</p>}
      </div>

      {!h.eligible && <p className="rounded-lg bg-secondary p-3 text-sm">The handover can be confirmed after EboHomes has verified the first payment for this tenancy.</p>}

      {h.eligible && !done && !disputed && !mineDone && !mode && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>Only confirm after the handover has really happened. {isTenant ? 'Confirming tells EboHomes you have the keys.' : 'Confirming tells EboHomes the tenant has the keys.'} Neither of you can confirm for the other.</span>
          </p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" checked={ticked} onChange={(e) => setTicked(e.target.checked)} /> {claim}</label>
          {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{msg}</p>}
          <button disabled={busy || !ticked} onClick={() => send('confirm')} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-50">
            {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Saving...</> : 'Confirm the handover'}</button>
          <button onClick={() => { setMode('dispute'); setMsg(null) }} className="min-h-12 w-full rounded-xl border border-red-300 text-sm font-semibold text-red-800">There is a problem with the handover</button>
        </div>)}

      {h.eligible && !done && !disputed && mineDone && !mode && (
        <button onClick={() => { setMode('dispute'); setMsg(null) }} className="min-h-12 w-full rounded-xl border border-red-300 text-sm font-semibold text-red-800">I want to raise a problem</button>)}

      {mode === 'dispute' && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label htmlFor="dn" className="text-sm font-semibold">What is wrong? (required)</label>
          <textarea id="dn" rows={4} maxLength={500} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-muted-foreground">The landlord payout stays on hold until EboHomes reviews this.</p>
          {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{msg}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => send('dispute')} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Send to EboHomes</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Back</button>
          </div>
        </div>)}

      <Link href="/handovers" className="flex min-h-12 items-center justify-center rounded-xl border border-border text-sm font-semibold">All my handovers</Link>
    </div>
  )
}