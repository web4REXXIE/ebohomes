'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, MapPin, Loader2, Camera, ImagePlus, Video, Trash2 } from 'lucide-react'
import {
  INSPECTION_BUCKET, INSPECTION_PHOTO_ACCEPT, INSPECTION_VIDEO_ACCEPT, validateInspectionFileMeta, type CaptureMethod,
} from '@/lib/inspection-evidence'
import { PHOTO_TOPICS, looksLikeSafetyClaim } from '@/lib/surroundings'
import { SurroundingsForm, buildSurroundingsFacts } from '@/components/surroundings-form'

const CATS = [
  { label: 'Road', notes: 'road_condition', match: 'road_matches', ph: 'e.g. tarred, good condition' },
  { label: 'Water', notes: 'water_source', match: 'water_matches', ph: 'e.g. borehole, reliable' },
  { label: 'Electricity', notes: 'electricity_notes', match: 'electricity_matches', ph: 'e.g. grid plus generator' },
  { label: 'Network', notes: 'network_notes', match: 'network_matches', ph: 'e.g. MTN strong' },
  { label: 'Security', notes: 'security_notes', match: 'security_matches', ph: 'e.g. gated, guard present' },
  { label: 'Property condition', notes: 'condition_notes', match: 'condition_matches', ph: 'rooms, bathrooms, kitchen, compound' },
  { label: 'Environment', notes: 'environment_notes', match: 'environment_matches', ph: 'surroundings, accessibility' },
]

const input = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const PLAIN_CODES = ['42501', '22023', '23514', '23505', 'P0002']

type Staged = { id: string; kind: 'photo' | 'video'; name: string | null; bytes: number; capture_method: CaptureMethod; topic?: string | null; uploaded_at: string }
type Gps = { lat: number; lng: number; accuracy: number | null; fixAt: string | null }

async function authedFetch(path: string, body: unknown) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

// The database's own refusals are plain sentences. Anything else gets a safe message.
const rpcMessage = (error: { code?: string; message?: string }, fallback: string) =>
  PLAIN_CODES.includes(error.code ?? '') && error.message ? error.message : fallback

// Adds files to one inspection (or to one admin request for more evidence). Every file goes through the server:
// the server checks the real file type, computes the fingerprint and saves the record. Files are kept even if the page closes.
function EvidenceUploader({ jobId, requestId, onStaged, disabled, withTopic }: {
  jobId: string; requestId: string | null; onStaged: (files: Staged[]) => void; disabled?: boolean; withTopic?: boolean
}) {
  const [topic, setTopic] = useState('')
  const [staged, setStaged] = useState<Staged[]>([])
  const [active, setActive] = useState<{ key: string; name: string; state: 'uploading' | 'error'; error?: string }[]>([])
  const [err, setErr] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const camPhoto = useRef<HTMLInputElement>(null)
  const galPhoto = useRef<HTMLInputElement>(null)
  const camVideo = useRef<HTMLInputElement>(null)
  const galVideo = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data } = requestId
      ? await supabase.rpc('my_supplement_staged_files', { p_request: requestId })
      : await supabase.rpc('my_inspection_staged_files', { p_job: jobId })
    const list = (Array.isArray(data) ? data : []) as Staged[]
    setStaged(list)
    onStaged(list)
  }, [jobId, requestId, onStaged])
  useEffect(() => { void load() }, [load])

  async function uploadOne(f: File, method: CaptureMethod): Promise<string | null> {
    const p = await authedFetch('/api/inspection-evidence/prepare', { job_id: jobId, request_id: requestId, mime: f.type, bytes: f.size })
    if (!p.ok) return p.j?.error ?? 'Could not prepare the upload.'
    const up = await supabase.storage.from(INSPECTION_BUCKET).uploadToSignedUrl(p.j.path, p.j.token, f, { contentType: f.type })
    if (up.error) return 'The upload failed. Check your connection and choose the file again.'
    const r = await authedFetch('/api/inspection-evidence/register', { job_id: jobId, request_id: requestId, path: p.j.path, name: f.name, capture_method: method, topic: withTopic ? topic : null })
    if (!r.ok) return r.j?.error ?? 'Could not save this file.'
    return null
  }

  async function addFiles(files: File[], method: CaptureMethod) {
    if (files.length === 0) return
    setErr('')
    for (const f of files) {
      const bad = validateInspectionFileMeta(f.type, f.size)
      if (bad) { setErr(`${f.name}: ${bad}`); continue }
      const key = `${Date.now()}-${Math.random()}`
      setActive((a) => [...a, { key, name: f.name, state: 'uploading' }])
      const problem = await uploadOne(f, method)
      setActive((a) => problem ? a.map((x) => (x.key === key ? { ...x, state: 'error', error: problem } : x)) : a.filter((x) => x.key !== key))
      await load()
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this file? It has not been sent yet.')) return
    setRemoving(id); setErr('')
    const r = await authedFetch('/api/inspection-evidence/discard', { file_id: id })
    setRemoving(null)
    if (!r.ok) { setErr(r.j?.error ?? 'Could not remove this file.'); return }
    await load()
  }

  const pick = (ref: React.RefObject<HTMLInputElement | null>, method: CaptureMethod) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void addFiles(files, method)
    void ref
  }
  const photos = staged.filter((s) => s.kind === 'photo').length
  const videos = staged.filter((s) => s.kind === 'video').length
  const uploading = active.some((a) => a.state === 'uploading')
  const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50'

  return (
    <div className="space-y-3">
      {withTopic && (
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="ptopic">What do the next files show?</label>
          <select id="ptopic" className={input} value={topic} disabled={disabled || uploading} onChange={(e) => setTopic(e.target.value)}>
            <option value="">The property itself</option>
            {PHOTO_TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn} disabled={disabled || uploading} onClick={() => camPhoto.current?.click()}><Camera size={15} /> Take photo</button>
        <button type="button" className={btn} disabled={disabled || uploading} onClick={() => galPhoto.current?.click()}><ImagePlus size={15} /> Choose photos</button>
        <button type="button" className={btn} disabled={disabled || uploading} onClick={() => camVideo.current?.click()}><Video size={15} /> Record video</button>
        <button type="button" className={btn} disabled={disabled || uploading} onClick={() => galVideo.current?.click()}><Video size={15} /> Choose video</button>
      </div>
      <input ref={camPhoto} type="file" accept={INSPECTION_PHOTO_ACCEPT} capture="environment" className="hidden" onChange={pick(camPhoto, 'camera')} />
      <input ref={galPhoto} type="file" accept={INSPECTION_PHOTO_ACCEPT} multiple className="hidden" onChange={pick(galPhoto, 'gallery')} />
      <input ref={camVideo} type="file" accept={INSPECTION_VIDEO_ACCEPT} capture="environment" className="hidden" onChange={pick(camVideo, 'camera')} />
      <input ref={galVideo} type="file" accept={INSPECTION_VIDEO_ACCEPT} className="hidden" onChange={pick(galVideo, 'gallery')} />
      <p className="text-xs text-muted-foreground">
        Photos: JPG, PNG or WEBP up to 10MB. Videos: MP4 or WEBM up to 100MB. EboHomes records whether a file came from the camera button or your gallery. Gallery files are marked as such for the reviewer.
      </p>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900">{err}</p>}

      {active.map((a) => (
        <div key={a.key} className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-xs ${a.state === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-border'}`}>
          <span className="min-w-0 truncate">{a.name}</span>
          {a.state === 'uploading'
            ? <span className="flex shrink-0 items-center gap-1"><Loader2 size={13} className="animate-spin" /> Uploading</span>
            : <span className="flex shrink-0 items-center gap-2">{a.error}<button type="button" className="font-semibold underline" onClick={() => setActive((x) => x.filter((y) => y.key !== a.key))}>Dismiss</button></span>}
        </div>
      ))}

      {staged.length === 0 ? <p className="text-xs text-muted-foreground">No files added yet.</p> : (
        <ul className="space-y-1.5">
          {staged.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.kind === 'video' ? 'Video' : 'Photo'}: {s.name ?? 'file'}{s.topic ? ` · ${PHOTO_TOPICS.find((t) => t.value === s.topic)?.label ?? s.topic}` : ''}</span>
                <span className="text-muted-foreground">{(s.bytes / (1024 * 1024)).toFixed(1)} MB · {s.capture_method === 'camera' ? 'camera button' : s.capture_method === 'gallery' ? 'gallery upload' : 'source unknown'}</span>
              </span>
              <button type="button" onClick={() => remove(s.id)} disabled={disabled || removing === s.id} aria-label="Remove file"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-border disabled:opacity-50"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs font-semibold">{photos} photo(s), {videos} video(s)</p>
    </div>
  )
}

// An admin asked for more evidence on an inspection already sent. Original files stay as they are.
function SupplementCard({ req, onDone }: { req: any; onDone: (m: string) => void }) {
  const [files, setFiles] = useState<Staged[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function send() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('submit_inspection_supplement', { p_request: req.request_id, p_note: note.trim() || null })
    setBusy(false)
    if (error) { setErr(rpcMessage(error, 'Could not send the extra evidence. Try again.')); return }
    onDone('Extra evidence sent. The original evidence is kept and a reviewer will check the new files.')
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">EboHomes asked for more evidence</p>
      <p>{req.reason}</p>
      <div className="rounded-lg border border-border bg-card p-3 text-foreground">
        <EvidenceUploader jobId={req.job_id} requestId={req.request_id} onStaged={setFiles} disabled={busy} />
      </div>
      <textarea rows={2} className={input} placeholder="Note for the reviewer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p role="alert" className="text-xs text-red-900">{err}</p>}
      <Button type="button" onClick={send} disabled={busy || files.length < 1} className="w-full font-semibold">
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Send extra evidence
      </Button>
    </div>
  )
}

export default function InspectorPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [jobs, setJobs] = useState<any[]>([])
  const [supp, setSupp] = useState<any[]>([])
  const [job, setJob] = useState<any>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [gps, setGps] = useState<Gps | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsBusy, setGpsBusy] = useState(false)
  const [staged, setStaged] = useState<Staged[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [retrySurr, setRetrySurr] = useState<{ jobId: string; facts: any[] } | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.push('/login?redirect=/inspector')
        return
      }
      const { data: row } = await supabase.from('inspectors').select('status').eq('user_id', data.user.id).maybeSingle()
      setAllowed(row?.status === 'active')
      setReady(true)
      if (row?.status === 'active') loadJobs()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadJobs = async () => {
    const [{ data }, { data: s }] = await Promise.all([supabase.rpc('my_inspection_jobs'), supabase.rpc('my_inspection_supplement_requests')])
    setJobs(data ?? [])
    setSupp(Array.isArray(s) ? s : [])
  }

  // The typed answers are kept in this browser tab while the inspector works, so a refresh does not lose them.
  const formKey = (jobId: string) => `eb_inspection_form_${jobId}`
  const openJob = (j: any) => {
    let saved: Record<string, any> = {}
    try { saved = JSON.parse(sessionStorage.getItem(formKey(j.job_id)) ?? '{}') || {} } catch { saved = {} }
    setForm(saved); setGps(null); setGpsError(''); setStaged([]); setMsg(''); setJob(j)
  }
  const set = (k: string, v: any) =>
    setForm((p) => {
      const n = { ...p, [k]: v }
      if (job) { try { sessionStorage.setItem(formKey(job.job_id), JSON.stringify(n)) } catch { /* storage unavailable */ } }
      return n
    })

  const getGps = () => {
    setGpsError('')
    if (!navigator.geolocation) return setGpsError('This device cannot share its location.')
    setGpsBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false)
        setGps({
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          fixAt: pos.timestamp ? new Date(pos.timestamp).toISOString() : null,
        })
      },
      () => { setGpsBusy(false); setGpsError('Could not get your location. Allow location access and try again.') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const photoCount = staged.filter((s) => s.kind === 'photo').length

  const submit = async () => {
    if (!job || busy) return
    if (!gps) return setMsg('Capture your GPS location first.')
    if (photoCount < 3) return setMsg('Add at least 3 photographs as evidence.')
    if (staged.length < 3) return setMsg('Add at least 3 evidence files.')
    if (!form.verdict) return setMsg('Choose PASS, FAIL or UNCERTAIN.')
    if (!String(form.verdict_reason ?? '').trim()) return setMsg('Give the reason for your verdict.')
    if (!String(form.claimant_name ?? '').trim()) return setMsg('Enter the name of the person you met.')
    if (buildSurroundingsFacts(form.surroundings, form.surroundings_context).some((f) => looksLikeSafetyClaim(f.note) || looksLikeSafetyClaim(f.name) || looksLikeSafetyClaim(f.context)))
      return setMsg('Surroundings notes must describe only what you saw. Remove words about crime or safety.')

    setBusy(true)
    setMsg('')
    const payload: Record<string, any> = {
      claimant_name: String(form.claimant_name).trim(),
      claimant_relationship: form.claimant_relationship || null,
      claimant_id_seen: !!form.claimant_id_seen,
      rent_matches: form.rent_matches ?? null,
      listing_matches: form.listing_matches ?? null,
      neighborhood_type: form.neighborhood_type || null,
      nearby_landmarks: form.nearby_landmarks || null,
      overall_notes: form.overall_notes || null,
      verdict: form.verdict,
      verdict_reason: String(form.verdict_reason).trim(),
    }
    for (const c of CATS) {
      payload[c.notes] = form[c.notes] || null
      payload[c.match] = form[c.match] ?? null
    }
    // The server checks everything again: your job, the files, the verdict and the location. It stamps who and when itself.
    const { error } = await supabase.rpc('submit_inspection', {
      p_job: job.job_id, p_gps_lat: gps.lat, p_gps_lng: gps.lng, p_gps_accuracy: gps.accuracy, p_gps_fix_at: gps.fixAt, p_form: payload,
    })
    if (error) {
      setBusy(false)
      return setMsg(rpcMessage(error, 'Could not submit. Your files and answers are kept. Please try again.'))
    }

    // The inspection is saved. Now send the surroundings facts, tied to it. A failure here never undoes the inspection.
    const surr = buildSurroundingsFacts(form.surroundings, form.surroundings_context)
    let surrNote = ''
    if (surr.length > 0) {
      const r = await supabase.rpc('inspector_record_surroundings', { p_job: job.job_id, p_facts: surr })
      if (r.error) {
        setRetrySurr({ jobId: job.job_id, facts: surr })
        surrNote = ' Your surroundings notes were not saved: ' + rpcMessage(r.error, 'please try again below.')
      } else {
        surrNote = ` ${r.data} surroundings fact(s) sent for review.`
      }
    }
    setBusy(false)
    try { sessionStorage.removeItem(formKey(job.job_id)) } catch { /* ignore */ }
    setJob(null); setForm({}); setStaged([]); setGps(null)
    setMsg('Submitted. A reviewer will check your evidence.' + surrNote)
    loadJobs()
  }

  const retrySurroundings = async () => {
    if (!retrySurr || busy) return
    setBusy(true)
    const r = await supabase.rpc('inspector_record_surroundings', { p_job: retrySurr.jobId, p_facts: retrySurr.facts })
    setBusy(false)
    if (r.error) return setMsg(rpcMessage(r.error, 'Could not save the surroundings. Try again.'))
    setRetrySurr(null)
    setMsg(`Surroundings saved: ${r.data} new fact(s) sent for review.`)
  }

  if (!ready) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (!allowed)
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="font-semibold mb-2">Inspector access only</p>
        <p className="text-sm text-muted-foreground">This page is for EboHomes Verified Inspectors. Contact EboHomes to be onboarded.</p>
      </div>
    )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-1 flex items-center gap-2"><ClipboardCheck size={20} /> My inspections</h1>
      <p className="text-sm text-muted-foreground mb-4">
        You are paid for completing an inspection, not for approving a property. Report exactly what you find.
      </p>
      {msg && <div role="status" className="mb-4 text-sm rounded-lg border border-border bg-secondary px-3 py-2">{msg}</div>}
      {retrySurr && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Your inspection was sent, but your surroundings notes were not saved yet.</p>
          <Button type="button" onClick={retrySurroundings} disabled={busy} className="mt-2 w-full font-semibold">Save surroundings again</Button>
        </div>
      )}

      {!job && (
        <div className="space-y-3">
          {jobs.filter((j) => j.status === 'assigned').length === 0 && supp.length === 0 && (
            <p className="text-sm text-muted-foreground">No inspections assigned to you right now.</p>
          )}
          {jobs.map((j) => {
            const req = supp.find((s) => s.job_id === j.job_id)
            return (
              <div key={j.job_id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex gap-3">
                  {j.photos?.[0] && <img src={j.photos[0]} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{j.title ?? 'Listing'}</p>
                    <p className="text-xs text-muted-foreground truncate">{j.location_text}</p>
                    <p className="text-xs text-muted-foreground">
                      Advertised: ₦{Number(j.price_monthly).toLocaleString()}/month · {j.bedrooms} bed
                    </p>
                    {j.status === 'assigned' ? (
                      <button onClick={() => openJob(j)} className="mt-2 min-h-11 text-xs font-semibold text-primary hover:underline">Start inspection</button>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Submitted, awaiting review</p>
                    )}
                  </div>
                </div>
                {req && <SupplementCard req={req} onDone={(m) => { setMsg(m); loadJobs() }} />}
              </div>
            )
          })}
        </div>
      )}

      {job && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-3 text-sm">
            <p className="font-semibold">{job.title}</p>
            <p className="text-xs text-muted-foreground">{job.location_text} · advertised ₦{Number(job.price_monthly).toLocaleString()}/month</p>
            <button onClick={() => setJob(null)} className="min-h-11 text-xs text-primary hover:underline">Back (your files and answers are kept)</button>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-semibold mb-2">1. Location</p>
            <Button type="button" variant="outline" onClick={getGps} disabled={gpsBusy} className="flex items-center gap-2">
              {gpsBusy ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />} {gps ? 'Recapture GPS' : 'Capture my GPS location'}
            </Button>
            {gps && (
              <p className="text-xs text-emerald-700 mt-2">
                Captured: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}{gps.accuracy != null ? ` (accuracy about ${gps.accuracy} m)` : ''}
              </p>
            )}
            {gps && gps.accuracy != null && gps.accuracy > 100 && (
              <p className="text-xs text-amber-700 mt-1">The location is not very accurate. Move to open sky and capture again if you can.</p>
            )}
            {gpsError && <p className="text-xs text-destructive mt-2">{gpsError}</p>}
            <p className="text-xs text-muted-foreground mt-2">
              Stand at the property entrance when you capture this. The reviewer sees how far this is from the listing pin. It is a warning sign for the reviewer, not proof that you were there.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold">2. The person you met</p>
            <input className={input} placeholder="Full name" value={form.claimant_name ?? ''} onChange={(e) => set('claimant_name', e.target.value)} />
            <select className={input} value={form.claimant_relationship ?? ''} onChange={(e) => set('claimant_relationship', e.target.value)}>
              <option value="">Relationship to the property</option>
              <option>Owner</option>
              <option>Authorised agent</option>
              <option>Manager for the owner</option>
              <option>Caretaker</option>
              <option>Other</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.claimant_id_seen} onChange={(e) => set('claimant_id_seen', e.target.checked)} /> I saw their ID
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">3. Checklist</p>
            {CATS.map((c) => (
              <div key={c.match} className="bg-card border border-border rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">{c.label}</span>
                  <div className="flex gap-1.5 text-xs">
                    <button type="button" onClick={() => set(c.match, true)} className={`px-2.5 py-1 rounded-lg border ${form[c.match] === true ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'border-border text-muted-foreground'}`}>Matches</button>
                    <button type="button" onClick={() => set(c.match, false)} className={`px-2.5 py-1 rounded-lg border ${form[c.match] === false ? 'bg-red-50 border-red-400 text-red-700' : 'border-border text-muted-foreground'}`}>Does not match</button>
                  </div>
                </div>
                <textarea rows={2} className={input} placeholder={c.ph} value={form[c.notes] ?? ''} onChange={(e) => set(c.notes, e.target.value)} />
              </div>
            ))}
            <div className="bg-card border border-border rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span>Advertised rent is correct</span>
                <div className="flex gap-1.5 text-xs">
                  <button type="button" onClick={() => set('rent_matches', true)} className={`px-2.5 py-1 rounded-lg border ${form.rent_matches === true ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'border-border text-muted-foreground'}`}>Yes</button>
                  <button type="button" onClick={() => set('rent_matches', false)} className={`px-2.5 py-1 rounded-lg border ${form.rent_matches === false ? 'bg-red-50 border-red-400 text-red-700' : 'border-border text-muted-foreground'}`}>No</button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>Photos and video match the property</span>
                <div className="flex gap-1.5 text-xs">
                  <button type="button" onClick={() => set('listing_matches', true)} className={`px-2.5 py-1 rounded-lg border ${form.listing_matches === true ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'border-border text-muted-foreground'}`}>Yes</button>
                  <button type="button" onClick={() => set('listing_matches', false)} className={`px-2.5 py-1 rounded-lg border ${form.listing_matches === false ? 'bg-red-50 border-red-400 text-red-700' : 'border-border text-muted-foreground'}`}>No</button>
                </div>
              </div>
              <input className={input} placeholder="Neighbourhood type" value={form.neighborhood_type ?? ''} onChange={(e) => set('neighborhood_type', e.target.value)} />
              <textarea rows={2} className={input} placeholder="Nearby landmarks" value={form.nearby_landmarks ?? ''} onChange={(e) => set('nearby_landmarks', e.target.value)} />
              <textarea rows={2} className={input} placeholder="Other notes" value={form.overall_notes ?? ''} onChange={(e) => set('overall_notes', e.target.value)} />
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-semibold mb-2">4. Evidence (at least 3 photographs; videos are optional)</p>
            <EvidenceUploader jobId={job.job_id} requestId={null} onStaged={setStaged} disabled={busy} withTopic />
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold">5. Your verdict</p>
            <div className="flex gap-2 text-sm">
              {(['pass', 'fail', 'uncertain'] as const).map((v) => (
                <button key={v} type="button" onClick={() => set('verdict', v)} className={`flex-1 py-2 rounded-lg border font-semibold uppercase text-xs ${form.verdict === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}>{v}</button>
              ))}
            </div>
            <textarea rows={3} className={input} placeholder="Reason for your verdict (required)" value={form.verdict_reason ?? ''} onChange={(e) => set('verdict_reason', e.target.value)} />
          </div>

          <SurroundingsForm
            value={form.surroundings ?? []}
            context={form.surroundings_context ?? ''}
            disabled={busy}
            onChange={(v, c) => { set('surroundings', v); set('surroundings_context', c) }}
          />

          <Button onClick={submit} disabled={busy} className="w-full font-semibold flex items-center justify-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Submit inspection
          </Button>
        </div>
      )}
    </div>
  )
                                                                                                    }
