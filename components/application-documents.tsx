'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, Loader2, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  APP_DOC_ACCEPT,
  APP_DOC_BUCKET,
  APP_DOC_KINDS,
  APP_DOC_LABEL,
  validateAppDocKind,
  validateAppDocMeta,
  type AppDocKind,
} from '@/lib/application-documents'

type Mode = 'tenant' | 'admin' | 'landlord'
type Doc = { id: string; kind: AppDocKind; label: string | null; original_name: string | null; status: string; uploaded_at: string }
type Summary = { kind: AppDocKind; uploaded_at: string }

async function authed(path: string, init?: { method?: string; body?: unknown }) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

const day = (d: string) => {
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-NG')
}

const field = 'w-full min-h-11 rounded-md border border-border bg-input px-3 py-2 text-sm'

export function ApplicationDocuments({
  applicationId,
  mode,
  canEdit = false,
}: {
  applicationId: string
  mode: Mode
  canEdit?: boolean
}) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [summary, setSummary] = useState<Summary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [kind, setKind] = useState<AppDocKind>('proof_of_income')
  const [label, setLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)

  const load = useCallback(async () => {
    if (mode === 'landlord') {
      const { data, error } = await supabase.rpc('eb_application_document_summary', { p_application: applicationId })
      if (error) setUnavailable(true)
      else setSummary((data ?? []) as Summary[])
    } else {
      const { data, error } = await supabase
        .from('application_documents')
        .select('id, kind, label, original_name, status, uploaded_at')
        .eq('application_id', applicationId)
        .order('uploaded_at', { ascending: false })
      if (error) setUnavailable(true)
      else setDocs((data ?? []) as Doc[])
    }
    setLoaded(true)
  }, [applicationId, mode])

  useEffect(() => {
    void load()
  }, [load])

  async function open(id: string) {
    setErr(null)
    const r = await authed(`/api/application-documents/open?id=${encodeURIComponent(id)}`)
    if (!r.ok || !r.j?.url) {
      setErr(r.j?.error ?? 'Could not open the file.')
      return
    }
    const w = window.open(r.j.url, '_blank', 'noopener')
    if (!w) window.location.href = r.j.url
  }

  async function upload() {
    if (busy) return
    setErr(null)
    setMsg(null)
    const k = validateAppDocKind(kind, label)
    if (!k.ok) {
      setErr(k.error)
      return
    }
    if (!file) {
      setErr('Choose a file first.')
      return
    }
    const bad = validateAppDocMeta(file.type, file.size)
    if (bad) {
      setErr(bad)
      return
    }
    setBusy(true)
    try {
      const p = await authed('/api/application-documents/prepare', {
        method: 'POST',
        body: { application_id: applicationId, mime: file.type, bytes: file.size },
      })
      if (!p.ok) {
        setErr(p.j?.error ?? 'Could not prepare the upload.')
        return
      }
      const up = await supabase.storage
        .from(APP_DOC_BUCKET)
        .uploadToSignedUrl(p.j.path, p.j.token, file, { contentType: file.type })
      if (up.error) {
        setErr('The upload failed. Check your connection and try again.')
        return
      }
      const r = await authed('/api/application-documents', {
        method: 'POST',
        body: {
          application_id: applicationId,
          kind: k.kind,
          label: k.label,
          path: p.j.path,
          name: file.name,
          mime: file.type,
          bytes: file.size,
        },
      })
      if (!r.ok) {
        setErr(r.j?.error ?? 'Could not save the document.')
        return
      }
      setMsg('Document saved. Only you and EboHomes staff can open it.')
      setFile(null)
      setLabel('')
      setFileKey((n) => n + 1)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy) return
    if (!window.confirm('Remove this document from your application?')) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    const r = await authed('/api/application-documents/remove', { method: 'POST', body: { id } })
    if (!r.ok) setErr(r.j?.error ?? 'Could not remove the document.')
    else setMsg('Document removed.')
    setBusy(false)
    await load()
  }

  if (!loaded || unavailable) return null

  // ---------- Landlord: types only ----------
  if (mode === 'landlord') {
    return (
      <div className="rounded-md border border-border bg-secondary/60 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <ShieldCheck size={14} aria-hidden /> Documents the applicant gave EboHomes
        </p>
        {summary.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No documents provided yet.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-xs text-foreground">
            {summary.map((s, i) => (
              <li key={`${s.kind}-${i}`}>{APP_DOC_LABEL[s.kind] ?? 'Document'} provided</li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          EboHomes checks these privately. Applicant files are not shared with landlords.
        </p>
      </div>
    )
  }

  const shown = mode === 'admin' ? docs : docs.filter((d) => d.status === 'active')

  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <FileText size={14} aria-hidden /> {mode === 'admin' ? 'Applicant documents' : 'Your documents (optional)'}
      </p>
      {mode === 'tenant' && (
        <p className="text-xs text-muted-foreground">
          Only you and EboHomes staff can open these. Landlords and other applicants cannot. A new file of the same type replaces the old one.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents provided.</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/60 px-3 py-2">
              <span className="min-w-0 text-xs">
                <span className="font-semibold text-foreground">
                  {APP_DOC_LABEL[d.kind] ?? 'Document'}
                  {d.kind === 'other' && d.label ? `: ${d.label}` : ''}
                </span>
                <span className="block truncate text-muted-foreground">
                  {d.original_name ?? 'file'} · {day(d.uploaded_at)}
                  {d.status !== 'active' ? ` · ${d.status}` : ''}
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void open(d.id)}
                  className="min-h-11 rounded-md border border-border px-3 text-xs font-semibold"
                >
                  Open
                </button>
                {mode === 'tenant' && canEdit && d.status === 'active' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(d.id)}
                    aria-label="Remove document"
                    className="min-h-11 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-destructive disabled:opacity-60"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mode === 'tenant' && canEdit && (
        <fieldset disabled={busy} className="space-y-2 border-t border-border pt-3">
          <legend className="sr-only">Add a document</legend>
          <label className="block text-xs font-semibold text-foreground">
            Type of document
            <select value={kind} onChange={(e) => setKind(e.target.value as AppDocKind)} className={`${field} mt-1`}>
              {APP_DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {APP_DOC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {kind === 'other' && (
            <label className="block text-xs font-semibold text-foreground">
              What is it?
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={`${field} mt-1`} />
            </label>
          )}
          <input
            key={fileKey}
            type="file"
            accept={APP_DOC_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="Choose a file"
            className="block w-full text-xs"
          />
          <p className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF. Maximum 8MB.</p>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={busy || !file}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
            {busy ? 'Uploading…' : 'Upload document'}
          </button>
        </fieldset>
      )}

      {err && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-900">
          {err}
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs font-medium text-emerald-900">
          {msg}
        </p>
      )}
    </div>
  )
      }
