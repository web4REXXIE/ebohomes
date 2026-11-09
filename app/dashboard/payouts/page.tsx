'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, FileText, Receipt, Wallet, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LANDLORD_STATUS_LABEL, validateRespond, type PayoutStatus } from '@/lib/payout'
import { ToneChip } from '@/components/dashboard-ui'

const naira = (n: number | string) => '\u20A6' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '')
const field = 'focus-ring w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
const btnPrimary = 'focus-ring flex min-h-12 flex-1 items-center justify-center gap-2 rounded-button bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50'
const btnOutline = 'focus-ring min-h-12 flex-1 rounded-button border border-border bg-card px-4 font-semibold text-foreground disabled:opacity-50'

const STATUS_TONE: Record<PayoutStatus, 'green' | 'blue' | 'amber' | 'red' | 'grey'> = {
  pending: 'grey',
  approved: 'blue',
  paid: 'amber',
  confirmed: 'green',
  disputed: 'red',
  cancelled: 'grey',
}

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
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <p role="alert" className="rounded-card border border-danger/30 bg-danger-soft p-3 text-sm font-medium text-danger">{loadErr}</p>
      <button onClick={load} className="focus-ring min-h-12 w-full rounded-button bg-primary font-bold text-primary-foreground">Try again</button>
    </div>)
  if (!items) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>

  const needsAction = items.filter((p) => p.status === 'paid').length

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Your payouts</h1>
        <p className="text-sm text-muted-foreground">Rent that EboHomes pays to your payout account.</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <Link href="/dashboard/payout-account" className="focus-ring text-primary underline">Payout account</Link>
          <Link href="/handovers" className="focus-ring text-primary underline">Key handover confirmations</Link>
        </div>
      </div>

      {needsAction > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-soft p-3 text-sm font-medium text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{needsAction === 1 ? '1 payout has been sent and is waiting for you.' : `${needsAction} payouts have been sent and are waiting for you.`} Check your bank, then confirm below.</span>
        </p>)}

      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-border p-8 text-center">
          <Wallet size={28} className="mx-auto mb-2 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No payouts yet. A payout appears here after a tenant payment is verified and processed.</p>
        </div>
      ) : <ul className="space-y-3">{items.map((p) => <Item key={p.id} p={p} onChanged={load} />)}</ul>}
    </div>
  )
}

function Item({ p, onChanged }: { p: any; onChanged: () => void }) {
  const [mode, setMode] = useState<null | 'confirm' | 'dispute'>(null)
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
  const status = p.status as PayoutStatus

  return (
    <li className="space-y-3 rounded-card border border-border bg-card p-4 text-sm shadow-rest">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold text-foreground">{naira(p.amount)}</p>
          <p className="text-xs text-muted-foreground">{p.payment_type}</p>
        </div>
        <ToneChip tone={STATUS_TONE[status] ?? 'grey'}>{LANDLORD_STATUS_LABEL[status] ?? p.status}</ToneChip>
      </div>

      <dl className="space-y-1 text-xs text-muted-foreground">
        <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">Property</dt><dd className="min-w-0 break-words">{p.listing_title ?? 'Property'} · {p.tenancy_code}</dd></div>
        <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">Paid to</dt><dd className="min-w-0 break-words">{p.bank_name} · {p.masked} · {p.account_name}</dd></div>
      </dl>

      {p.hold_reason && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
          <b>On hold:</b> {p.hold_reason}. <Link href={`/tenancies/${p.tenancy_id}/handover`} className="focus-ring font-semibold underline">Open handover</Link>
        </p>)}

      {paid && (
        <div className="space-y-1 rounded-lg border border-success/30 bg-success-soft p-3 text-success">
          <p className="flex items-center gap-2 font-bold"><Receipt size={16} aria-hidden /> Payout receipt</p>
          <p className="font-mono text-base font-bold">{p.payout_code}</p>
          <p className="text-xs">Sent {when(p.paid_at)} · bank reference {p.bank_reference}</p>
          {p.has_proof && <button type="button" onClick={viewProof} className="focus-ring mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-success/40 px-3 text-xs font-semibold"><FileText size={14} aria-hidden /> View proof of transfer</button>}
        </div>)}

      {p.status === 'paid' && !mode && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Check your bank account first. Only confirm if the money has arrived.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => { setMsg(null); setMode('confirm') }} className={btnPrimary}>I received this money</button>
            <button onClick={() => { setMsg(null); setMode('dispute') }} className="focus-ring min-h-12 flex-1 rounded-button border border-danger/40 px-4 font-semibold text-danger">I did not receive it</button>
          </div>
        </div>)}

      {p.status === 'paid' && mode === 'confirm' && (
        <div role="group" aria-label="Confirm you received this payout" className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold text-foreground">Confirm that {naira(p.amount)} is in your account?</p>
          <p className="text-xs text-muted-foreground">This tells EboHomes the payout is complete.</p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond('confirm')} className={btnPrimary}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Yes, it arrived</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className={btnOutline}>Not yet</button>
          </div>
        </div>)}

      {p.status === 'paid' && mode === 'dispute' && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label htmlFor={`dn-${p.id}`} className="text-xs font-semibold text-foreground">What is wrong? (required)</label>
          <textarea id={`dn-${p.id}`} rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond('dispute')} className={btnPrimary}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Send dispute</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className={btnOutline}>Back</button>
          </div>
        </div>)}

      {p.status === 'disputed' && p.landlord_note && <p className="text-xs font-medium text-danger">Your note: {p.landlord_note}</p>}
      {msg && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-danger">{msg}</p>}
    </li>
  )
}
