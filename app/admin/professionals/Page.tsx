'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, BadgeCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const FILTERS = [
  { key: 'pending', label: 'Awaiting review' }, { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }, { key: 'suspended', label: 'Suspended' }, { key: 'all', label: 'All' },
]
const tone: Record<string, string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-900', approved: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-red-300 bg-red-50 text-red-900', suspended: 'border-red-300 bg-red-50 text-red-900',
}
type Decision = 'approved' | 'rejected' | 'suspended' | 'reinstated'

export default function AdminProfessionals() {
  const [filter, setFilter] = useState('pending')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const { data, error } = await supabase.rpc('admin_professionals_list', { p_status: filter === 'all' ? null : filter })
    if (error) { setErr(error.message); setItems([]); return }
    setItems(data ?? [])
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><BadgeCheck size={20} aria-hidden /> Professionals</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        Approving a professional never approves a property. Identity must be verified first. Licence details are optional and never public.
        You cannot review your own profile.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
        : <ul className="space-y-2">{items.map((p) => (
          <li key={p.user_id} className="rounded-xl border border-border bg-card">
            <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm"
              onClick={() => setOpenId(openId === p.user_id ? null : p.user_id)} aria-expanded={openId === p.user_id}>
              <span><b>{p.full_name ?? 'Unknown'}</b> · {p.kind === 'manager' ? 'Property manager' : 'Agent'}
                {!p.identity_verified && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="Identity not verified" />}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[p.status] ?? ''}`}>{p.status}</span>
            </button>
            {openId === p.user_id && <Row p={p} onChanged={() => { setOpenId(null); load() }} />}
          </li>))}</ul>}
    </div>
  )
}

function Row({ p, onChanged }: { p: any; onChanged: () => void }) {
  const [mode, setMode] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<any[] | null>(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('admin_professional_history', { p_user: p.user_id }).then(({ data }) => { if (alive) setHistory(data ?? []) })
    return () => { alive = false }
  }, [p.user_id])

  async function decide() {
    const n = note.trim()
    if (mode !== 'approved' && n.length < 5) { setMsg('Write a note of at least 5 characters.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_decide_professional', { p_user: p.user_id, p_decision: mode, p_note: n || null })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    onChanged()
  }

  async function licence(checked: boolean) {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_mark_licence_checked', { p_user: p.user_id, p_checked: checked, p_note: null })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    onChanged()
  }

  const canApprove = p.status === 'pending' && p.identity_verified && !p.is_self

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Name</dt><dd>{p.full_name ?? 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Email</dt><dd>{p.email ?? 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Identity verified</dt><dd>{p.identity_verified ? 'Yes' : 'No'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd>{when(p.submitted_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Licence body</dt><dd>{p.licence_body ?? 'not given'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Licence number</dt><dd>{p.licence_number ?? 'not given'}{p.licence_number && (p.licence_checked ? ' (checked)' : ' (not checked)')}</dd></div>
      </dl>

      {p.is_self && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">This is your own profile. Another administrator must review it.</p>}
      {p.status === 'pending' && !p.identity_verified && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">Identity is not verified yet, so this cannot be approved.</p>}
      {p.decision_note && <p className="rounded-md bg-secondary p-2 text-xs">Last note: {p.decision_note}</p>}

      {p.licence_number && !p.is_self && (
        <button disabled={busy} onClick={() => licence(!p.licence_checked)} className="min-h-11 rounded-lg border border-border px-3 font-semibold disabled:opacity-50">
          {p.licence_checked ? 'Clear licence check' : 'Mark licence as checked'}
        </button>)}

      <ul className="space-y-1 text-xs">
        {(history ?? []).map((e, i) => (
          <li key={i} className="rounded-md border border-border p-2"><b>{String(e.event).replace(/_/g, ' ')}</b> · {when(e.created_at)}{e.note ? ` · "${e.note}"` : ''}</li>))}
      </ul>

      {!mode && !p.is_self && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {p.status === 'pending' && <>
            <button onClick={() => setMode('rejected')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Reject</button>
            <button disabled={!canApprove} onClick={() => setMode('approved')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">Approve</button>
          </>}
          {p.status === 'approved' && <button onClick={() => setMode('suspended')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Suspend</button>}
          {p.status === 'suspended' && <button onClick={() => setMode('reinstated')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Reinstate</button>}
        </div>)}

      {mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <label className="text-xs font-semibold" htmlFor="dn">
            {mode === 'approved' ? 'Note (optional)' : mode === 'rejected' ? 'Reason shown to the applicant (required)' : 'Reason (required)'}
          </label>
          <textarea id="dn" rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={decide} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Confirm</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Cancel</button>
          </div>
        </div>)}
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
    </div>
  )
}
