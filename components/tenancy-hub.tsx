'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtDateTime, label, naira, refundPreview } from '@/lib/case-status'

type Role = 'tenant' | 'landlord'
const input = 'w-full bg-input border border-border rounded-md px-3 py-2 text-sm'
const primary = 'px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50'
const outline = 'px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50'
const card = 'bg-card border border-border rounded-lg p-4 text-sm space-y-2'
const pill = 'text-xs border border-border rounded-full px-2 py-1 capitalize h-fit'

export function TenancyHub({ role, tenancyId }: { role: Role; tenancyId: string }) {
  const router = useRouter()
  const [me, setMe] = useState('')
  const [t, setT] = useState<any>(null)
  const [terms, setTerms] = useState<any[]>([])
  const [handovers, setHandovers] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [disputes, setDisputes] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [settlement, setSettlement] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [f, setF] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const num = (k: string) => (f[k] === undefined || f[k] === '' ? NaN : Number(f[k]))

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setMe(user.id)
    const { data: mine } = await supabase.rpc('my_tenancies', { p_as: role })
    const row = (mine ?? []).find((x: any) => x.id === tenancyId)
    if (!row) { setT(null); setLoading(false); return }
    setT(row)
    const [a, b, c, d, e, g] = await Promise.all([
      supabase.from('rental_terms').select('*').eq('tenancy_id', tenancyId).order('version', { ascending: false }),
      supabase.from('handover_records').select('*').eq('tenancy_id', tenancyId),
      supabase.from('maintenance_requests').select('*').eq('tenancy_id', tenancyId).order('created_at', { ascending: false }),
      supabase.from('tenancy_disputes').select('*').eq('tenancy_id', tenancyId).order('created_at', { ascending: false }),
      supabase.from('tenancy_settlements').select('*').eq('tenancy_id', tenancyId).maybeSingle(),
      supabase.from('tenancy_dispute_events').select('*').order('created_at', { ascending: true }),
    ])
    if (a.error) setMsg({ text: 'Some sections could not load. Run the batch 5 SQL first, then refresh.', ok: false })
    setTerms(a.data ?? []); setHandovers(b.data ?? []); setRequests(c.data ?? [])
    setDisputes(d.data ?? []); setSettlement(e.data ?? null); setEvents(g.data ?? [])
    setLoading(false)
  }, [role, tenancyId, router])

  useEffect(() => { load() }, [load])

  const call = async (fn: string, args: Record<string, any>, ok: string, confirmText?: string): Promise<boolean> => {
    if (busy) return false
    if (confirmText && !window.confirm(confirmText)) return false
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setMsg(error ? { text: error.message, ok: false } : { text: ok, ok: true })
    setBusy(false)
    if (!error) { setOpen(null); await load() }
    return !error
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
  if (!t) return <p className="text-center py-16 text-sm text-muted-foreground">Tenancy not found, or it is not yours to view.</p>

  const back = role === 'tenant' ? '/tenancies' : '/dashboard/tenancies'
  const live = terms.find((x) => ['proposed', 'accepted', 'signed'].includes(x.status))
  const other = role === 'tenant' ? 'landlord' : 'tenant'
  const myAccepted = live && (role === 'tenant' ? live.tenant_accepted_at : live.landlord_accepted_at)
  const settlementOpen = settlement && ['proposed', 'disputed'].includes(settlement.status)

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft size={14} /> Tenancies</Link>
      <div className={card}>
        <p className="font-semibold text-foreground text-base">{t.title ?? 'Property'}</p>
        <p className="text-xs text-muted-foreground">{t.location_text ?? ''} {t.tenancy_code ? `· ${t.tenancy_code}` : ''}</p>
        <p>{naira(t.rent_amount)} / {t.rent_period} · {fmtDate(t.start_date)} to {fmtDate(t.end_date)} · <span className="capitalize">{t.status}</span></p>
        <p className="text-xs text-muted-foreground">{role === 'tenant' ? 'Landlord' : 'Tenant'}: {t.other_party ?? '—'}</p>
      </div>
      {msg && <p className={`text-sm rounded-md p-3 ${msg.ok ? 'text-primary bg-primary/10' : 'text-destructive bg-destructive/10'}`}>{msg.text}</p>}

      {/* ---------------- AGREEMENT ---------------- */}
      <section className="space-y-2">
        <h2 className="font-bold text-foreground">Rental terms and agreement</h2>
        {live ? (
          <div className={card}>
            <div className="flex justify-between gap-2">
              <p className="font-medium">Version {live.version}</p>
              <span className={pill}>{live.status === 'signed' ? 'Signed agreement recorded' : live.status === 'accepted' ? 'Accepted by both' : 'Waiting for acceptance'}</span>
            </div>
            <p>Rent {naira(live.rent_amount)} · Deposit {naira(live.deposit_amount)} · Fees {naira(live.fees_amount)}</p>
            {live.payment_schedule && <p>Payment: {live.payment_schedule}</p>}
            {live.notice_days !== null && <p>Notice period: {live.notice_days} days</p>}
            {live.house_rules && <p className="bg-secondary rounded-md p-2">{live.house_rules}</p>}
            <p className="text-xs text-muted-foreground">
              Tenant: {live.tenant_accepted_at ? `accepted ${fmtDate(live.tenant_accepted_at)}` : 'not yet'} · Landlord: {live.landlord_accepted_at ? `accepted ${fmtDate(live.landlord_accepted_at)}` : 'not yet'}
              {live.status === 'signed' && ` · Signed copy reference ${live.signed_reference} (recorded ${fmtDate(live.signed_recorded_at)})`}
            </p>
            {live.status === 'proposed' && !myAccepted && (
              <div className="flex gap-2">
                <button disabled={busy} className={primary} onClick={() => call('respond_rental_terms', { p_terms: live.id, p_accept: true }, 'You accepted these terms.', 'Accept these rental terms?')}>Accept</button>
                <button disabled={busy} className={outline} onClick={() => call('respond_rental_terms', { p_terms: live.id, p_accept: false }, 'You declined these terms.', 'Decline these rental terms?')}>Decline</button>
              </div>
            )}
            {live.status === 'proposed' && myAccepted && <p className="text-xs text-muted-foreground">Waiting for the {other} to respond.</p>}
            {live.status === 'accepted' && <p className="text-xs text-muted-foreground">EboHomes records the signed agreement once it has seen it. This page does not replace the signed document.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{terms[0] ? `The last proposed terms were ${terms[0].status}.` : 'No terms have been proposed yet.'}</p>
        )}
        {role === 'landlord' && (!live || live.status !== 'signed') && (
          open === 'terms' ? (
            <div className={card}>
              <input className={input} type="number" min={1} placeholder="Rent (₦)" value={f.t_rent ?? ''} onChange={(e) => set('t_rent', e.target.value)} />
              <input className={input} type="number" min={0} placeholder="Caution deposit (₦)" value={f.t_dep ?? ''} onChange={(e) => set('t_dep', e.target.value)} />
              <input className={input} type="number" min={0} placeholder="Other fees (₦)" value={f.t_fees ?? ''} onChange={(e) => set('t_fees', e.target.value)} />
              <input className={input} placeholder="Payment schedule, e.g. yearly upfront" value={f.t_sched ?? ''} onChange={(e) => set('t_sched', e.target.value)} />
              <input className={input} type="number" min={0} max={365} placeholder="Notice period (days)" value={f.t_notice ?? ''} onChange={(e) => set('t_notice', e.target.value)} />
              <textarea className={input} rows={3} placeholder="House rules" value={f.t_rules ?? ''} onChange={(e) => set('t_rules', e.target.value)} />
              <div className="flex gap-2">
                <button disabled={busy || !(num('t_rent') > 0)} className={primary} onClick={() => call('propose_rental_terms', { p_tenancy: tenancyId, p_rent: num('t_rent'), p_deposit: num('t_dep') || 0, p_fees: num('t_fees') || 0, p_schedule: f.t_sched ?? null, p_notice_days: Number.isNaN(num('t_notice')) ? null : num('t_notice'), p_rules: f.t_rules ?? null }, 'Terms sent to the tenant.')}>Send terms</button>
                <button className={outline} onClick={() => setOpen(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="text-sm text-primary font-medium" onClick={() => setOpen('terms')}>{live ? 'Propose changed terms' : 'Propose rental terms'}</button>
          )
        )}
      </section>

      {/* ---------------- HANDOVER ---------------- */}
      <section className="space-y-2">
        <h2 className="font-bold text-foreground">Handover records</h2>
        {(['move_in', 'move_out'] as const).map((kind) => {
          const h = handovers.find((x) => x.kind === kind)
          const canSubmit = !h || h.status === 'disputed' || (h.status === 'submitted' && h.submitted_by === me)
          return (
            <div key={kind} className={card}>
              <div className="flex justify-between gap-2">
                <p className="font-medium capitalize">{label(kind)}</p>
                <span className={pill}>{h ? label(h.status) : 'Not recorded'}</span>
              </div>
              {h && (
                <>
                  <p className="bg-secondary rounded-md p-2">{h.condition_notes}</p>
                  <p className="text-xs text-muted-foreground">Keys: {h.keys_count ?? '—'} · Meters: {h.meter_readings ?? '—'} · Submitted {fmtDate(h.submitted_at)} by {h.submitted_by === me ? 'you' : `the ${other}`}</p>
                  {h.response_note && <p className="text-xs">Response: {h.response_note}</p>}
                </>
              )}
              {h && h.status === 'submitted' && h.submitted_by !== me && (
                <div className="space-y-2">
                  <input className={input} placeholder="If something is wrong, say what (required to dispute)" value={f[`h_note_${kind}`] ?? ''} onChange={(e) => set(`h_note_${kind}`, e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={busy} className={primary} onClick={() => call('respond_handover', { p_handover: h.id, p_accept: true, p_note: null }, 'Record acknowledged.', 'Acknowledge that this record is correct?')}>Acknowledge</button>
                    <button disabled={busy} className={outline} onClick={() => call('respond_handover', { p_handover: h.id, p_accept: false, p_note: f[`h_note_${kind}`] ?? '' }, 'Dispute opened for EboHomes to review.')}>Dispute</button>
                  </div>
                </div>
              )}
              {canSubmit && (
                open === `h_${kind}` ? (
                  <div className="space-y-2">
                    <textarea className={input} rows={3} placeholder="Condition of the property, rooms, damage" value={f[`h_cond_${kind}`] ?? ''} onChange={(e) => set(`h_cond_${kind}`, e.target.value)} />
                    <input className={input} type="number" min={0} placeholder="Number of keys handed over" value={f[`h_keys_${kind}`] ?? ''} onChange={(e) => set(`h_keys_${kind}`, e.target.value)} />
                    <input className={input} placeholder="Meter readings (optional)" value={f[`h_meter_${kind}`] ?? ''} onChange={(e) => set(`h_meter_${kind}`, e.target.value)} />
                    <div className="flex gap-2">
                      <button disabled={busy || (f[`h_cond_${kind}`] ?? '').trim().length < 5} className={primary} onClick={() => call('submit_handover', { p_tenancy: tenancyId, p_kind: kind, p_notes: f[`h_cond_${kind}`] ?? '', p_keys: Number.isNaN(Number(f[`h_keys_${kind}`])) || (f[`h_keys_${kind}`] ?? '') === '' ? null : Number(f[`h_keys_${kind}`]), p_meters: f[`h_meter_${kind}`] ?? null }, 'Record sent to the other party.')}>Submit record</button>
                      <button className={outline} onClick={() => setOpen(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="text-sm text-primary font-medium" onClick={() => { set(`h_cond_${kind}`, h?.condition_notes ?? ''); set(`h_keys_${kind}`, h?.keys_count != null ? String(h.keys_count) : ''); set(`h_meter_${kind}`, h?.meter_readings ?? ''); setOpen(`h_${kind}`) }}>{h ? 'Edit and resubmit' : `Record ${label(kind)}`}</button>
                )
              )}
            </div>
          )
        })}
      </section>

      {/* ---------------- MAINTENANCE ---------------- */}
      <section className="space-y-2">
        <h2 className="font-bold text-foreground">Maintenance requests</h2>
        {requests.length === 0 && <p className="text-sm text-muted-foreground">No requests.</p>}
        {requests.map((m) => (
          <div key={m.id} className={card}>
            <div className="flex justify-between gap-2">
              <p className="font-medium">{m.title}</p>
              <span className={pill}>{label(m.status)}</span>
            </div>
            <p>{m.description}</p>
            <p className="text-xs text-muted-foreground capitalize">{m.priority} priority · raised {fmtDate(m.created_at)}</p>
            {m.landlord_note && <p className="text-xs">Landlord: {m.landlord_note}</p>}
            {m.resolution_note && <p className="text-xs">Fix: {m.resolution_note}</p>}
            {role === 'landlord' && ['open', 'acknowledged', 'in_progress'].includes(m.status) && (
              <div className="space-y-2">
                <input className={input} placeholder="Note (required to mark fixed)" value={f[`m_${m.id}`] ?? ''} onChange={(e) => set(`m_${m.id}`, e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {m.status === 'open' && <button disabled={busy} className={outline} onClick={() => call('maintenance_action', { p_request: m.id, p_action: 'acknowledge', p_note: f[`m_${m.id}`] ?? null }, 'Request acknowledged.')}>Acknowledge</button>}
                  {m.status !== 'in_progress' && <button disabled={busy} className={outline} onClick={() => call('maintenance_action', { p_request: m.id, p_action: 'start', p_note: f[`m_${m.id}`] ?? null }, 'Marked in progress.')}>Work started</button>}
                  <button disabled={busy} className={primary} onClick={() => call('maintenance_action', { p_request: m.id, p_action: 'resolve', p_note: f[`m_${m.id}`] ?? '' }, 'Marked fixed. The tenant will confirm.')}>Mark fixed</button>
                </div>
              </div>
            )}
            {role === 'tenant' && m.status === 'resolved' && (
              <div className="space-y-2">
                <input className={input} placeholder="If it is not fixed, say what is still wrong" value={f[`m_${m.id}`] ?? ''} onChange={(e) => set(`m_${m.id}`, e.target.value)} />
                <div className="flex gap-2">
                  <button disabled={busy} className={primary} onClick={() => call('maintenance_action', { p_request: m.id, p_action: 'close', p_note: null }, 'Thanks. Request closed.')}>It is fixed</button>
                  <button disabled={busy} className={outline} onClick={() => call('maintenance_action', { p_request: m.id, p_action: 'reopen', p_note: f[`m_${m.id}`] ?? '' }, 'Request reopened.')}>Not fixed</button>
                </div>
              </div>
            )}
            {role === 'tenant' && ['open', 'acknowledged'].includes(m.status) && (
              <button disabled={busy} className="text-xs text-muted-foreground hover:text-destructive hover:underline" onClick={() => call('maintenance_action', { p_request: m.id, p_action: 'cancel', p_note: null }, 'Request cancelled.', 'Cancel this request?')}>Cancel request</button>
            )}
          </div>
        ))}
        {role === 'tenant' && (
          open === 'maint' ? (
            <div className={card}>
              <input className={input} maxLength={120} placeholder="What is the problem? (short title)" value={f.mt ?? ''} onChange={(e) => set('mt', e.target.value)} />
              <textarea className={input} rows={3} placeholder="Describe it" value={f.md ?? ''} onChange={(e) => set('md', e.target.value)} />
              <select className={input} value={f.mp ?? 'normal'} onChange={(e) => set('mp', e.target.value)}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="urgent">Urgent (safety or no water/power)</option>
              </select>
              <div className="flex gap-2">
                <button disabled={busy || (f.mt ?? '').trim().length < 3 || (f.md ?? '').trim().length < 5} className={primary} onClick={() => call('create_maintenance_request', { p_tenancy: tenancyId, p_title: f.mt, p_description: f.md, p_priority: f.mp ?? 'normal' }, 'Request sent to your landlord.')}>Send request</button>
                <button className={outline} onClick={() => setOpen(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="text-sm text-primary font-medium" onClick={() => setOpen('maint')}>Report a problem</button>
          )
        )}
      </section>

      {/* ---------------- DISPUTES ---------------- */}
      <section className="space-y-2">
        <h2 className="font-bold text-foreground">Disputes</h2>
        <p className="text-xs text-muted-foreground">EboHomes reviews disputes and writes the outcome. It does not move money.</p>
        {disputes.length === 0 && <p className="text-sm text-muted-foreground">No disputes.</p>}
        {disputes.map((d) => {
          const ev = events.filter((x) => x.dispute_id === d.id)
          const live = ['open', 'under_review'].includes(d.status)
          return (
            <div key={d.id} className={card}>
              <div className="flex justify-between gap-2">
                <p className="font-medium capitalize">{label(d.category)}</p>
                <span className={pill}>{label(d.status)}</span>
              </div>
              <p>{d.summary}</p>
              {ev.filter((x) => x.kind !== 'created').map((x) => (
                <p key={x.id} className="text-xs bg-secondary rounded-md p-2">{fmtDateTime(x.created_at)} · {x.actor_id === me ? 'You' : 'Other side / EboHomes'}: {x.body}</p>
              ))}
              {d.resolution && <p className="text-xs rounded-md border border-border p-2"><span className="font-medium">Outcome:</span> {d.resolution}</p>}
              {live && (
                <div className="space-y-2">
                  <input className={input} placeholder="Add a comment" value={f[`d_${d.id}`] ?? ''} onChange={(e) => set(`d_${d.id}`, e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={busy || (f[`d_${d.id}`] ?? '').trim().length < 2} className={primary} onClick={async () => { if (await call('add_dispute_comment', { p_dispute: d.id, p_body: f[`d_${d.id}`] }, 'Comment added.')) set(`d_${d.id}`, '') }}>Comment</button>
                    {d.raised_by === me && d.status === 'open' && <button disabled={busy} className={outline} onClick={() => call('withdraw_dispute', { p_dispute: d.id, p_note: null }, 'Dispute withdrawn.', 'Withdraw this dispute?')}>Withdraw</button>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {open === 'dispute' ? (
          <div className={card}>
            <select className={input} value={f.dc ?? 'other'} onChange={(e) => set('dc', e.target.value)}>
              {['payment', 'deposit', 'condition', 'maintenance', 'agreement', 'conduct', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea className={input} rows={3} placeholder="What happened? (at least 10 characters)" value={f.ds ?? ''} onChange={(e) => set('ds', e.target.value)} />
            <div className="flex gap-2">
              <button disabled={busy || (f.ds ?? '').trim().length < 10} className={primary} onClick={() => call('raise_dispute', { p_tenancy: tenancyId, p_category: f.dc ?? 'other', p_summary: f.ds }, 'Dispute opened. EboHomes has been told.')}>Open dispute</button>
              <button className={outline} onClick={() => setOpen(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="text-sm text-primary font-medium" onClick={() => setOpen('dispute')}>Open a dispute</button>
        )}
      </section>

      {/* ---------------- SETTLEMENT ---------------- */}
      <section className="space-y-2 pb-10">
        <h2 className="font-bold text-foreground">Deposit settlement</h2>
        <p className="text-xs text-muted-foreground">This records the figures both sides agree. EboHomes does not hold, transfer or refund this money. The landlord pays any refund directly.</p>
        {settlement ? (
          <div className={card}>
            <div className="flex justify-between gap-2">
              <p className="font-medium">Refund due: {naira(settlement.refund_due)}</p>
              <span className={pill}>{label(settlement.status)}</span>
            </div>
            <p>Deposit {naira(settlement.deposit_held)} · Deductions {naira(settlement.deductions)}</p>
            {settlement.deduction_reason && <p className="bg-secondary rounded-md p-2">{settlement.deduction_reason}</p>}
            {settlement.tenant_note && <p className="text-xs">Tenant: {settlement.tenant_note}</p>}
            {settlement.review_note && <p className="text-xs">EboHomes: {settlement.review_note}</p>}
            {settlement.refund_reference && <p className="text-xs">Refund recorded: {settlement.refund_reference} on {fmtDate(settlement.refund_paid_on)}</p>}
            {role === 'tenant' && settlement.status === 'proposed' && (
              <div className="space-y-2">
                <input className={input} placeholder="If you disagree, say why (required)" value={f.s_note ?? ''} onChange={(e) => set('s_note', e.target.value)} />
                <div className="flex gap-2">
                  <button disabled={busy} className={primary} onClick={() => call('respond_settlement', { p_settlement: settlement.id, p_agree: true, p_note: null }, 'You agreed. EboHomes will review.', 'Agree to these figures?')}>Agree</button>
                  <button disabled={busy} className={outline} onClick={() => call('respond_settlement', { p_settlement: settlement.id, p_agree: false, p_note: f.s_note ?? '' }, 'Disputed. EboHomes will review.')}>Dispute</button>
                </div>
              </div>
            )}
            {role === 'landlord' && settlement.status === 'approved' && (
              <div className="space-y-2">
                <input className={input} placeholder="How and when you paid (reference)" value={f.s_ref ?? ''} onChange={(e) => set('s_ref', e.target.value)} />
                <input className={input} type="date" max={new Date().toISOString().slice(0, 10)} value={f.s_date ?? ''} onChange={(e) => set('s_date', e.target.value)} />
                <button disabled={busy || !f.s_date || (f.s_ref ?? '').trim().length < 3} className={primary} onClick={() => call('record_settlement_refund', { p_settlement: settlement.id, p_reference: f.s_ref, p_paid_on: f.s_date }, 'Refund recorded. The tenant will confirm.', 'Record that you paid this refund?')}>Record refund paid</button>
              </div>
            )}
            {role === 'tenant' && settlement.status === 'refund_recorded' && (
              <div className="space-y-2">
                <input className={input} placeholder="If you did not receive it, say what happened" value={f.s_note2 ?? ''} onChange={(e) => set('s_note2', e.target.value)} />
                <div className="flex gap-2">
                  <button disabled={busy} className={primary} onClick={() => call('confirm_settlement_received', { p_settlement: settlement.id, p_received: true, p_note: null }, 'Thanks. Settlement closed.', 'Confirm you received the refund?')}>I received it</button>
                  <button disabled={busy} className={outline} onClick={() => call('confirm_settlement_received', { p_settlement: settlement.id, p_received: false, p_note: f.s_note2 ?? '' }, 'Dispute opened.')}>Not received</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No settlement yet.</p>
        )}
        {role === 'landlord' && (!settlement || settlementOpen) && (
          open === 'settle' ? (
            <div className={card}>
              <input className={input} type="number" min={0} placeholder="Deposit you hold (₦)" value={f.s_dep ?? ''} onChange={(e) => set('s_dep', e.target.value)} />
              <input className={input} type="number" min={0} placeholder="Deductions (₦, 0 if none)" value={f.s_ded ?? ''} onChange={(e) => set('s_ded', e.target.value)} />
              <textarea className={input} rows={2} placeholder="Reason for deductions (required if above 0)" value={f.s_why ?? ''} onChange={(e) => set('s_why', e.target.value)} />
              <p className="text-xs text-muted-foreground">Refund to tenant: {refundPreview(num('s_dep'), num('s_ded') || 0) === null ? '—' : naira(refundPreview(num('s_dep'), num('s_ded') || 0))}</p>
              <div className="flex gap-2">
                <button disabled={busy || refundPreview(num('s_dep'), num('s_ded') || 0) === null} className={primary} onClick={() => call('propose_settlement', { p_tenancy: tenancyId, p_deposit: num('s_dep'), p_deductions: num('s_ded') || 0, p_reason: f.s_why ?? null }, 'Settlement sent to the tenant.')}>Send to tenant</button>
                <button className={outline} onClick={() => setOpen(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="text-sm text-primary font-medium" onClick={() => setOpen('settle')}>{settlement ? 'Revise settlement' : 'Propose settlement'}</button>
          )
        )}
      </section>
    </div>
  )
}