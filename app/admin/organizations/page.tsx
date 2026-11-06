'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, Building2, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ORG_DOC_LABELS } from '@/lib/organization-evidence'

const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const FILTERS = [
  { key: 'pending_review', label: 'Awaiting review' }, { key: 'changes', label: 'Changes to review' },
  { key: 'info_required', label: 'Info requested' }, { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }, { key: 'suspended', label: 'Suspended' }, { key: 'all', label: 'All' },
]
const tone: Record<string, string> = {
  pending_review: 'border-amber-300 bg-amber-50 text-amber-900', info_required: 'border-amber-300 bg-amber-50 text-amber-900',
  approved: 'border-emerald-300 bg-emerald-50 text-emerald-900', rejected: 'border-red-300 bg-red-50 text-red-900',
  suspended: 'border-red-300 bg-red-50 text-red-900',
}
const label = (s: string) => s.replace(/_/g, ' ')
type Decision = 'approved' | 'rejected' | 'info_required' | 'suspended' | 'reinstated'

async function openFile(query: string): Promise<string | null> {
  // Open the tab first, so a phone does not block it, then point it at the short-lived link.
  const w = window.open('', '_blank')
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(`/api/admin/organization/document?${query}`, { headers: { Authorization: `Bearer ${t}` } })
  const j = await res.json().catch(() => null)
  if (!res.ok || !j?.url) { w?.close(); return j?.error ?? 'Could not open the file.' }
  if (w) { w.opener = null; w.location.href = j.url } else window.location.href = j.url
  return null
}

export default function AdminOrganizations() {
  const [filter, setFilter] = useState('pending_review')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const { data, error } = await supabase.rpc('admin_organizations_list', { p_status: filter === 'all' ? null : filter })
    if (error) { setErr(error.message); setItems([]); return }
    setItems(data ?? [])
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Building2 size={20} aria-hidden /> Companies</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        Approving a company never approves a property or any person who works for it. Identity of the person who registered it must be verified first.
        Check the registration number against the public CAC record yourself. Every document you open is recorded. You cannot review your own company.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
        : <ul className="space-y-2">{items.map((o) => (
          <li key={o.id} className="rounded-xl border border-border bg-card">
            <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm"
              onClick={() => setOpenId(openId === o.id ? null : o.id)} aria-expanded={openId === o.id}>
              <span><b>{o.name ?? 'Unnamed'}</b> · {o.creator_name ?? 'Unknown'}
                {(o.duplicate_reg || o.similar_name || !o.identity_verified) && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="Needs attention" />}
                {o.change_pending && <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">change waiting</span>}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[o.status] ?? ''}`}>{label(o.status)}</span>
            </button>
            {openId === o.id && <Detail id={o.id} similarName={!!o.similar_name} onChanged={() => { setOpenId(null); load() }} />}
          </li>))}</ul>}
    </div>
  )
}

function Detail({ id, similarName, onChanged }: { id: string; similarName: boolean; onChanged: () => void }) {
  const [o, setO] = useState<any | null>(null)
  const [mode, setMode] = useState<Decision | 'change_approved' | 'change_rejected' | null>(null)
  const [note, setNote] = useState('')
  const [exc, setExc] = useState('')
  const [docNote, setDocNote] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_organization_detail', { p_id: id })
    if (error) { setMsg(error.message); return }
    setO(data)
  }, [id])
  useEffect(() => { reload() }, [reload])

  async function open(query: string) {
    setMsg(null); setBusy(true)
    const e = await openFile(query)
    setBusy(false)
    if (e) setMsg(e)
    else await reload() // the open is recorded in the history
  }

  async function reviewDoc(docId: string, decision: 'accepted' | 'rejected') {
    const n = (docNote[docId] ?? '').trim()
    if (decision === 'rejected' && n.length < 5) { setMsg('Write a reason of at least 5 characters.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_review_organization_document', { p_doc: docId, p_decision: decision, p_note: n || null })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setRejecting(null)
    await reload()
  }

  async function decide() {
    if (!mode) return
    const n = note.trim()
    setBusy(true); setMsg(null)
    let error
    if (mode === 'change_approved' || mode === 'change_rejected') {
      if (n.length < 10) { setBusy(false); setMsg('Write a note of at least 10 characters about the evidence you checked.'); return }
      ;({ error } = await supabase.rpc('admin_decide_organization_change', { p_id: id, p_decision: mode === 'change_approved' ? 'approved' : 'rejected', p_note: n }))
    } else {
      if (mode !== 'approved' && n.length < 5) { setBusy(false); setMsg('Write a note of at least 5 characters.'); return }
      ;({ error } = await supabase.rpc('admin_decide_organization', { p_id: id, p_decision: mode, p_note: n || null, p_reg_exception_reason: exc.trim() || null }))
    }
    setBusy(false)
    if (error) { setMsg(error.message); return }
    onChanged()
  }

  if (!o) return <div className="border-t border-border p-3 text-sm">{msg ? <p role="alert" className="text-red-900">{msg}</p> : <Loader2 size={16} className="animate-spin" aria-label="Loading" />}</div>

  const self = !!o.is_self
  const idOk = !!o.creator?.identity_verified
  const docs = (o.documents ?? []).filter((d: any) => !d.withdrawn_at)
  const reviewable = !self && (o.status === 'pending_review' || o.status === 'approved')
  const canApprove = o.status === 'pending_review' && idOk && !self
  const noReg = !o.reg_number
  const list = (a?: string[]) => (a && a.length ? a.join(', ') : 'none')

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      {self && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">This is your own company. Another administrator must review it.</p>}
      {o.status === 'pending_review' && !idOk && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">The person who registered this company has not verified their identity yet, so it cannot be approved.</p>}
      {o.duplicate_reg && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">Another company uses the same registration number. This is not proof of fraud. Compare the documents and check the CAC public record before you decide.</p>}
      {similarName && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">Another company has a very similar name. Check this is not an impersonation.</p>}
      {o.decision_note && <p className="rounded-md bg-secondary p-2 text-xs">Last note: {o.decision_note}</p>}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Company name</dt><dd>{o.name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Registration</dt><dd>{o.reg_number ? `${String(o.reg_type).toUpperCase()} ${o.reg_number}` : 'none given'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Business email (private)</dt><dd className="break-all">{o.business_email ?? 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Business phone (private)</dt><dd>{o.business_phone ?? 'n/a'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Business address (private)</dt><dd>{o.business_address ?? 'n/a'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Description</dt><dd className="whitespace-pre-line">{o.description ?? 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Operating locations</dt><dd>{list(o.operating_locations)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Services</dt><dd>{list(o.services)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Areas served</dt><dd>{list(o.areas_served)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Public contact</dt><dd>{[o.public_email, o.public_phone].filter(Boolean).join(' · ') || 'none published'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Representative</dt><dd>{[o.rep_name, o.rep_role, o.rep_phone].filter(Boolean).join(' · ') || 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd>{when(o.submitted_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Registered by</dt><dd>{o.creator?.name ?? 'n/a'} · {o.creator?.email ?? 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Identity verified</dt><dd>{idOk ? 'Yes' : 'No'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Professional profile</dt><dd>{o.creator?.professional_status ?? 'none'}</dd></div>
        {o.approved_without_reg_reason && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Approved without registration number because</dt><dd>{o.approved_without_reg_reason}</dd></div>}
      </dl>

      {!self && (o.logo_path || o.pending_logo_path) && (
        <div className="flex flex-wrap gap-2">
          {o.logo_path && <button disabled={busy} onClick={() => open(`org=${id}&logo=current`)} className="min-h-11 rounded-lg border border-border px-3 font-semibold disabled:opacity-50">View current logo</button>}
          {o.pending_logo_path && <button disabled={busy} onClick={() => open(`org=${id}&logo=pending`)} className="min-h-11 rounded-lg border border-amber-300 px-3 font-semibold disabled:opacity-50">View new logo (waiting)</button>}
        </div>)}

      {o.pending_changes && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold">A change is waiting for review</p>
          {o.pending_changes.name && <p>New name: <b>{o.pending_changes.name}</b></p>}
          {'reg_number' in o.pending_changes && <p>New registration number: <b>{o.pending_changes.reg_number ?? 'none'}</b></p>}
          {o.pending_changes.logo_path && <p>New logo uploaded (view it above).</p>}
          {!self && !mode && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={() => setMode('change_rejected')} className="min-h-12 flex-1 rounded-lg border border-red-300 bg-white font-semibold text-red-800">Reject change</button>
              <button onClick={() => setMode('change_approved')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Approve change</button>
            </div>)}
        </div>)}

      <div>
        <h3 className="mb-1 flex items-center gap-1 font-bold"><FileText size={14} aria-hidden /> Documents</h3>
        {docs.length === 0 ? <p className="text-xs text-muted-foreground">No documents.</p> : (
          <ul className="space-y-2">{docs.map((d: any) => (
            <li key={d.id} className="space-y-2 rounded-lg border border-border p-2">
              <p><b>{(ORG_DOC_LABELS as Record<string, string>)[d.doc_type] ?? d.doc_type}</b> · {d.name ?? 'File'} · {when(d.uploaded_at)}</p>
              <p className="text-xs">Status: {d.status}{d.note ? ` · "${d.note}"` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {!self && <button disabled={busy} onClick={() => open(`id=${d.id}`)} className="min-h-11 rounded-lg border border-border px-3 font-semibold disabled:opacity-50">Open (recorded)</button>}
                {reviewable && d.status !== 'accepted' && <button disabled={busy} onClick={() => reviewDoc(d.id, 'accepted')} className="min-h-11 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">Accept</button>}
                {reviewable && d.status !== 'rejected' && <button disabled={busy} onClick={() => setRejecting(rejecting === d.id ? null : d.id)} className="min-h-11 rounded-lg border border-red-300 px-3 font-semibold text-red-800">Reject</button>}
              </div>
              {rejecting === d.id && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold" htmlFor={`dn-${d.id}`}>Reason shown to the company (required)</label>
                  <input id={`dn-${d.id}`} className={field} maxLength={500} value={docNote[d.id] ?? ''} onChange={(e) => setDocNote({ ...docNote, [d.id]: e.target.value })} />
                  <button disabled={busy} onClick={() => reviewDoc(d.id, 'rejected')} className="min-h-11 rounded-lg bg-red-700 px-3 font-semibold text-white disabled:opacity-50">Confirm reject</button>
                </div>)}
            </li>))}</ul>)}
      </div>

      <div>
        <h3 className="mb-1 font-bold">History</h3>
        <ul className="space-y-1 text-xs">
          {(o.events ?? []).map((e: any, i: number) => (
            <li key={i} className="rounded-md border border-border p-2"><b>{label(String(e.event))}</b> · {when(e.created_at)}{e.note ? ` · "${e.note}"` : ''}</li>))}
        </ul>
      </div>

      {!mode && !self && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {o.status === 'pending_review' && <>
            <button onClick={() => setMode('rejected')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Reject</button>
            <button onClick={() => setMode('info_required')} className="min-h-12 flex-1 rounded-lg border border-amber-300 font-semibold text-amber-900">Request more information</button>
            <button disabled={!canApprove} onClick={() => setMode('approved')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">Approve</button>
          </>}
          {o.status === 'approved' && <button onClick={() => setMode('suspended')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Suspend</button>}
          {o.status === 'suspended' && <button onClick={() => setMode('reinstated')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Reinstate</button>}
        </div>)}

      {mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {mode === 'approved' && (
            <p className="text-xs text-muted-foreground">Approval needs the representative document accepted{noReg ? ', and one accepted supporting document of the business' : ', and the registration certificate accepted'}. The company then appears publicly as verified.</p>)}
          {mode === 'approved' && noReg && (
            <div>
              <label className="text-xs font-semibold" htmlFor="exc">This company gave no registration number. Why are you approving it? (required, 10+ characters)</label>
              <textarea id="exc" rows={2} maxLength={1000} className={field} value={exc} onChange={(e) => setExc(e.target.value)} />
            </div>)}
          <label className="text-xs font-semibold" htmlFor="dn">
            {mode === 'approved' ? 'Note (optional)' : mode === 'change_approved' || mode === 'change_rejected' ? 'What evidence did you check? (required, 10+ characters)'
              : mode === 'rejected' || mode === 'info_required' ? 'Note shown to the company (required)' : 'Reason (required)'}
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
