'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileText, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LANDLORD_STATUS_LABEL, validateRespond, type PayoutStatus } from '@/lib/payout'

const naira = (n: number | string) => '\u20A6' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '')
const field = 'w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function PayoutsPage() {
  const router = useRouter()
  const [items, setItems] = useState<any[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const r = await api('/api/payouts')
    if (!r.ok) { setLoadErr(r.j?.error ?? 'Could not load this page.'); return }
    setItems(r.j.items)
  }, [router])
  useEffect(() => { load() }, [load])

  if (loadErr) return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{loadErr}</p>
      <button onClick={load} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">Try again</button>
    </div>)
  if (!items) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Your payouts</h1>
        <p className="text-sm text-muted-foreground">Rent that EboHomes pays to your payout account.</p>
        <a href="/handovers" className="mt-1 inline-block text-sm font-semibold text-primary underline">Key handover confirmations</a>
      </div>
      {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No payouts yet. A payout appears here after a tenant payment is verified and processed.</p>
        : <ul className="space-y-3">{items.map((p) => <Item key={p.id} p={p} onChanged={load} />)}</ul>}
    </div>
  )
}

function Item({ p, onChanged }: { p: any; onChanged: () => void }) {
  const [mode, setMode] = useState<null | 'dispute'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const respond = async (action: 'confirm' | 'dispute') => {
    if (busy) return
    const v = validateRespond(action, note)
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/payouts', { method: 'POST', body: JSON.stringify({ id: p.id, action, note }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Could not send your answer.'); return }
    onChanged()
  }
  const viewProof = async () => { const r = await api(`/api/payouts/proof?id=${p.id}`); if (r.j?.url) window.open(r.j.url, '_blank', 'noopener'); else setMsg('Could not open the proof.') }
  const paid = p.status === 'paid' || p.status === 'confirmed' || p.status === 'disputed'

  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>{naira(p.amount)} <span className="text-xs font-normal text-muted-foreground">{p.payment_type}</span></b>
        <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold">{LANDLORD_STATUS_LABEL[p.status as PayoutStatus]}</span>
      </div>
      <p className="text-xs text-muted-foreground">{p.listing_title ?? 'Property'} · {p.tenancy_code}</p>
      <p className="text-xs text-muted-foreground">To {p.bank_name} · {p.masked} · {p.account_name}</p>
      {p.hold_reason && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">On hold: {p.hold_reason}. <a href={`/tenancies/${p.tenancy_id}/handover`} className="font-semibold underline">Open handover</a></p>}

      {paid && (
        <div className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
          <p className="flex items-center gap-2 font-bold"><Receipt size={16} aria-hidden /> Payout receipt</p>
          <p className="font-mono text-base font-bold">{p.payout_code}</p>
          <p className="text-xs">Sent {when(p.paid_at)} · bank reference {p.bank_reference}</p>
          {p.has_proof && <button type="button" onClick={viewProof} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-emerald-400 px-3 text-xs font-semibold"><FileText size={14} aria-hidden /> View proof of transfer</button>}
        </div>)}

      {p.status === 'paid' && !mode && (
        <div className="space-y-2">
          <p className="text-xs">Check your bank account first. Only confirm if the money has arrived.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button disabled={busy} onClick={() => respond('confirm')} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}I received this money</button>
            <button onClick={() => setMode('dispute')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">I did not receive it</button>
          </div>
        </div>)}

      {p.status === 'paid' && mode === 'dispute' && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label htmlFor={`dn-${p.id}`} className="text-xs font-semibold">What is wrong? (required)</label>
          <textarea id={`dn-${p.id}`} rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond('dispute')} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Send dispute</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Back</button>
          </div>
        </div>)}

      {p.status === 'disputed' && p.landlord_note && <p className="text-xs font-medium text-red-800">Your note: {p.landlord_note}</p>}
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
    </li>
  )
}