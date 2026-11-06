'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, Upload, FileText, Trash2, ShieldCheck, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  AUTHORITY_DOC_TYPES, AUTHORITY_ROLES, AUTHORITY_SITUATIONS, authorityStatusInfo, documentStatusInfo, missingForClaim, needsDescription,
} from '@/lib/listing-authority'
import { AUTHORITY_ACCEPT, AUTHORITY_BUCKET, friendlyAuthorityError, validateAuthorityFileMeta } from '@/lib/authority-evidence'
import PayeeRequestSection from '@/components/payee-request-section'

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const label = 'mb-1 block text-sm font-semibold text-foreground'
const TONE: Record<string, string> = {
  neutral: 'border-slate-300 bg-slate-50 text-slate-900',
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
}
const docLabel = (v: string) => AUTHORITY_DOC_TYPES.find((d) => d.value === v)?.label ?? v
const PRO_ROLES = ['agent', 'manager', 'company_representative']

// What the professional-profile gate means for the lister. The server enforces it again on submit.
function gateInfo(code?: string): { tone: string; title: string; text: string; apply: boolean } | null {
  switch (code) {
    case 'blocked_none': return { tone: 'warn', apply: true, title: 'A professional profile is needed to send this',
      text: 'Agents, property managers and company representatives need an approved professional profile before sending a property for review. You can keep filling this in. Your draft is saved.' }
    case 'blocked_pending': return { tone: 'warn', apply: true, title: 'Your professional profile is being reviewed',
      text: 'You can keep editing your draft, but it can only be sent after your professional profile is approved.' }
    case 'blocked_rejected': return { tone: 'bad', apply: true, title: 'Your professional application was not approved',
      text: 'This cannot be sent for review until you update your application and it is approved. Your draft is kept.' }
    case 'blocked_suspended': return { tone: 'bad', apply: false, title: 'Your professional profile is suspended',
      text: 'Please contact EboHomes. Your draft is kept.' }
    case 'legacy_exemption': return { tone: 'neutral', apply: true, title: 'Existing listing: transition period',
      text: 'This listing was already live before professional profiles were introduced, so you can still send it for review until its transition deadline. After that, a professional profile is needed.' }
    case 'approved': return { tone: 'good', apply: false, title: 'Professional profile approved',
      text: 'This only confirms you as a professional. It does not approve this property. EboHomes still reviews the evidence for it.' }
    default: return null
  }
}

async function authedFetch(path: string, body: unknown) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

type Doc = {
  id: string; doc_type: string; name: string | null; uploaded_at: string; withdrawn_at: string | null
  version?: number; supersedes_id?: string | null; description?: string | null; status?: string; reason?: string | null
}

export default function ListingAuthorityPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [info, setInfo] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [gate, setGate] = useState<{ allowed: boolean; code: string; professional_status?: string } | null>(null)
  const [touched, setTouched] = useState(false)
  const [draftAt, setDraftAt] = useState<string | null>(null)
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const initialised = useRef(false)

  const [role, setRole] = useState('')
  const [situation, setSituation] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCac, setCompanyCac] = useState('')
  const [note, setNote] = useState('')
  const [docType, setDocType] = useState('')
  const [desc, setDesc] = useState('')
  const [replacing, setReplacing] = useState<Doc | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setErr(null)
    const [{ data: l }, { data, error }] = await Promise.all([
      supabase.from('listings').select('title').eq('id', id).maybeSingle(),
      supabase.rpc('my_listing_authority', { p_listing: id }),
    ])
    if (error) { setErr(friendlyAuthorityError(error.message, 'Could not load this page.')); setLoading(false); return }
    setTitle(l?.title ?? 'Your listing')
    setInfo(data)
    // Fill the form once. Later reloads (after an upload, for example) must not wipe what the person is typing.
    if (!initialised.current) {
      initialised.current = true
      const c = data?.claim
      if (c) {
        setRole(c.claimed_role ?? ''); setSituation(c.situation ?? ''); setOwnerName(c.owner_name ?? ''); setOwnerPhone(c.owner_phone ?? '')
        setCompanyName(c.company_name ?? ''); setCompanyCac(c.company_cac ?? ''); setNote(c.declaration_note ?? '')
      }
      // A saved draft is newer than the last sent claim, so it wins. A draft is not a claim and proves nothing.
      const { data: dr } = await supabase.rpc('my_authority_draft', { p_listing: id })
      if (dr?.found) {
        setRole(dr.claimed_role ?? ''); setSituation(dr.situation ?? ''); setOwnerName(dr.owner_name ?? ''); setOwnerPhone(dr.owner_phone ?? '')
        setCompanyName(dr.company_name ?? ''); setCompanyCac(dr.company_cac ?? ''); setNote(dr.declaration_note ?? '')
        setDraftAt(dr.updated_at ?? null)
      }
    }
    setLoading(false)
    return data
  }, [id])
  useEffect(() => { load() }, [load])

  const docs: Doc[] = info?.documents ?? []
  const activeDocs = docs.filter((d) => !d.withdrawn_at)
  const oldDocs = docs.filter((d) => d.withdrawn_at)
  const status = info?.status as string | undefined
  const statusInfo = authorityStatusInfo(status)
  // While EboHomes has the evidence (submitted or on hold) the lister cannot change or resend it.
  // After 'needs evidence', 'rejected' or 'accepted' they can edit and send again, as many times as needed.
  const underReview = status === 'submitted' || status === 'on_hold'
  const canEdit = !underReview
  const locked = !canEdit
  const missing = useMemo(
    () => (role ? missingForClaim({ role, ownerName, ownerPhone, companyName, companyCac, note }, docs) : ['Your relationship to the property']),
    [role, ownerName, ownerPhone, companyName, companyCac, note, docs],
  )
  const showOwner = role === 'agent' || role === 'manager'
  const showCompany = role === 'company_representative'
  const gateBlocked = !!gate && !gate.allowed
  const gateText = gateInfo(gate?.code)

  const ed = (fn: (v: string) => void) => (v: string) => { setTouched(true); fn(v) }

  // Does this person's professional status allow sending this role right now? (The server checks again on submit.)
  useEffect(() => {
    if (loading || !role) { setGate(null); return }
    let alive = true
    supabase.rpc('authority_submit_eligibility', { p_listing: id, p_role: role }).then(({ data }) => { if (alive) setGate(data ?? null) })
    return () => { alive = false }
  }, [id, role, loading])

  async function saveDraft(): Promise<boolean> {
    setDraftErr(null)
    const { error } = await supabase.rpc('save_authority_draft', {
      p_listing: id, p_role: role || null, p_situation: situation || null,
      p_owner_name: ownerName || null, p_owner_phone: ownerPhone || null,
      p_company_name: companyName || null, p_company_cac: companyCac || null, p_note: note || null,
    })
    if (error) { setDraftErr(friendlyAuthorityError(error.message, 'Could not save your draft.')); return false }
    setDraftAt(new Date().toISOString()); setTouched(false)
    return true
  }

  // Autosave 1.5 seconds after the last edit.
  useEffect(() => {
    if (!touched || locked || loading) return
    const t = setTimeout(() => { void saveDraft() }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, role, situation, ownerName, ownerPhone, companyName, companyCac, note])

  // The person pressed send but their professional status does not allow it. Keep the draft and say why.
  async function blockedAttempt() {
    setErr(null); setMsg(null); setBusy(true)
    await saveDraft()
    void supabase.rpc('professional_log_blocked_submit', { p_listing: id, p_role: role })
    setBusy(false)
    setErr(gateInfo(gate?.code)?.text ?? 'This cannot be sent for review right now.')
  }

  // One path for "add" and "replace". For a replacement the old document is named, and the kind stays the same.
  async function sendFile(file: File, type: string, supersedesId: string | null, description: string | null) {
    setErr(null); setMsg(null)
    const bad = validateAuthorityFileMeta(file.type, file.size)
    if (bad) { setErr(bad); return }
    const before = status
    setBusy(true)
    try {
      const p = await authedFetch('/api/listing-authority/prepare', { listing_id: id, mime: file.type, bytes: file.size })
      if (!p.ok) { setErr(p.j?.error ?? 'Could not prepare the upload.'); return }
      const up = await supabase.storage.from(AUTHORITY_BUCKET).uploadToSignedUrl(p.j.path, p.j.token, file, { contentType: file.type })
      if (up.error) { setErr('The upload failed. Check your connection and try again.'); return }
      const r = await authedFetch('/api/listing-authority/documents', {
        listing_id: id, doc_type: type, path: p.j.path, name: file.name,
        supersedes_id: supersedesId, description: description || null,
      })
      if (!r.ok) { setErr(r.j?.error ?? 'Could not save your document.'); return }
      const fresh = await load()
      if (before === 'accepted' && fresh?.status === 'submitted') setMsg('Saved. Because this changed your evidence, EboHomes will check your listing again. It stays as it is meanwhile.')
      else if (supersedesId) setMsg('Document replaced. The earlier version is kept on record.')
      else if (before === 'accepted') setMsg('Document added. EboHomes will look at it at the next check.')
      else setMsg('Document added.')
      setDocType(''); setDesc('')
    } finally { setBusy(false) }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!docType) { setErr('Choose what kind of document this is first.'); return }
    if (needsDescription(docType) && desc.trim().length < 5) { setErr('Write a short description of this document first.'); return }
    await sendFile(file, docType, null, desc.trim() || null)
  }

  function startReplace(d: Doc) {
    if (status === 'accepted' && d.status === 'accepted'
      && !window.confirm('EboHomes already accepted this document. If you replace it, EboHomes will check your listing again. Your listing stays as it is meanwhile. Continue?')) return
    setReplacing(d)
    replaceRef.current?.click()
  }

  async function replaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const old = replacing
    setReplacing(null)
    if (!file || !old) return
    let description: string | null = old.description ?? null
    if (needsDescription(old.doc_type)) {
      const d = window.prompt('Short description of this document', old.description ?? '')
      if (d === null) return
      description = d.trim()
      if (description.length < 5) { setErr('Write a short description of this document.'); return }
    }
    await sendFile(file, old.doc_type, old.id, description)
  }

  async function withdraw(docId: string) {
    const d = docs.find((x) => x.id === docId)
    const warn = status === 'accepted' && d?.status === 'accepted' ? ' EboHomes already accepted it, so withdrawing it means EboHomes will check your listing again.' : ''
    if (!window.confirm(`Withdraw this document? EboHomes keeps a record that it was submitted.${warn}`)) return
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('withdraw_authority_document', { p_document: docId })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    const fresh = await load()
    setMsg(status === 'accepted' && fresh?.status === 'submitted' ? 'Document withdrawn. EboHomes will check your listing again.' : 'Document withdrawn.')
  }

  async function submit() {
    if (gateBlocked) { await blockedAttempt(); return }
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('submit_listing_authority', {
      p_listing: id, p_role: role, p_situation: situation || null,
      p_owner_name: showOwner ? ownerName : null, p_owner_phone: showOwner ? ownerPhone : null,
      p_company_name: showCompany ? companyName : null, p_company_cac: showCompany ? companyCac : null,
      p_note: note || null,
    })
    if (error) {
      setBusy(false)
      // The professional-profile gate uses its own plain messages (error code 42501).
      setErr(error.code === '42501' && /professional/i.test(error.message) ? error.message : friendlyAuthorityError(error.message))
      await load() // the status may have changed (for example it was already sent from another tab)
      return
    }
    // Sent. Move on to the listings page so the lister is not left on this form.
    router.replace('/dashboard/listings?sent=authority')
  }

  if (loading) return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
  if (!info) return (
    <div className="mx-auto max-w-xl space-y-3 p-4">
      <Link href="/dashboard/listings" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> My listings</Link>
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err ?? 'Listing not found.'}</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-24">
      <Link href="/dashboard/listings" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> My listings</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><ShieldCheck size={20} aria-hidden /> Property authority</h1>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>

      <div className={`rounded-lg border p-3 text-sm ${TONE[statusInfo.tone]}`}>
        <p className="font-semibold">{statusInfo.label}</p>
        <p>{statusInfo.detail}</p>
        {info.last_message?.message && <p className="mt-2 border-t border-current/20 pt-2">{info.last_message.message}</p>}
        {status === 'submitted' && <p className="mt-2 border-t border-current/20 pt-2">You cannot send again while EboHomes is reviewing. We will notify you when there is a decision.</p>}
        {(status === 'needs_evidence' || status === 'rejected') && <p className="mt-2 border-t border-current/20 pt-2">You can fix this and send it again as many times as you need.</p>}
      </div>

      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        EboHomes reviews the evidence you send to see that you may list this property. This is a review of documents, not a legal guarantee of ownership.
        Your documents are private. Only EboHomes staff can open them.
      </p>

      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}

      <section className="space-y-3">
        <h2 className="text-base font-bold">Your relationship to the property</h2>
        <div>
          <label className={label} htmlFor="role">I am</label>
          <select id="role" className={field} value={role} disabled={locked || busy} onChange={(e) => ed(setRole)(e.target.value)}>
            <option value="">Choose...</option>
            {AUTHORITY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="sit">Property situation</label>
          <select id="sit" className={field} value={situation} disabled={locked || busy} onChange={(e) => ed(setSituation)(e.target.value)}>
            <option value="">Choose...</option>
            {AUTHORITY_SITUATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {showOwner && (<>
          <div><label className={label} htmlFor="on">Owner full name</label>
            <input id="on" className={field} value={ownerName} disabled={locked || busy} onChange={(e) => ed(setOwnerName)(e.target.value)} /></div>
          <div><label className={label} htmlFor="op">Owner phone number</label>
            <input id="op" inputMode="tel" className={field} value={ownerPhone} disabled={locked || busy} onChange={(e) => ed(setOwnerPhone)(e.target.value)} /></div>
        </>)}
        {showCompany && (<>
          <div><label className={label} htmlFor="cn">Company name</label>
            <input id="cn" className={field} value={companyName} disabled={locked || busy} onChange={(e) => ed(setCompanyName)(e.target.value)} /></div>
          <div><label className={label} htmlFor="cc">Company CAC number</label>
            <input id="cc" className={field} value={companyCac} disabled={locked || busy} onChange={(e) => ed(setCompanyCac)(e.target.value)} /></div>
        </>)}
        <div>
          <label className={label} htmlFor="note">{role === 'other' ? 'Explain your relationship to the property' : 'Anything EboHomes should know (optional)'}</label>
          <textarea id="note" rows={3} className={field} value={note} disabled={locked || busy} onChange={(e) => ed(setNote)(e.target.value)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold">Documents</h2>
        {activeDocs.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        <ul className="space-y-2">
          {activeDocs.map((d) => {
            const si = documentStatusInfo(d.status)
            return (
              <li key={d.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><FileText size={16} aria-hidden className="shrink-0" />
                    <span className="min-w-0"><span className="block font-semibold">{docLabel(d.doc_type)}{(d.version ?? 1) > 1 ? ` (version ${d.version})` : ''}</span>
                      <span className="block truncate text-xs text-muted-foreground">{d.name ?? 'File'}</span>
                      {d.description && <span className="block text-xs text-muted-foreground">{d.description}</span>}</span></span>
                  {!locked && (
                    <span className="flex shrink-0 gap-1">
                      <button onClick={() => startReplace(d)} disabled={busy} aria-label="Replace document" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border"><RefreshCw size={16} aria-hidden /></button>
                      <button onClick={() => withdraw(d.id)} disabled={busy} aria-label="Withdraw document" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border"><Trash2 size={16} aria-hidden /></button>
                    </span>)}
                </div>
                <p className={`rounded-md border px-2 py-1 text-xs font-semibold ${TONE[si.tone]}`}>{si.label}</p>
                {d.reason && <p className="text-xs text-foreground">EboHomes says: {d.reason}</p>}
              </li>)
          })}
        </ul>
        {oldDocs.length > 0 && (
          <details className="rounded-lg border border-border p-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Earlier versions ({oldDocs.length})</summary>
            <ul className="space-y-1 pt-1">
              {oldDocs.map((d) => (
                <li key={d.id} className="text-xs text-muted-foreground">
                  {docLabel(d.doc_type)}{(d.version ?? 1) > 1 ? ` v${d.version}` : ''}: {d.name ?? 'File'} ({documentStatusInfo(d.status).label.toLowerCase()})
                </li>))}
            </ul>
          </details>)}
        <input ref={replaceRef} type="file" accept={AUTHORITY_ACCEPT} className="hidden" onChange={replaceFile} />
        {!locked && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <label className={label} htmlFor="dt">Add a document</label>
            <select id="dt" className={field} value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value)}>
              <option value="">What kind of document is it?</option>
              {AUTHORITY_DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {needsDescription(docType) && (
              <input className={field} placeholder="Short description of this document (required)" maxLength={500} value={desc} disabled={busy} onChange={(e) => setDesc(e.target.value)} aria-label="Document description" />)}
            <input ref={fileRef} type="file" accept={AUTHORITY_ACCEPT} className="hidden" onChange={upload} />
            <button type="button" disabled={busy || !docType || (needsDescription(docType) && desc.trim().length < 5)} onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} aria-hidden />} Choose file (JPG, PNG, WEBP or PDF, up to 10MB)
            </button>
          </div>)}
      </section>

      {status === 'accepted' && PRO_ROLES.includes(info?.claim?.claimed_role) && (
        <PayeeRequestSection listingId={id} claimedRole={info.claim.claimed_role} />
      )}

      {canEdit ? (
        <>
          {PRO_ROLES.includes(role) && gateText && (
            <div className={`rounded-lg border p-3 text-sm ${TONE[gateText.tone]}`}>
              <p className="font-semibold">{gateText.title}</p>
              <p>{gateText.text}</p>
              {gateText.apply && gate?.code !== 'approved' && (
                <Link href="/dashboard/professional" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">
                  {gate?.code === 'blocked_none' ? 'Apply for a professional profile' : 'View my professional application'}
                </Link>)}
            </div>)}
          <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            Your progress is saved as a draft. A draft is not a claim: it is not sent to EboHomes and does not make this property verified, approved or authorized.
          </p>
          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Still needed before you can send:</p>
              <ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>)}
          {!situation && role && <p className="text-xs text-muted-foreground">Choose the property situation too.</p>}
          <button type="button" onClick={submit} disabled={busy || missing.length > 0 || !situation}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {status === 'accepted' ? 'Send changes for review' : status === 'needs_evidence' || status === 'rejected' ? 'Send again' : 'Send to EboHomes'}
          </button>
          <button type="button" disabled={busy || (!role && !situation && !ownerName && !companyName && !note)} onClick={async () => { setMsg(null); const ok = await saveDraft(); if (ok) setMsg('Draft saved. It is not sent to EboHomes.') }}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold disabled:opacity-50">
            Save draft
          </button>
          {draftErr && <p role="alert" className="text-center text-xs text-red-900">{draftErr}</p>}
          {!draftErr && draftAt && <p className="text-center text-xs text-muted-foreground">{touched ? 'Saving...' : `Draft saved ${new Date(draftAt).toLocaleString('en-NG')}`}</p>}
          <p className="text-center text-xs text-muted-foreground">{activeDocs.length} active document{activeDocs.length === 1 ? '' : 's'}</p>
        </>
      ) : (
        <Link href="/dashboard/listings"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Back to my listings
        </Link>
      )}
    </div>
  )
                                                                                                                                                                         }
