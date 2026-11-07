'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, Wallet } from 'lucide-react'
import { checkAdminReason, checkBudgetAmount, friendlyError } from '@/lib/remote-inspection'

const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const naira = (n: number | string | null | undefined) => '₦' + Number(n || 0).toLocaleString()
const SERVICE: Record<string, string> = { verification: 'Property verification', remote: 'Remote inspection' }
const METHODS: [string, string][] = [['bank_transfer', 'Bank transfer'], ['mobile_money', 'Mobile money'], ['cash', 'Cash'], ['other', 'Other']]

type Ready = { job_id: string; service_type: string; ref?: string | null; title?: string | null; inspector_name?: string | null; verdict?: string | null; done_at?: string | null; suggested_amount: number; involved: boolean }
type Payout = {
  id: string; service_type: string; inspector_name?: string | null; ref?: string | null; title?: string | null; amount: number; transport_amount: number
  total_amount: number; status: 'payable' | 'paid' | 'void'; method?: string | null; reference?: string | null; paid_at?: string | null; approved_at: string; void_reason?: string | null
}
type Overview = {
  finance: { remote: { allocated: number; spent: number; available: number }; verification: { allocated: number; spent: number } }
  ready: Ready[]; payouts: Payout[]
}

// Manual inspector payouts. Two budgets that never mix. Inspectors are paid for valid completed work, never for a PASS.
// Nothing here touches a tenant's money, rent or landlord payouts.
export default function InspectionPayoutsPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [amounts, setAmounts] = useState<Record<string, { amount: string; transport: string }>>({})
  const [payId, setPayId] = useState<string | null>(null)
  const [pay, setPay] = useState({ method: 'bank_transfer', reference: '', destination: '' })
  const [voidId, setVoidId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [bAmount, setBAmount] = useState<Record<string, string>>({ remote: '', verification: '' })
  const [bSource, setBSource] = useState<Record<string, string>>({ remote: '', verification: '' })

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 6000) }

  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('admin_inspection_payouts_overview')
    if (error) flash(friendlyError(error.message), false)
    else setData(d as Overview)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { flash(friendlyError(error.message), false); return false }
    flash(ok); await load(); return true
  }

  async function approve(r: Ready) {
    const a = amounts[r.job_id] ?? { amount: String(r.suggested_amount || ''), transport: '' }
    const bad = checkBudgetAmount(a.amount)
    if (bad) { flash(bad, false); return }
    const tr = a.transport.trim() ? Number(a.transport.replace(/,/g, '')) : 0
    if (!Number.isFinite(tr) || tr < 0) { flash('Enter a valid transport amount, or leave it empty.', false); return }
    await run(() => supabase.rpc('admin_inspection_record_payout', { p_job: r.job_id, p_amount: Number(a.amount.replace(/,/g, '')), p_transport: tr, p_note: null }), 'Payout approved. Pay the inspector, then record the payment.')
  }

  async function markPaid(id: string) {
    if (pay.reference.trim().length < 3) { flash('Enter the payment reference.', false); return }
    const ok = await run(() => supabase.rpc('admin_inspection_mark_paid', {
      p_payout: id, p_method: pay.method, p_reference: pay.reference.trim(), p_paid_at: new Date().toISOString(), p_destination: pay.destination.trim() || null,
    }), 'Payment recorded.')
    if (ok) { setPayId(null); setPay({ method: 'bank_transfer', reference: '', destination: '' }) }
  }

  async function voidPayout(id: string) {
    const bad = checkAdminReason(reason)
    if (bad) { flash(bad, false); return }
    const ok = await run(() => supabase.rpc('admin_inspection_void_payout', { p_payout: id, p_reason: reason.trim() }), 'Payout cancelled.')
    if (ok) { setVoidId(null); setReason('') }
  }

  async function addBudget(kind: 'remote' | 'verification') {
    const bad = checkBudgetAmount(bAmount[kind])
    if (bad) { flash(bad, false); return }
    const fn = kind === 'remote' ? 'admin_remote_add_budget' : 'admin_verification_add_budget'
    const ok = await run(() => supabase.rpc(fn, { p_amount: Number(bAmount[kind].replace(/,/g, '')), p_note: bSource[kind].trim() }), 'Budget added.')
    if (ok) { setBAmount({ ...bAmount, [kind]: '' }); setBSource({ ...bSource, [kind]: '' }) }
  }

  if (loading) return <Loader2 className="animate-spin text-muted-foreground m-6" aria-label="Loading" />
  const f = data?.finance

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Wallet size={20} /> Inspector payouts</h1>
        <p className="text-sm text-muted-foreground">
          Inspectors are paid for valid completed work, not for a PASS. You pay by hand, then record the payment here. Property verification and remote inspections keep separate budgets.
        </p>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`text-sm rounded-lg border px-3 py-2 ${msg.ok ? 'border-border bg-secondary' : 'border-destructive/40 text-destructive'}`}>{msg.text}</div>}

      {f && (['verification', 'remote'] as const).map((k) => {
        const b = f[k]
        const left = k === 'remote' ? f.remote.available : b.allocated - b.spent
        return (
          <div key={k} className="bg-card border border-border rounded-lg p-3 text-sm space-y-2">
            <p className="font-semibold">{SERVICE[k]} budget</p>
            <p>Allocated {naira(b.allocated)} · paid out {naira(b.spent)} · <b>{k === 'remote' ? 'free after reservations' : 'left'} {naira(left)}</b></p>
            <div className="grid grid-cols-2 gap-2">
              <input className={field} inputMode="decimal" placeholder="Amount to add" value={bAmount[k]} onChange={(e) => setBAmount({ ...bAmount, [k]: e.target.value })} />
              <input className={field} maxLength={300} placeholder="Where the money comes from" value={bSource[k]} onChange={(e) => setBSource({ ...bSource, [k]: e.target.value })} />
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => addBudget(k)}>Add to budget</Button>
          </div>
        )
      })}

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">Completed work waiting for a payout ({data?.ready.length ?? 0})</h2>
        {data?.ready.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting.</p>}
        {data?.ready.map((r) => {
          const a = amounts[r.job_id] ?? { amount: r.suggested_amount ? String(r.suggested_amount) : '', transport: '' }
          return (
            <div key={r.job_id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-2">
              <p className="font-semibold">{r.title ?? 'Property'} <span className="text-xs font-normal text-muted-foreground">{r.ref ?? SERVICE[r.service_type]}</span></p>
              <p className="text-xs text-muted-foreground">{SERVICE[r.service_type]} · inspector {r.inspector_name ?? '—'} · verdict {(r.verdict ?? '').toUpperCase()} · done {fmt(r.done_at)}</p>
              {r.involved ? <p className="text-xs text-amber-800">You are part of this work, so another administrator must approve its payout.</p> : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={field} inputMode="decimal" placeholder="Inspection amount (₦)" value={a.amount} onChange={(e) => setAmounts({ ...amounts, [r.job_id]: { ...a, amount: e.target.value } })} />
                    <input className={field} inputMode="decimal" placeholder="Transport (₦, optional)" value={a.transport} onChange={(e) => setAmounts({ ...amounts, [r.job_id]: { ...a, transport: e.target.value } })} />
                  </div>
                  <Button size="sm" disabled={busy} onClick={() => approve(r)}>Approve payout</Button>
                </>
              )}
            </div>
          )
        })}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">Payout records</h2>
        {data?.payouts.length === 0 && <p className="text-sm text-muted-foreground">No payouts yet.</p>}
        {data?.payouts.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-2">
            <p className="font-semibold">{naira(p.total_amount)} <span className="text-xs font-normal text-muted-foreground">({naira(p.amount)} + {naira(p.transport_amount)} transport)</span></p>
            <p className="text-xs text-muted-foreground">
              {SERVICE[p.service_type]} · {p.inspector_name ?? '—'} · {p.title ?? ''} {p.ref ?? ''} · {p.status.toUpperCase()}
              {p.status === 'paid' ? ` · ${p.method} · ref ${p.reference} · ${fmt(p.paid_at)}` : ` · approved ${fmt(p.approved_at)}`}
              {p.status === 'void' && p.void_reason ? ` · ${p.void_reason}` : ''}
            </p>
            {p.status === 'payable' && (
              <div className="space-y-2">
                {payId === p.id ? (
                  <div className="space-y-2">
                    <select className={field} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                      {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input className={field} maxLength={100} placeholder="Payment reference (required)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                    <input className={field} maxLength={200} placeholder="Account or number paid to (optional)" value={pay.destination} onChange={(e) => setPay({ ...pay, destination: e.target.value })} />
                    <Button size="sm" disabled={busy} onClick={() => markPaid(p.id)}>Record payment</Button>
                  </div>
                ) : voidId === p.id ? (
                  <div className="space-y-2">
                    <input className={field} maxLength={300} placeholder="Why cancel this payout? (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <Button size="sm" variant="outline" className="text-destructive border-destructive" disabled={busy} onClick={() => voidPayout(p.id)}>Confirm cancel</Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setPayId(p.id); setVoidId(null) }}>I have paid this</Button>
                    <Button size="sm" variant="outline" onClick={() => { setVoidId(p.id); setPayId(null) }}>Cancel payout</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}￼Enter file contents here
 
