'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Loader2, ArrowLeft, Upload, FileText, Trash2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  AUTHORITY_DOC_TYPES, AUTHORITY_ROLES, AUTHORITY_SITUATIONS, authorityStatusInfo, missingForClaim,
} from '@/lib/listing-authority'
import { AUTHORITY_ACCEPT, AUTHORITY_BUCKET, friendlyAuthorityError, validateAuthorityFileMeta } from '@/lib/authority-evidence'

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const label = 'mb-1 block text-sm font-semibold text-foreground'
const TONE: Record<string, string> = {
  neutral: 'border-slate-300 bg-slate-50 text-slate-900',
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
}
const docLabel = (v: string) => AUTHORITY_DOC_TYPES.find((d) => d.value === v)?.label ?? v

async function authedFetch(path: string, body: unknown) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

type Doc = { id: string; doc_type: string; name: string | null; uploaded_at: string; withdrawn_at: string | null }

export default function ListingAuthorityPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [info, setInfo] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [role, setRole] = useState('')
  const [situation, setSituation] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCac, setCompanyCac] = useState('')
  const [note, setNote] = useState('')
  const [docType, setDocType] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setErr(null)
    const [{ data: l }, { data, error }] = await Promise.all([
      supabase.from('listings').select('title').eq('id', id).maybeSingle(),
      supabase.rpc('my_listing_authority', { p_listing: id }),
    ])
    if (error) { setErr(friendlyAuthorityError(error.message, 'Could not load this page.')); setLoading(false); return }
    setTitle(l?.title ?? 'Your listing')
    setInfo(data)
    const c = data?.claim
    if (c) {
      setRole(c.claimed_role ?? ''); setSituation(c.situation ?? ''); setOwnerName(c.owner_name ?? ''); setOwnerPhone(c.owner_phone ?? '')
      setCompanyName(c.company_name ?? ''); setCompanyCac(c.company_cac ?? ''); setNote(c.declaration_note ?? '')
    }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const docs: Doc[] = info?.documents ?? []
  const activeDocs = docs.filter((d) => !d.withdrawn_at)
  const status = info?.status as string | undefined
  const statusInfo = authorityStatusInfo(status)
  const locked = status === 'on_hold'
  const missing = useMemo(
    () => (role ? missingForClaim({ role, ownerName, ownerPhone, companyName, companyCac, note }, docs) : ['Your relationship to the property']),
    [role, ownerName, ownerPhone, companyName, companyCac, note, docs],
  )
  const showOwner = role === 'agent' || role === 'manager'
  const showCompany = role === 'company_representative'

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(null); setMsg(null)
    if (!docType) { setErr('Choose what kind of document this is first.'); return }
    const bad = validateAuthorityFileMeta(file.type, file.size)
    if (bad) { setErr(bad); return }
    setBusy(true)
    try {
      const p = await authedFetch('/api/listing-authority/prepare', { listing_id: id, mime: file.type, bytes: file.size })
      if (!p.ok) { setErr(p.j?.error ?? 'Could not prepare the upload.'); return }
      const up = await supabase.storage.from(AUTHORITY_BUCKET).uploadToSignedUrl(p.j.path, p.j.token, file, { contentType: file.type })
      if (up.error) { setErr('The upload failed. Check your connection and try again.'); return }
      const r = await authedFetch('/api/listing-authority/documents', { listing_id: id, doc_type: docType, path: p.j.path, name: file.name })
      if (!r.ok) { setErr(r.j?.error ?? 'Could not save your document.'); return }
      setMsg('Document added.'); setDocType('')
      await load()
    } finally { setBusy(false) }
  }

  async function withdraw(docId: string) {
    if (!window.confirm('Withdraw this document? EboHomes keeps a record that it was submitted.')) return
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('withdraw_authority_document', { p_document: docId })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setMsg('Document withdrawn.')
    await load()
  }

  async function submit() {
    setBusy(true); setErr(null); setMsg(null)
    const { data, error } = await supabase.rpc('submit_listing_authority', {
      p_listing: id, p_role: role, p_situation: situation || null,
      p_owner_name: showOwner ? ownerName : null, p_owner_phone: showOwner ? ownerPhone : null,
      p_company_name: showCompany ? companyName : null, p_company_cac: showCompany ? companyCac : null,
      p_note: note || null,
    })
    setBusy(false)
    if (error) { setErr(friendlyAuthorityError(error.message)); return }
    setMsg(typeof data === 'string' && data !== 'ok' ? data : 'Sent to EboHomes for review.')
    await load()
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
          <select id="role" className={field} value={role} disabled={locked || busy} onChange={(e) => setRole(e.target.value)}>
            <option value="">Choose...</option>
            {AUTHORITY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="sit">Property situation</label>
          <select id="sit" className={field} value={situation} disabled={locked || busy} onChange={(e) => setSituation(e.target.value)}>
            <option value="">Choose...</option>
            {AUTHORITY_SITUATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {showOwner && (<>
          <div><label className={label} htmlFor="on">Owner full name</label>
            <input id="on" className={field} value={ownerName} disabled={locked || busy} onChange={(e) => setOwnerName(e.target.value)} /></div>
          <div><label className={label} htmlFor="op">Owner phone number</label>
            <input id="op" inputMode="tel" className={field} value={ownerPhone} disabled={locked || busy} onChange={(e) => setOwnerPhone(e.target.value)} /></div>
        </>)}
        {showCompany && (<>
          <div><label className={label} htmlFor="cn">Company name</label>
            <input id="cn" className={field} value={companyName} disabled={locked || busy} onChange={(e) => setCompanyName(e.target.value)} /></div>
          <div><label className={label} htmlFor="cc">Company CAC number</label>
            <input id="cc" className={field} value={companyCac} disabled={locked || busy} onChange={(e) => setCompanyCac(e.target.value)} /></div>
        </>)}
        <div>
          <label className={label} htmlFor="note">{role === 'other' ? 'Explain your relationship to the property' : 'Anything EboHomes should know (optional)'}</label>
          <textarea id="note" rows={3} className={field} value={note} disabled={locked || busy} onChange={(e) => setNote(e.target.value)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold">Documents</h2>
        {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className={`flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm ${d.withdrawn_at ? 'opacity-50' : ''}`}>
              <span className="flex min-w-0 items-center gap-2"><FileText size={16} aria-hidden className="shrink-0" />
                <span className="min-w-0"><span className="block font-semibold">{docLabel(d.doc_type)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{d.name ?? 'File'}{d.withdrawn_at ? ' (withdrawn)' : ''}</span></span></span>
              {!d.withdrawn_at && !locked && (
                <button onClick={() => withdraw(d.id)} disabled={busy} aria-label="Withdraw document" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border"><Trash2 size={16} aria-hidden /></button>)}
            </li>))}
        </ul>
        {!locked && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <label className={label} htmlFor="dt">Add a document</label>
            <select id="dt" className={field} value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value)}>
              <option value="">What kind of document is it?</option>
              {AUTHORITY_DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <input ref={fileRef} type="file" accept={AUTHORITY_ACCEPT} className="hidden" onChange={upload} />
            <button type="button" disabled={busy || !docType} onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} aria-hidden />} Choose file (JPG, PNG, WEBP or PDF, up to 10MB)
            </button>
          </div>)}
      </section>

      {missing.length > 0 && !locked && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Still needed before you can send:</p>
          <ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>)}
      {!situation && !locked && role && <p className="text-xs text-muted-foreground">Choose the property situation too.</p>}

      <button type="button" onClick={submit} disabled={busy || locked || missing.length > 0 || !situation}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {status === 'accepted' ? 'Send changes for review' : status === 'not_submitted' || !status ? 'Send to EboHomes' : 'Send again'}
      </button>
      <p className="text-center text-xs text-muted-foreground">{activeDocs.length} active document{activeDocs.length === 1 ? '' : 's'}</p>
    </div>
  )
                    }
