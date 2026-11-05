'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, FileText, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AUTHORITY_DOC_TYPES, AUTHORITY_ROLES, authorityStatusInfo } from '@/lib/listing-authority'
import { friendlyAuthorityError } from '@/lib/authority-evidence'

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50'
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const docLabel = (v: string) => AUTHORITY_DOC_TYPES.find((d) => d.value === v)?.label ?? v
const roleLabel = (v?: string) => AUTHORITY_ROLES.find((r) => r.value === v)?.label ?? v ?? 'n/a'
const TABS = [{ key: 'queue', label: 'Review queue' }, { key: 'legacy', label: 'Existing listings' }, { key: 'settings', label: 'Settings' }]
const OUTCOMES = [
  { v: 'acceptable', l: 'Acceptable' }, { v: 'unclear', l: 'Unclear (note needed)' },
  { v: 'concern', l: 'Concern (note needed)' }, { v: 'not_relevant', l: 'Not relevant' },
]
const CHECKS = [
  { k: 'documents_reviewed', l: 'I reviewed every active document' },
  { k: 'name_matches', l: 'The names match the lister, owner or company' },
  { k: 'authority_established', l: 'The evidence supports the claimed authority' },
  { k: 'duplicates_checked', l: 'I checked for duplicate listings and files' },
]

async function adminGet(path: string) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { headers: { Authorization: `Bearer ${t}` } })
  return { ok: res.ok, j: await res.json().catch(() => null) }
}

export default function AdminListingAuthority() {
  const [tab, setTab] = useState('queue')
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">Listing authority</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        This reviews the evidence a lister sent for ONE property. Opening a document is not a review. Accept only when you have reviewed each document. Wording shown to tenants never says ownership is verified.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{t.label}</button>))}
      </div>
      {tab === 'queue' && <Queue />}
      {tab === 'legacy' && <Legacy />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

// ---------------- Queue ----------------
function Queue() {
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    const { data, error } = await supabase.from('listings')
      .select('id, title, location_text, landlord_id, authority_status, status')
      .in('authority_status', ['submitted', 'needs_evidence', 'on_hold']).order('created_at', { ascending: true }).limit(100)
    if (error) { setErr('Could not load the queue.'); setItems([]); return }
    setItems(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  // Property Review links here with ?listing=<id> so the admin lands on the right listing.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('listing')
    if (wanted && /^[0-9a-f-]{36}$/i.test(wanted)) setOpenId(wanted)
  }, [])

  if (openId) return <Detail id={openId} onBack={() => { window.history.replaceState(null, '', '/admin/listing-authority'); setOpenId(null); load() }} />
  return (
    <div className="space-y-2">
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing waiting for review.</p>
        : items.map((l) => (
          <button key={l.id} onClick={() => setOpenId(l.id)} className="block w-full rounded-lg border border-border bg-card p-3 text-left">
            <p className="font-semibold">{l.title || 'Untitled listing'}</p>
            <p className="text-xs text-muted-foreground">{l.location_text || 'No location'} &middot; listing {l.status}</p>
            <p className="mt-1 text-xs font-semibold">{authorityStatusInfo(l.authority_status).label}</p>
          </button>))}
    </div>
  )
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewDoc, setReviewDoc] = useState<string | null>(null)
  const [outcome, setOutcome] = useState('acceptable')
  const [docNote, setDocNote] = useState('')
  const [docReason, setDocReason] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [contacted, setContacted] = useState(false)
  const [source, setSource] = useState('')
  const [contactOutcome, setContactOutcome] = useState('')
  const [message, setMessage] = useState('')
  const [internal, setInternal] = useState('')
  const [keepReason, setKeepReason] = useState('')
  const [justAccepted, setJustAccepted] = useState(false)

  const load = useCallback(async () => {
    const [l, c, docs, revs, dr] = await Promise.all([
      supabase.from('listings').select('id, title, location_text, property_type, landlord_id, authority_status, status').eq('id', id).maybeSingle(),
      supabase.from('listing_authority_claims').select('*').eq('listing_id', id).maybeSingle(),
      supabase.from('listing_authority_documents').select('*').eq('listing_id', id).order('uploaded_at'),
      supabase.from('listing_authority_reviews').select('decision, reason_code, message, internal_note, decided_at').eq('listing_id', id).order('decided_at', { ascending: false }).limit(10),
      supabase.from('listing_document_reviews').select('document_id, outcome, note, created_at').eq('listing_id', id).order('created_at', { ascending: false }),
    ])
    const { data: lister } = l.data?.landlord_id
      ? await supabase.from('profiles').select('full_name, verified, verification_status').eq('id', l.data.landlord_id).maybeSingle()
      : { data: null }
    // other listings that share a file fingerprint (possible duplicate evidence)
    const shas = (docs.data ?? []).map((x: any) => x.sha256).filter(Boolean)
    const { data: dups } = shas.length
      ? await supabase.from('listing_authority_documents').select('listing_id, sha256').in('sha256', shas).neq('listing_id', id)
      : { data: [] as any[] }
    setD({ listing: l.data, claim: c.data, docs: docs.data ?? [], reviews: revs.data ?? [], docReviews: dr.data ?? [], lister, dups: dups ?? [] })
  }, [id])
  useEffect(() => { load() }, [load])

  async function openDoc(docId: string) {
    setErr(null)
    const w = window.open('', '_blank')
    const r = await adminGet(`/api/admin/listing-authority/document?id=${docId}`)
    if (!r.ok || !r.j?.url) { w?.close(); setErr(r.j?.error ?? 'Could not open the file.'); return }
    if (w) w.location.href = r.j.url; else window.location.href = r.j.url
    setTimeout(load, 800)
  }

  async function saveDocReview(docId: string) {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('admin_review_authority_document', { p_document: docId, p_outcome: outcome, p_note: docNote || null, p_landlord_reason: docReason.trim() || null })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setReviewDoc(null); setDocNote(''); setDocReason(''); setOutcome('acceptable'); setMsg('Document review saved.')
    await load()
  }

  async function decide(decision: 'accepted' | 'rejected' | 'needs_evidence' | 'on_hold') {
    if (!window.confirm(`Record decision: ${decision.replace('_', ' ')}?`)) return
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('admin_decide_listing_authority', {
      p_listing: id, p_decision: decision, p_message: message || null, p_internal_note: internal || null,
      p_checklist: decision === 'accepted' ? checks : null,
      p_owner_contact: contacted || source || contactOutcome ? { contacted, source: source || null, outcome: contactOutcome || null } : null,
    })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setMsg('Decision recorded.'); setMessage(''); setInternal(''); setChecks({})
    setJustAccepted(decision === 'accepted')
    await load()
  }

  async function keepAfterMinor() {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('admin_confirm_authority_unchanged', { p_listing: id, p_reason: keepReason })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setKeepReason(''); setMsg('Authority kept after a minor change.')
    await load()
  }

  if (!d) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
  if (!d.listing) return <div className="space-y-2"><button className={btn} onClick={onBack}>Back</button><p className="text-sm">Listing not found.</p></div>
  const { listing, claim, docs, reviews, docReviews, lister, dups } = d
  const status = listing.authority_status as string
  const reviewable = ['submitted', 'needs_evidence', 'on_hold', 'accepted'].includes(status)
  const lastReview = reviews[0]
  const canKeep = status === 'submitted' && lastReview?.decision === 'reopened' && lastReview?.reason_code === 'location_text'
  // Evidence that arrived after the last accepted assessment. These are what needs a fresh look.
  const lastAccepted = reviews.find((r: any) => r.decision === 'accepted' || r.decision === 'kept_unchanged')
  const isNew = (x: any) => !!lastAccepted && !x.withdrawn_at && new Date(x.uploaded_at).getTime() > new Date(lastAccepted.decided_at).getTime()
  const replacedBy = (docId: string) => docs.find((y: any) => y.supersedes_id === docId)
  const latestOutcome = (docId: string) => docReviews.find((r: any) => r.document_id === docId && r.outcome !== 'opened')?.outcome as string | undefined
  const opened = (docId: string) => docReviews.some((r: any) => r.document_id === docId && r.outcome === 'opened')

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> Back to queue</button>
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="font-semibold">{listing.title || 'Untitled listing'}</p>
        <p className="text-xs text-muted-foreground">{listing.location_text || 'No location'} &middot; {listing.property_type || 'type n/a'} &middot; listing {listing.status}</p>
        <p className="mt-1 text-xs">Lister: {lister?.full_name || 'n/a'} ({lister?.verified || ['verified', 'approved'].includes(lister?.verification_status) ? 'identity checked' : 'identity not checked'})</p>
        <p className="mt-1 text-xs font-semibold">Authority: {authorityStatusInfo(status).label}</p>
      </div>

      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}
      {justAccepted && listing.status !== 'approved' && (
        <Link href="/admin/property-review" className={`${btn} w-full border-primary bg-primary/5 text-primary`}>
          Next: approve this listing in Property Review
        </Link>)}

      <section className="space-y-1 rounded-lg border border-border p-3 text-sm">
        <h2 className="font-bold">Claim</h2>
        {claim ? (<>
          <p>Role: {roleLabel(claim.claimed_role)} &middot; Situation: {claim.situation}</p>
          {claim.owner_name && <p>Owner: {claim.owner_name} {claim.owner_phone ? `(${claim.owner_phone})` : ''}</p>}
          {claim.company_name && <p>Company: {claim.company_name} (CAC {claim.company_cac})</p>}
          {claim.declaration_note && <p>Note: {claim.declaration_note}</p>}
          <p className="text-xs text-muted-foreground">Submitted {when(claim.submitted_at)}</p>
        </>) : <p className="text-muted-foreground">No claim submitted.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Documents</h2>
        {dups.length > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{dups.length} file(s) here are identical to files submitted for {new Set(dups.map((x: any) => x.listing_id)).size} other listing(s). Check for duplicate or reused evidence.</p>}
        {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents.</p>}
        {docs.map((x: any) => (
          <div key={x.id} className={`space-y-2 rounded-lg border border-border p-3 text-sm ${x.withdrawn_at ? 'opacity-50' : ''}`}>
            <p className="flex flex-wrap items-center gap-2 font-semibold"><FileText size={16} aria-hidden /> {docLabel(x.doc_type)}{(x.version ?? 1) > 1 ? ` (version ${x.version})` : ''}{isNew(x) && <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">New since last accepted review</span>}</p>
            {x.description && <p className="text-xs">{x.description}</p>}
            {x.supersedes_id && <p className="text-xs text-muted-foreground">Replaces an earlier version.</p>}
            {replacedBy(x.id) && <p className="text-xs text-muted-foreground">Replaced by version {replacedBy(x.id).version}.</p>}
            <p className="break-all text-xs text-muted-foreground">{x.original_name} &middot; {when(x.uploaded_at)}{x.withdrawn_at ? ' · WITHDRAWN' : ''}</p>
            <p className="text-xs">{opened(x.id) ? 'Opened' : 'Not opened'} &middot; Review: {latestOutcome(x.id) ?? 'not reviewed'}</p>
            {!x.withdrawn_at && (
              <div className="flex flex-wrap gap-2">
                <button className={btn} onClick={() => openDoc(x.id)}>Open file</button>
                <button className={btn} onClick={() => setReviewDoc(reviewDoc === x.id ? null : x.id)}>Review</button>
              </div>)}
            {reviewDoc === x.id && (
              <div className="space-y-2 rounded-lg bg-secondary p-3">
                <select className={field} value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                <textarea className={field} rows={2} placeholder="Internal note (never shown to the landlord)" value={docNote} onChange={(e) => setDocNote(e.target.value)} />
                {(outcome === 'unclear' || outcome === 'concern') && (
                  <textarea className={field} rows={2} maxLength={500} placeholder="What the landlord should do about this document (they will see this)" value={docReason} onChange={(e) => setDocReason(e.target.value)} />)}
                <button className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={() => saveDocReview(x.id)}>Save review</button>
              </div>)}
          </div>))}
      </section>

      {canKeep && (
        <section className="space-y-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-semibold">Only the written location changed</p>
          <p>If this is a spelling or formatting fix, keep the existing review without new evidence.</p>
          <textarea className={field} rows={2} placeholder="Reason (required)" value={keepReason} onChange={(e) => setKeepReason(e.target.value)} />
          <button className={`${btn} bg-card`} disabled={busy || !keepReason.trim()} onClick={keepAfterMinor}>Keep authority review</button>
        </section>)}

      {reviewable && (
        <section className="space-y-3 rounded-lg border border-border p-3">
          <h2 className="font-bold">Decision</h2>
          <div className="space-y-1">{CHECKS.map((c) => (
            <label key={c.k} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={!!checks[c.k]} onChange={(e) => setChecks({ ...checks, [c.k]: e.target.checked })} /> {c.l}</label>))}</div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={contacted} onChange={(e) => setContacted(e.target.checked)} /> I contacted the owner or company</label>
          {contacted && (<>
            <input className={field} placeholder="Where did the contact details come from?" value={source} onChange={(e) => setSource(e.target.value)} />
            <input className={field} placeholder="Outcome of the contact" value={contactOutcome} onChange={(e) => setContactOutcome(e.target.value)} />
          </>)}
          <textarea className={field} rows={3} placeholder="Message the landlord will see (needed to reject or ask for evidence)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <textarea className={field} rows={2} placeholder="Internal note (needed for a hold; never shown to the landlord)" value={internal} onChange={(e) => setInternal(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <button className={`${btn} border-emerald-400 bg-emerald-50 text-emerald-900`} disabled={busy || status === 'accepted'} onClick={() => decide('accepted')}>Accept</button>
            <button className={`${btn} border-amber-400 bg-amber-50 text-amber-900`} disabled={busy} onClick={() => decide('needs_evidence')}>Need evidence</button>
            <button className={`${btn} border-red-400 bg-red-50 text-red-900`} disabled={busy} onClick={() => decide('rejected')}>Reject</button>
            <button className={`${btn} bg-card`} disabled={busy} onClick={() => decide('on_hold')}>Put on hold</button>
          </div>
        </section>)}

      <section className="space-y-1 text-xs text-muted-foreground">
        <h2 className="text-sm font-bold text-foreground">History</h2>
        {reviews.length === 0 ? <p>No decisions yet.</p> : reviews.map((r: any, i: number) => (
          <p key={i}>{when(r.decided_at)}: {r.decision}{r.reason_code ? ` (${r.reason_code})` : ''}{r.internal_note ? ` - ${r.internal_note}` : ''}</p>))}
      </section>
    </div>
  )
}

// ---------------- Legacy transition ----------------
function Legacy() {
  const [settings, setSettings] = useState<any>(null)
  const [pv, setPv] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('listing_authority_settings').select('transition_days, transition_started_at').maybeSingle()
    setSettings(data)
    if (data?.transition_started_at) {
      const { data: p, error } = await supabase.rpc('admin_authority_legacy_preview')
      if (error) setErr(friendlyAuthorityError(error.message)); else setPv(p)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    if (!window.confirm(`Start the transition? Every live listing gets ${settings?.transition_days ?? 30} days, and every lister is notified. This can only be done once.`)) return
    setBusy(true); setErr(null); setMsg(null)
    const { data, error } = await supabase.rpc('admin_authority_start_transition')
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setMsg(String(data)); await load()
  }

  async function run() {
    if (!pv || pv.eligible_count === 0) return
    if (!window.confirm(`Unpublish ${pv.eligible_count} listing(s)? Each lister is notified. Active applications and tenancies are never touched.`)) return
    setBusy(true); setErr(null); setMsg(null)
    const { data, error } = await supabase.rpc('admin_authority_run_batch', { p_expected_hash: pv.preview_hash, p_expected_count: pv.eligible_count, p_note: note || null })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); await load(); return }
    setMsg(`Done: ${data?.unpublished ?? 0} unpublished, ${data?.skipped_protected ?? 0} protected, ${data?.skipped_resolved ?? 0} resolved.`)
    setNote(''); await load()
  }

  if (!settings) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
  return (
    <div className="space-y-3">
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}
      {!settings.transition_started_at ? (
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p>The transition has not started. Starting it records every live listing, gives each lister {settings.transition_days} days to send authority evidence, and notifies them. Nothing is hidden by starting it.</p>
          <button className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={start}>Start transition</button>
        </div>
      ) : (
        <>
          <p className="text-sm">Started {when(settings.transition_started_at)}. {pv ? `${pv.eligible_count} listing(s) are past their deadline with no accepted review.` : ''}</p>
          {pv && (
            <div className="flex flex-wrap gap-2 text-xs">{Object.entries(pv.counts ?? {}).map(([k, n]) => <span key={k} className="rounded-full border border-border bg-card px-3 py-1">{k.replace(/_/g, ' ')}: {String(n)}</span>)}</div>)}
          <div className="space-y-2">
            {(pv?.items ?? []).map((it: any) => (
              <div key={it.listing_id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-semibold">{it.title || 'Untitled listing'}</p>
                <p className="text-xs text-muted-foreground">{it.status} &middot; deadline {when(it.deadline)} &middot; {String(it.reason).replace(/_/g, ' ')}</p>
              </div>))}
          </div>
          {pv && pv.eligible_count > 0 && (
            <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3">
              <p className="text-sm text-red-900">Unpublishing moves these listings to pending. They return once authority is accepted.</p>
              <input className={field} placeholder="Note for the record (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className={`${btn} border-red-400 bg-white text-red-900`} disabled={busy} onClick={run}>Unpublish {pv.eligible_count} listing(s)</button>
            </div>)}
        </>)}
    </div>
  )
}

// ---------------- Settings ----------------
function Settings() {
  const [tol, setTol] = useState<number | null>(null)
  const [val, setVal] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('listing_authority_settings').select('gps_tolerance_m').maybeSingle()
    if (data) { setTol(Number(data.gps_tolerance_m)); setVal(String(data.gps_tolerance_m)) }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('admin_set_gps_tolerance', { p_metres: Number(val), p_reason: reason })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setReason(''); setMsg('Saved.'); await load()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h2 className="font-bold">Pin tolerance</h2>
      <p className="text-sm text-muted-foreground">A pin moved less than this distance from the reviewed pin does not reopen authority review. Written location changes are always judged separately. Currently {tol ?? '...'} m.</p>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}
      <input className={field} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} aria-label="Tolerance in metres" />
      <input className={field} placeholder="Reason for the change" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={`${btn} bg-primary text-primary-foreground`} disabled={busy || !reason.trim()} onClick={save}>Save tolerance</button>
    </div>
  )
  }
