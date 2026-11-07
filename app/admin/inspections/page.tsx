'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Search, UserPlus, Loader2, AlertTriangle } from 'lucide-react'

const REASONS = [
  { v: 'new_property', l: 'New property' },
  { v: 'high_risk', l: 'High risk' },
  { v: 'high_value', l: 'High value' },
  { v: 'duplicate', l: 'Duplicate or conflicting' },
  { v: 'reported', l: 'Reported by a user' },
  { v: 'reinspection', l: 'Re-inspection' },
]

// These fields become public once the inspection has a reviewed public summary.
const PUBLIC_FIELDS: [string, string][] = [
  ['road_condition', 'Road'],
  ['water_source', 'Water'],
  ['electricity_notes', 'Electricity'],
  ['network_notes', 'Network'],
  ['security_notes', 'Security'],
  ['condition_notes', 'Condition'],
  ['environment_notes', 'Environment'],
  ['neighborhood_type', 'Neighbourhood'],
  ['nearby_landmarks', 'Nearby landmarks'],
]

const EVENT_LABELS: Record<string, string> = {
  file_staged: 'File uploaded',
  file_discarded: 'File removed before sending',
  inspection_submitted: 'Inspection submitted',
  file_opened: 'File opened',
  file_accepted: 'File accepted',
  file_rejected: 'File rejected',
  supplement_requested: 'More evidence requested',
  supplement_submitted: 'More evidence sent',
  supplement_cancelled: 'Request cancelled',
  second_inspector_waived: 'Second inspector waived',
  duplicate_file_flagged: 'Identical file found in another inspection',
}

const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '—')
const mb = (n: number) => (Number(n) / (1024 * 1024)).toFixed(1) + ' MB'

type Tab = 'jobs' | 'review' | 'inspectors'

async function openEvidence(fileId: string): Promise<string | null> {
  // Open the tab first so a phone does not block it, then point it at the short-lived link.
  const w = window.open('', '_blank')
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(`/api/admin/inspection-evidence/open?file=${fileId}`, { headers: { Authorization: `Bearer ${t}` } })
  const j = await res.json().catch(() => null)
  if (!res.ok || !j?.url) { w?.close(); return j?.error ?? 'Could not open the file.' }
  if (w) { w.opener = null; w.location.href = j.url } else window.location.href = j.url
  return null
}

function InspectionCard({ i, me, nameOf, onChanged }: {
  i: any; me: string | null; nameOf: (id: string | null) => string; onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [note, setNote] = useState('')
  const [summary, setSummary] = useState<string>(i.public_summary ?? '')
  const [fileNote, setFileNote] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [suppReason, setSuppReason] = useState('')
  const [waive, setWaive] = useState('')
  const [legacyUrls, setLegacyUrls] = useState<string[]>([])

  const own = i.inspected_by === me
  const hashed = i.integrity_level === 'hashed'
  const publicFields = PUBLIC_FIELDS.filter(([key]) => i[key])

  const load = useCallback(async () => {
    const [f, ev, rq, bl] = await Promise.all([
      supabase.from('inspection_evidence_files').select('*').eq('inspection_id', i.id).is('discarded_at', null).order('uploaded_at'),
      supabase.from('inspection_evidence_events').select('*').eq('inspection_id', i.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('inspection_supplement_requests').select('*').eq('inspection_id', i.id).order('requested_at', { ascending: false }),
      i.review_status === 'submitted' ? supabase.rpc('eb_inspection_approval_blockers', { p_inspection: i.id }) : Promise.resolve({ data: [], error: null } as any),
    ])
    const files: any[] = f.data ?? []
    const dups: Record<string, number> = {}
    if (files.length > 0 && i.job_id) {
      const { data: o } = await supabase.from('inspection_evidence_files').select('sha256, job_id')
        .in('sha256', files.map((x) => x.sha256)).neq('job_id', i.job_id).is('discarded_at', null)
      ;(o ?? []).forEach((x: any) => { dups[x.sha256] = (dups[x.sha256] ?? 0) + 1 })
    }
    setD({
      files, dups, events: ev.data ?? [], requests: rq.data ?? [],
      blockers: bl.error ? [bl.error.message] : ((bl.data as string[]) ?? []),
    })
  }, [i.id, i.job_id, i.review_status])

  useEffect(() => { if (open) void load() }, [open, load])

  async function run(fn: () => PromiseLike<any>, ok: string, finished = false) {
    setBusy(true); setMsg('')
    const { error, data } = await fn()
    setBusy(false)
    if (error) { setMsg(error.message); return false }
    if (typeof data === 'string' && data !== 'ok' && data.length < 200 && !/^[0-9a-f-]{36}$/i.test(data)) { setMsg(data); return false }
    setMsg(ok)
    if (finished) onChanged(); else await load()
    return true
  }

  async function openFile(fileId: string) {
    setBusy(true); setMsg('')
    const e = await openEvidence(fileId)
    setBusy(false)
    if (e) { setMsg(e); return }
    await load() // the open is now recorded, which unlocks Accept
  }

  async function reviewFile(fileId: string, decision: 'accepted' | 'rejected') {
    const n = (fileNote[fileId] ?? '').trim()
    if (decision === 'rejected' && n.length < 5) { setMsg('Write a reason of at least 5 characters.'); return }
    const ok = await run(() => supabase.rpc('admin_review_inspection_file', { p_file: fileId, p_decision: decision, p_note: n || null }), 'Saved.')
    if (ok) setRejecting(null)
  }

  async function decide(decision: 'approved' | 'rejected' | 'reinspect') {
    if (own) return setMsg('You cannot review your own inspection.')
    const n = note.trim()
    const s = summary.trim()
    if (decision === 'approved' && i.verdict !== 'pass') return setMsg('Only a PASS inspection can be approved.')
    if (decision !== 'approved' && !n) return setMsg('Add a note explaining the decision.')
    if (decision === 'approved' && !s) return setMsg('Write the public summary before approving.')
    await run(() => supabase.rpc('admin_review_inspection', {
      p_inspection_id: i.id, p_decision: decision, p_note: n || null, p_public_summary: decision === 'approved' ? s : null,
    }), 'Saved.', true)
  }

  async function saveSummary() {
    const s = summary.trim()
    await run(() => supabase.from('property_inspections').update({ public_summary: s || null }).eq('id', i.id),
      s ? 'Public summary saved.' : 'Public summary cleared. Detailed notes are now hidden.', true)
  }

  async function showLegacy() {
    const urls: string[] = []
    for (const path of (i.evidence_paths ?? []) as string[]) {
      const { data } = await supabase.storage.from('inspection-evidence').createSignedUrl(path, 300)
      if (data?.signedUrl) urls.push(data.signedUrl)
    }
    setLegacyUrls(urls)
  }

  const openRequest = d?.requests?.find((r: any) => !r.fulfilled_at && !r.cancelled_at)
  const blockers: string[] = d?.blockers ?? []
  const needsSecond = blockers.some((b) => /second/i.test(b))
  const methodLabel = (m: string) =>
    m === 'camera' ? 'Camera button (reported by the device, not proof)' : m === 'gallery' ? 'Gallery upload' : 'Source unknown'
  const statusTone = (s: string) =>
    s === 'accepted' ? 'bg-emerald-100 text-emerald-800' : s === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'

  return (
    <div className="bg-card border border-border rounded-lg text-sm">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full min-h-14 p-4 text-left flex justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{i.listing?.title ?? 'Listing'}</p>
          <p className="text-xs text-muted-foreground">{i.listing?.location_text} · {when(i.inspected_at)}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {!hashed && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Legacy inspection — no file integrity hashes</span>}
            {i.gps_flag === 'outside' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">GPS far from pin</span>}
          </div>
        </div>
        <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full h-fit shrink-0 ${
          i.verdict === 'pass' ? 'bg-emerald-100 text-emerald-700' : i.verdict === 'fail' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
        }`}>{i.verdict ?? 'legacy'}</span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          {own && <p role="alert" className="text-xs rounded border border-amber-400 bg-amber-50 p-2 text-amber-900">You submitted this inspection, so someone else must review it.</p>}
          {i.verdict_reason && <p><span className="text-muted-foreground">Reason:</span> {i.verdict_reason}</p>}
          <p className="text-xs text-muted-foreground">Inspector: {nameOf(i.inspected_by)}</p>

          <div className="rounded border border-border bg-secondary p-2 text-xs space-y-0.5">
            <p className="font-semibold">Location claim (a warning sign for you, never proof of presence)</p>
            {i.gps_lat != null ? (
              <>
                <p>Reported position: {Number(i.gps_lat).toFixed(5)}, {Number(i.gps_lng).toFixed(5)}{i.gps_accuracy_m != null ? ` · accuracy about ${Math.round(i.gps_accuracy_m)} m` : ''}</p>
                {i.gps_flag === 'no_pin' && <p>The listing has no map pin, so the distance cannot be compared.</p>}
                {i.gps_flag === 'within' && <p>{Math.round(i.gps_distance_m)} m from the listing pin (limit {i.gps_threshold_m} m).</p>}
                {i.gps_flag === 'outside' && <p className="text-amber-800 font-semibold flex items-center gap-1"><AlertTriangle size={13} /> {Math.round(i.gps_distance_m)} m from the listing pin (limit {i.gps_threshold_m} m).</p>}
                {!i.gps_flag && <p>Older inspection: no distance was calculated.</p>}
                {i.gps_fix_at && <p>Device fix time: {when(i.gps_fix_at)} (device clock, not trusted)</p>}
              </>
            ) : <p>No GPS recorded.</p>}
          </div>

          <p className="text-xs">Claimant: {i.claimant_name ?? '—'} ({i.claimant_relationship ?? '—'}) · ID seen: {i.claimant_id_seen ? 'yes' : 'no'}</p>
          <p className="text-xs">Rent matches: {i.rent_matches == null ? '—' : i.rent_matches ? 'yes' : 'NO'} · Photos/video match: {i.listing_matches == null ? '—' : i.listing_matches ? 'yes' : 'NO'}</p>

          {i.overall_notes && (
            <p className="text-xs rounded border border-border bg-secondary px-2 py-1.5">
              <span className="font-semibold">Inspector&apos;s private notes (never published):</span> {i.overall_notes}
            </p>
          )}

          {publicFields.length > 0 && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs space-y-0.5">
              <p className="font-semibold text-emerald-900">Published once this inspection has a public summary:</p>
              {publicFields.map(([key, label]) => <p key={key}><span className="text-emerald-800">{label}:</span> {i[key]}</p>)}
            </div>
          )}

          {/* Evidence */}
          <div className="space-y-2">
            <p className="font-semibold">Evidence</p>
            {!hashed ? (
              <div>
                <p className="text-xs text-muted-foreground">Legacy inspection — no file integrity hashes. These files cannot be reviewed one by one and their opening is not recorded.</p>
                {(i.evidence_paths ?? []).length > 0 && (
                  <>
                    <button onClick={showLegacy} className="min-h-11 text-xs text-primary font-medium hover:underline">View {i.evidence_paths.length} evidence file(s)</button>
                    <div className="flex flex-wrap gap-2">
                      {legacyUrls.map((u, idx) => <a key={idx} href={u} target="_blank" rel="noreferrer" className="text-xs border border-border rounded px-2 py-1 hover:bg-secondary">File {idx + 1}</a>)}
                    </div>
                  </>
                )}
              </div>
            ) : !d ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading…</p>
            ) : d.files.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files on record.</p>
            ) : (
              <ul className="space-y-2">
                {d.files.map((f: any) => {
                  const opened = d.events.some((e: any) => e.event === 'file_opened' && e.file_id === f.id && e.actor_id === me)
                  const dup = d.dups[f.sha256]
                  const canReview = i.review_status === 'submitted' && !own
                  return (
                    <li key={f.id} className="rounded-lg border border-border p-2 space-y-1.5 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <b>{f.kind === 'video' ? 'Video' : 'Photo'}</b>
                        <span className="truncate max-w-[10rem]">{f.original_name ?? 'file'}</span>
                        <span className="text-muted-foreground">{mb(f.size_bytes)}</span>
                        {f.phase === 'supplement' && <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">Extra evidence</span>}
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${statusTone(f.review_status)}`}>{f.review_status}</span>
                      </div>
                      <p className="text-muted-foreground">{methodLabel(f.capture_method)} · received {when(f.uploaded_at)} · fingerprint {String(f.sha256).slice(0, 12)}…</p>
                      {dup > 0 && <p className="text-amber-800 font-semibold flex items-center gap-1"><AlertTriangle size={13} /> Identical to a file in {dup} other inspection(s). This can have an innocent cause. Compare before deciding.</p>}
                      {f.review_note && <p>Note: {f.review_note}</p>}
                      {!own && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => openFile(f.id)}>Open (recorded)</Button>
                          {canReview && f.review_status !== 'accepted' && <Button size="sm" disabled={busy || !opened} onClick={() => reviewFile(f.id, 'accepted')}>Accept</Button>}
                          {canReview && f.review_status !== 'rejected' && <Button size="sm" variant="outline" className="text-destructive border-destructive" disabled={busy} onClick={() => setRejecting(rejecting === f.id ? null : f.id)}>Reject</Button>}
                        </div>
                      )}
                      {canReview && !opened && f.review_status !== 'accepted' && <p className="text-muted-foreground">Open the file first. Accept unlocks after you have opened it.</p>}
                      {rejecting === f.id && (
                        <div className="space-y-2">
                          <input className={field} maxLength={500} placeholder="Reason (required)" value={fileNote[f.id] ?? ''} onChange={(e) => setFileNote({ ...fileNote, [f.id]: e.target.value })} />
                          <Button size="sm" disabled={busy} onClick={() => reviewFile(f.id, 'rejected')}>Confirm reject</Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Extra evidence */}
          {d && openRequest && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Waiting for extra evidence (asked {when(openRequest.requested_at)})</p>
              <p>{openRequest.reason}</p>
              {i.review_status === 'submitted' && !own && (
                <button className="min-h-11 font-semibold underline" disabled={busy}
                  onClick={() => { const r = window.prompt('Why cancel this request? (5+ characters)'); if (r) void run(() => supabase.rpc('admin_cancel_inspection_supplement', { p_request: openRequest.id, p_reason: r }), 'Request cancelled.') }}>
                  Cancel request
                </button>
              )}
            </div>
          )}
          {d && hashed && i.review_status === 'submitted' && !own && !openRequest && i.job_id && (
            <div className="space-y-2">
              <input className={field} maxLength={1000} placeholder="Ask the inspector for more evidence: what is needed? (10+ characters)" value={suppReason} onChange={(e) => setSuppReason(e.target.value)} />
              <Button size="sm" variant="outline" disabled={busy || suppReason.trim().length < 10}
                onClick={async () => { if (await run(() => supabase.rpc('admin_request_inspection_supplement', { p_inspection: i.id, p_reason: suppReason.trim() }), 'Request sent. The inspection stays under review.')) setSuppReason('') }}>
                Request more evidence
              </Button>
            </div>
          )}

          {/* Decision */}
          {i.review_status === 'submitted' && !own && (
            <div className="space-y-2 pt-2 border-t border-border">
              {d && blockers.length > 0 && (
                <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  <p className="font-semibold">Before you can approve:</p>
                  <ul className="list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              )}
              {needsSecond && (
                <div className="space-y-2">
                  <input className={field} maxLength={1000} placeholder="No second inspector available? Record why (10+ characters)" value={waive} onChange={(e) => setWaive(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={busy || waive.trim().length < 10}
                    onClick={async () => { if (await run(() => supabase.rpc('admin_waive_second_inspector', { p_inspection: i.id, p_reason: waive.trim() }), 'Waiver recorded.')) setWaive('') }}>
                    Record waiver
                  </Button>
                </div>
              )}
              {i.verdict === 'pass' && (
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={600} className={field}
                  placeholder="Public summary shown on the listing (required to approve, max 600 characters). Describe the physical condition only. Do not claim ownership or authority to rent." />
              )}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={field}
                placeholder="Note (required to reject or ask for another inspection)" />
              <div className="flex flex-wrap gap-2">
                {i.verdict === 'pass'
                  ? <Button disabled={busy || (!!d && blockers.length > 0)} onClick={() => decide('approved')}>Approve</Button>
                  : <p className="w-full text-xs text-amber-700">This inspection is not a PASS, so it cannot be approved. You can reject it or ask for another inspection.</p>}
                <Button variant="outline" disabled={busy} onClick={() => decide('reinspect')}>Another inspection</Button>
                <Button variant="outline" className="text-destructive border-destructive" disabled={busy} onClick={() => decide('rejected')}>Reject</Button>
              </div>
            </div>
          )}

          {i.review_note && <p className="text-xs text-muted-foreground">Review note: {i.review_note}</p>}

          {i.review_status === 'approved' && (
            <div className="space-y-2 pt-2 border-t border-border">
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={600} className={field}
                placeholder="Public summary. Without one, detailed notes stay hidden on the listing." />
              <Button variant="outline" disabled={busy} onClick={saveSummary}>Save public summary</Button>
            </div>
          )}

          {/* History */}
          {d && d.events.length > 0 && (
            <details className="text-xs">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">History ({d.events.length})</summary>
              <ul className="space-y-1">
                {d.events.map((e: any) => (
                  <li key={e.id} className="rounded border border-border p-1.5">
                    <b>{EVENT_LABELS[e.event] ?? e.event.replace(/_/g, ' ')}</b> · {when(e.created_at)}{e.note ? ` · "${e.note}"` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {msg && <p role="alert" className="rounded border border-border bg-secondary p-2 text-xs">{msg}</p>}
        </div>
      )}
    </div>
  )
}

export default function AdminInspectionsPage() {
  const [tab, setTab] = useState<Tab>('jobs')
  const [me, setMe] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  // jobs
  const [jobs, setJobs] = useState<any[]>([])
  const [inspectors, setInspectors] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [reason, setReason] = useState('new_property')
  const [second, setSecond] = useState(false)

  // review
  const [filter, setFilter] = useState<'submitted' | 'approved' | 'rejected' | 'reinspect'>('submitted')
  const [inspections, setInspections] = useState<any[]>([])

  // inspectors
  const [email, setEmail] = useState('')
  const [areas, setAreas] = useState('')

  // settings
  const [threshold, setThreshold] = useState<number | null>(null)
  const [thInput, setThInput] = useState('')
  const [thReason, setThReason] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
    loadInspectors()
    loadJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tab === 'review') loadInspections()
    if (tab === 'inspectors') loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filter])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 5000)
  }

  const loadInspectors = async () => {
    const { data } = await supabase.from('inspectors').select('*').order('onboarded_at', { ascending: false })
    setInspectors(data ?? [])
  }

  const loadSettings = async () => {
    const { data } = await supabase.from('inspection_settings').select('gps_threshold_m').maybeSingle()
    setThreshold(data?.gps_threshold_m ?? null)
  }

  const loadJobs = async () => {
    const { data } = await supabase
      .from('inspection_jobs')
      .select('id, listing_id, inspector_id, reason, status, needs_second_inspector, created_at, listing:listings(title, location_text)')
      .eq('service_type', 'verification')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100)
    setJobs(data ?? [])
  }

  const loadInspections = async () => {
    const { data } = await supabase
      .from('property_inspections')
      .select('*, listing:listings(title, location_text)')
      .eq('service_type', 'verification')
      .eq('review_status', filter)
      .order('inspected_at', { ascending: false })
      .limit(50)
    setInspections(data ?? [])
  }

  const search = async () => {
    const q = query.trim().replace(/[%,()]/g, '')
    if (!q) return setResults([])
    const { data } = await supabase
      .from('listings')
      .select('id, title, location_text, status')
      .or(`title.ilike.%${q}%,location_text.ilike.%${q}%`)
      .limit(8)
    setResults(data ?? [])
  }

  const requestInspection = async (listing: any) => {
    const { error } = await supabase.from('inspection_jobs').insert({
      listing_id: listing.id,
      reason,
      needs_second_inspector: second,
      created_by: me,
    })
    if (error) return flash('Failed: ' + error.message)
    if (listing.status === 'pending') {
      await supabase.from('listings').update({ status: 'inspection_required' }).eq('id', listing.id)
    }
    setResults([])
    setQuery('')
    flash('Inspection requested.')
    loadJobs()
  }

  // The database stamps the assignment time itself and records who was assigned.
  const assign = async (jobId: string, inspectorId: string) => {
    if (!inspectorId) return
    const { error } = await supabase
      .from('inspection_jobs')
      .update({ inspector_id: inspectorId, status: 'assigned' })
      .eq('id', jobId)
    if (error) return flash('Failed: ' + error.message)
    loadJobs()
  }

  const cancelJob = async (jobId: string) => {
    if (!window.confirm('Cancel this inspection request?')) return
    const { error } = await supabase.from('inspection_jobs').update({ status: 'cancelled' }).eq('id', jobId)
    if (error) return flash('Failed: ' + error.message)
    loadJobs()
  }

  const addInspector = async () => {
    if (!email.trim()) return
    const { data, error } = await supabase.rpc('admin_add_inspector', { p_email: email.trim(), p_areas: areas.trim() })
    if (error) return flash('Failed: ' + error.message)
    if (data !== 'ok') return flash(String(data))
    setEmail('')
    setAreas('')
    flash('Inspector added.')
    loadInspectors()
  }

  const toggleInspector = async (i: any) => {
    await supabase.from('inspectors').update({ status: i.status === 'active' ? 'suspended' : 'active' }).eq('user_id', i.user_id)
    loadInspectors()
  }

  const saveThreshold = async () => {
    const m = Number(thInput)
    if (!Number.isInteger(m)) return flash('Enter a whole number of metres.')
    const { error } = await supabase.rpc('admin_set_inspection_gps_threshold', { p_meters: m, p_reason: thReason })
    if (error) return flash('Failed: ' + error.message)
    setThInput('')
    setThReason('')
    flash('GPS warning distance updated.')
    loadSettings()
  }

  const nameOf = (id: string | null) => inspectors.find((i) => i.user_id === id)?.full_name ?? (id ? 'Inspector' : '—')
  const active = inspectors.filter((i) => i.status === 'active')

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
        <ClipboardCheck size={22} /> Inspections
      </h1>
      <p className="text-sm text-muted-foreground mb-1">
        Inspectors submit evidence. A different reviewer approves it. Inspectors are paid for completing an inspection, never for passing a property.
      </p>
      <p className="text-xs text-amber-700 mb-4">
        A physical inspection does not prove ownership, authority to rent, rental terms or availability. GPS and camera details are warning signs for you, never proof. Never describe them that way.
      </p>

      {msg && <div className="mb-4 text-sm rounded-lg border border-border bg-secondary px-3 py-2">{msg}</div>}

      <div className="flex gap-2 mb-6">
        {(['jobs', 'review', 'inspectors'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 min-h-11 rounded-lg text-sm font-semibold capitalize ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'jobs' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-semibold mb-2">Request an inspection</p>
            <div className="flex gap-2 mb-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Search listing by title or location"
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <Button onClick={search} aria-label="Search"><Search size={16} /></Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background">
                {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={second} onChange={(e) => setSecond(e.target.checked)} /> Needs a second inspector
              </label>
            </div>
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => requestInspection(r)}
                className="w-full text-left p-2 mt-1 rounded-lg border border-border hover:bg-secondary text-sm"
              >
                <span className="font-medium">{r.title ?? 'Untitled'}</span>
                <span className="text-muted-foreground"> · {r.location_text} · {r.status}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {jobs.length === 0 && <p className="text-sm text-muted-foreground">No inspection requests yet.</p>}
            {jobs.map((j) => (
              <div key={j.id} className="bg-card border border-border rounded-lg p-3 text-sm">
                <p className="font-semibold">{j.listing?.title ?? 'Listing'}</p>
                <p className="text-xs text-muted-foreground">
                  {j.listing?.location_text} · {REASONS.find((r) => r.v === j.reason)?.l ?? j.reason}
                  {j.needs_second_inspector ? ' · second inspector' : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs font-semibold capitalize px-2 py-1 rounded-full bg-secondary">{j.status}</span>
                  {j.status === 'requested' || j.status === 'assigned' ? (
                    <>
                      <select
                        value={j.inspector_id ?? ''}
                        onChange={(e) => assign(j.id, e.target.value)}
                        className="px-2 py-1 rounded-lg border border-border bg-background text-xs"
                      >
                        <option value="">Assign inspector…</option>
                        {active.map((i) => <option key={i.user_id} value={i.user_id}>{i.full_name ?? i.user_id.slice(0, 6)}</option>)}
                      </select>
                      <button onClick={() => cancelJob(j.id)} className="min-h-11 text-xs text-destructive hover:underline">Cancel</button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Inspector: {nameOf(j.inspector_id)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'review' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            {(['submitted', 'approved', 'rejected', 'reinspect'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 min-h-11 rounded-full capitalize border ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
              >
                {f}
              </button>
            ))}
          </div>
          {inspections.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
          <div className="space-y-3">
            {inspections.map((i) => (
              <InspectionCard key={i.id} i={i} me={me} nameOf={nameOf} onChanged={loadInspections} />
            ))}
          </div>
        </div>
      )}

      {tab === 'inspectors' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold">GPS warning distance</p>
            <p className="text-xs text-muted-foreground">
              Current: {threshold ?? '—'} m. A submission further than this from the listing pin is flagged for the reviewer. It is never blocked and never proves anyone was at the property. Allowed: 20 to 5000 m. Changes are recorded with your reason.
            </p>
            <input value={thInput} onChange={(e) => setThInput(e.target.value)} inputMode="numeric" placeholder="New distance in metres" className={field} />
            <input value={thReason} onChange={(e) => setThReason(e.target.value)} placeholder="Reason (required)" className={field} />
            <Button variant="outline" onClick={saveThreshold} disabled={!thInput || !thReason.trim()}>Update distance</Button>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2"><UserPlus size={15} /> Add an inspector</p>
            <p className="text-xs text-muted-foreground">They must already have an EboHomes account. Use the email they signed up with.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
            <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Assigned areas, e.g. Abakaliki" className={field} />
            <Button onClick={addInspector}>Add inspector</Button>
          </div>
          <div className="space-y-2">
            {inspectors.map((i) => (
              <div key={i.user_id} className="bg-card border border-border rounded-lg p-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-semibold">{i.full_name ?? 'Unnamed'} <span className="text-xs text-muted-foreground">{i.phone}</span></p>
                  <p className="text-xs text-muted-foreground">{i.areas ?? 'No area set'} · {i.status}</p>
                </div>
                <button onClick={() => toggleInspector(i)} className="min-h-11 text-xs text-primary hover:underline">
                  {i.status === 'active' ? 'Suspend' : 'Reactivate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
