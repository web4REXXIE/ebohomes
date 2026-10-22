'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, naira } from '@/lib/case-status'
import { isRenewalStage, renewalSteps, stageInfo, validateOffer, type RenewalRole, type RenewalStage } from '@/lib/renewal'

type Renewal = { id: string; status: string; new_rent: number; new_end_date: string; terms: string | null; created_at: string; responded_at: string | null }
type Progress = { stage: RenewalStage; submission_id: string | null }

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
const lbl = 'mb-1 block text-sm font-semibold text-foreground'
const toneClass = {
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  red: 'border-red-300 bg-red-50 text-red-900',
  neutral: 'border-border bg-secondary text-foreground',
} as const

// Shows the renewal on the tenancy page for the tenant and the landlord.
// Tenant: answer an offer, then pay and confirm. Landlord: send an offer and follow its progress.
export function RenewalPanel({ role, tenancyId }: { role: RenewalRole; tenancyId: string }) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [tenancy, setTenancy] = useState<any>(null)
  const [items, setItems] = useState<Renewal[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [rent, setRent] = useState('')
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [tn, rn] = await Promise.all([
      supabase.from('tenancies').select('id, status, tenant_id, landlord_id, rent_amount, end_date').eq('id', tenancyId).maybeSingle(),
      supabase.from('renewals').select('id, status, new_rent, new_end_date, terms, created_at, responded_at')
        .eq('tenancy_id', tenancyId).order('created_at', { ascending: false }).limit(10),
    ])
    if (tn.error || rn.error) { setFailed(true); setLoading(false); return }
    setFailed(false)
    setTenancy(tn.data)
    const list = (rn.data ?? []) as Renewal[]
    setItems(list)
    if (list[0]) {
      const p = await supabase.rpc('eb_renewal_progress', { p_renewal: list[0].id })
      const d: any = p.data
      setProgress(!p.error && d?.found && isRenewalStage(d.stage) ? { stage: d.stage, submission_id: d.submission_id ?? null } : null)
    } else setProgress(null)
    setLoading(false)
  }, [tenancyId])
  useEffect(() => { load() }, [load])

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (busy) return
    const verb = status === 'accepted' ? 'accept' : 'decline'
    if (!window.confirm(`Are you sure you want to ${verb} this renewal offer? Nothing is charged now.`)) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.from('renewals').update({ status }).eq('id', id).eq('status', 'offered').select('id')
    setBusy(false)
    if (error || !data?.length) { setMsg({ text: error?.message ?? 'This offer has already been answered. Refresh the page.', ok: false }); await load(); return }
    setMsg({ text: status === 'accepted' ? 'You accepted the offer. Next, pay the renewal and send proof.' : 'You declined the offer.', ok: true })
    await load()
  }

  const sendOffer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !tenancy) return
    const bad = validateOffer({ rent, endDate, currentEnd: tenancy.end_date, note })
    if (bad) { setMsg({ text: bad, ok: false }); return }
    setBusy(true); setMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== tenancy.landlord_id) { setBusy(false); setMsg({ text: 'Only the landlord on this tenancy can send an offer.', ok: false }); return }
    const { error } = await supabase.from('renewals').insert({
      tenancy_id: tenancy.id, landlord_id: tenancy.landlord_id, tenant_id: tenancy.tenant_id,
      new_rent: Number(rent.replace(/,/g, '')), new_end_date: endDate, terms: note.trim() || null, status: 'offered',
    })
    setBusy(false)
    if (error) {
      const open = error.message.includes('renewals_one_open_offer_per_tenancy')
      setMsg({ text: open ? 'There is already an open offer for this tenancy.' : error.message, ok: false })
      return
    }
    setShowForm(false); setRent(''); setEndDate(''); setNote('')
    setMsg({ text: 'Offer sent. The tenant has not accepted it yet. Nothing is charged.', ok: true })
    await load()
  }

  if (loading) return <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground" role="status"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading renewal...</p>
  if (failed) {
    return (
      <section className="mx-auto max-w-3xl px-4">
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Could not load the renewal section. <button type="button" className="font-semibold underline" onClick={() => { setLoading(true); load() }}>Try again</button>
        </p>
      </section>
    )
  }

  const latest = items[0] ?? null
  const stage = progress?.stage ?? null
  const closed = stage === 'declined' || stage === 'applied' || !latest
  const active = tenancy?.status === 'active'
  const canOffer = role === 'landlord' && active && closed
  if (role === 'tenant' && !latest) return null
  if (role === 'landlord' && !latest && !canOffer) return null

  const info = stage ? stageInfo(stage, role) : null
  const steps = stage ? renewalSteps(stage) : []
  const older = items.slice(1)

  return (
    <section className="mx-auto max-w-3xl space-y-3 px-4 pb-6" aria-labelledby="renewal-title">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 id="renewal-title" className="flex items-center gap-2 text-base font-bold text-foreground"><RefreshCw size={16} aria-hidden /> Renewal</h2>
          {latest && <span className="text-xs text-muted-foreground">Offered {fmtDate(latest.created_at)}</span>}
        </div>

        {latest && (
          <p className="text-foreground">New rent <b>{naira(latest.new_rent)}</b>, until <b>{fmtDate(latest.new_end_date)}</b>
            {latest.terms && <span className="mt-1 block rounded-md bg-secondary p-2 text-xs">{latest.terms}</span>}</p>
        )}

        {info && (
          <div role="status" className={`rounded-lg border p-3 ${toneClass[info.tone]}`}>
            <p className="font-bold">{info.heading}</p>
            <p className="text-xs">{info.text}</p>
          </div>
        )}

        {stage && stage !== 'declined' && (
          <ol className="space-y-2" aria-label="Renewal progress">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                {s.state === 'done' ? <CheckCircle2 size={18} className="text-emerald-700" aria-hidden />
                  : s.state === 'bad' ? <XCircle size={18} className="text-red-700" aria-hidden />
                  : s.state === 'current' ? <Loader2 size={18} className="animate-spin text-amber-700" aria-hidden />
                  : <Circle size={18} className="text-muted-foreground" aria-hidden />}
                <span className={s.state === 'todo' ? 'text-muted-foreground' : 'font-semibold text-foreground'}>{s.label}</span>
              </li>))}
          </ol>
        )}

        {role === 'tenant' && latest && info?.action === 'respond' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => respond(latest.id, 'accepted')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">Accept offer</button>
            <button type="button" disabled={busy} onClick={() => respond(latest.id, 'declined')} className="min-h-12 flex-1 rounded-lg border border-border font-semibold disabled:opacity-50">Decline offer</button>
          </div>
        )}
        {role === 'tenant' && latest && (info?.action === 'pay' || info?.action === 'fix') && (
          <Link href={`/tenancies/${tenancyId}/pay?renewal=${latest.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground">
            {info.action === 'pay' ? 'Pay and send proof' : 'Correct my payment proof'} <ArrowRight size={16} aria-hidden />
          </Link>
        )}
        {role === 'tenant' && info?.action === 'confirm' && progress?.submission_id && (
          <Link href={`/payment-confirmation/${progress.submission_id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground">
            Enter my confirmation code <ArrowRight size={16} aria-hidden />
          </Link>
        )}

        {canOffer && !showForm && (
          <button type="button" onClick={() => { setShowForm(true); setMsg(null) }} className="min-h-12 w-full rounded-lg border border-border font-semibold">
            {latest ? 'Send a new renewal offer' : 'Offer a renewal'}
          </button>
        )}
        {canOffer && showForm && (
          <form onSubmit={sendOffer} noValidate className="space-y-3 rounded-lg border border-border p-3">
            <p className="font-bold text-foreground">Offer a renewal</p>
            <div>
              <label className={lbl} htmlFor="rn-rent">New rent (&#8358;)</label>
              <input id="rn-rent" className={field} inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} placeholder={tenancy?.rent_amount ? String(tenancy.rent_amount) : 'e.g. 500000'} />
            </div>
            <div>
              <label className={lbl} htmlFor="rn-end">New end date</label>
              <input id="rn-end" type="date" className={field} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {tenancy?.end_date && <p className="mt-1 text-xs text-muted-foreground">Current end date: {fmtDate(tenancy.end_date)}</p>}
            </div>
            <div>
              <label className={lbl} htmlFor="rn-note">Note to the tenant (optional)</label>
              <textarea id="rn-note" rows={3} maxLength={500} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Nothing is charged when you send this. The tenant must accept, pay, and EboHomes must verify the payment before the renewal is applied.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Send offer
              </button>
              <button type="button" disabled={busy} onClick={() => { setShowForm(false); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Cancel</button>
            </div>
          </form>
        )}

        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 ${msg.ok ? toneClass.green : toneClass.red}`}>{msg.text}</p>}

        {older.length > 0 && (
          <details className="text-xs">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Earlier offers ({older.length})</summary>
            <ul className="space-y-1">
              {older.map((o) => (
                <li key={o.id} className="rounded-md border border-border p-2">{naira(o.new_rent)} until {fmtDate(o.new_end_date)} · <span className="capitalize">{o.status}</span> · {fmtDate(o.created_at)}</li>))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}