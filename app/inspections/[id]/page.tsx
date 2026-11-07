'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Lock, MapPin } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { supabase } from '@/lib/supabase'
import { fmtDateTime } from '@/lib/case-status'
import {
  FINDING_LABEL,
  REPORT_PRIVACY_NOTE,
  TONE_CLASS,
  friendlyError,
  matchText,
  verdictText,
  type Report,
  type ReportFile,
} from '@/lib/remote-inspection'

const btnS = 'min-h-11 px-4 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50'

// Short-lived link for one file. The server checks that the file is in THIS tenant's released report.
async function fileUrl(id: string): Promise<string | null> {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(`/api/inspection-evidence/report?file=${id}`, { headers: { Authorization: `Bearer ${t}` } })
  const j = await res.json().catch(() => null)
  return res.ok && typeof j?.url === 'string' ? j.url : null
}

// The tenant's private report. Nothing here is public, and nothing here reaches the owner.
export default function RemoteInspectionReportPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [urls, setUrls] = useState<Record<string, string | null>>({})

  const load = useCallback(async () => {
    if (!id) return
    const { data, error: e } = await supabase.rpc('my_remote_inspection_report', { p_request: id })
    if (e || !data) {
      setError(friendlyError(e?.message ?? 'This report could not be opened.'))
      setLoading(false)
      return
    }
    const r = data as Report
    setReport(r)
    setLoading(false)
    // photos open straight away; videos only when the tenant taps play
    const photos = (r.files ?? []).filter((f) => f.kind === 'photo')
    const pairs = await Promise.all(photos.map(async (f) => [f.id, await fileUrl(f.id)] as const))
    setUrls((u) => ({ ...u, ...Object.fromEntries(pairs) }))
  }, [id])
  useEffect(() => { void load() }, [load])

  async function playVideo(f: ReportFile) {
    const u = await fileUrl(f.id)
    setUrls((x) => ({ ...x, [f.id]: u }))
  }

  const v = report ? verdictText(report.verdict) : null
  const rent = report ? matchText(report.rent_matches) : null
  const listing = report ? matchText(report.listing_matches) : null
  const photos = (report?.files ?? []).filter((f) => f.kind === 'photo')
  const videos = (report?.files ?? []).filter((f) => f.kind === 'video')

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Link href="/inspections" className="inline-flex items-center gap-1 text-sm text-muted-foreground min-h-11">
          <ArrowLeft size={16} aria-hidden /> My inspections
        </Link>

        {loading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
        {error && <div role="alert" className="text-sm rounded-lg border border-destructive/40 text-destructive px-3 py-2">{error}</div>}

        {report && v && (
          <>
            <div>
              <h1 className="text-xl font-bold">{report.title ?? 'Property'}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin size={14} aria-hidden /> {report.location_text}</p>
              <p className="text-xs text-muted-foreground">Visited {fmtDateTime(report.visited_at)} · {report.ref}</p>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary p-3 text-xs">
              <Lock size={14} className="mt-0.5 shrink-0" aria-hidden /> <p>{REPORT_PRIVACY_NOTE}</p>
            </div>

            <div className={`rounded-lg border p-3 text-sm ${TONE_CLASS[v.tone]}`}>
              <p className="font-semibold">{v.label}</p>
              <p>{v.line}</p>
              {report.verdict_reason && <p className="mt-1">{report.verdict_reason}</p>}
            </div>

            {report.message && (
              <div className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">Message from EboHomes</p>
                <p>{report.message}</p>
              </div>
            )}

            {(rent || listing) && (
              <ul className="text-sm space-y-1">
                {rent && <li>Rent: <span className={`px-2 py-0.5 rounded border text-xs ${TONE_CLASS[rent.tone]}`}>{rent.label}</span></li>}
                {listing && <li>Listing details: <span className={`px-2 py-0.5 rounded border text-xs ${TONE_CLASS[listing.tone]}`}>{listing.label}</span></li>}
              </ul>
            )}

            <div className="space-y-2">
              {report.findings.filter((x) => x.text).map((x) => {
                const m = matchText(x.matches)
                return (
                  <div key={x.key} className="rounded-lg border border-border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{FINDING_LABEL[x.key] ?? x.key}</p>
                      {m && <span className={`px-2 py-0.5 rounded border text-xs ${TONE_CLASS[m.tone]}`}>{m.label}</span>}
                    </div>
                    <p>{x.text}</p>
                  </div>
                )
              })}
              {report.neighborhood_type && <p className="text-sm"><b>Area:</b> {report.neighborhood_type}</p>}
              {report.nearby_landmarks && <p className="text-sm"><b>Nearby:</b> {report.nearby_landmarks}</p>}
              {report.notes && <p className="text-sm"><b>Inspector&apos;s notes:</b> {report.notes}</p>}
            </div>

            {photos.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm">Photos ({photos.length})</h2>
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((f) => (
                    <div key={f.id} className="aspect-square rounded-lg border border-border bg-secondary overflow-hidden flex items-center justify-center">
                      {urls[f.id] ? (
                        <a href={urls[f.id] as string} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={urls[f.id] as string} alt={f.name ?? 'Inspection photo'} className="w-full h-full object-cover" />
                        </a>
                      ) : urls[f.id] === null ? (
                        <p className="text-xs text-muted-foreground p-2 text-center">Could not load. Reload the page.</p>
                      ) : (
                        <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading photo" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {videos.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold text-sm">Videos ({videos.length})</h2>
                {videos.map((f) => (
                  <div key={f.id} className="rounded-lg border border-border bg-card p-2 space-y-2">
                    {urls[f.id] ? (
                      <video src={urls[f.id] as string} controls playsInline className="w-full rounded" />
                    ) : (
                      <button type="button" className={btnS} onClick={() => playVideo(f)}>Play {f.name ?? 'video'}</button>
                    )}
                    {urls[f.id] === null && <p className="text-xs text-muted-foreground">Could not load. Try again.</p>}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This is what one inspector saw on one visit. It is not a guarantee, and it does not reserve the property or start an application.
            </p>
          </>
        )}
      </div>
    </PageShell>
  )
}
