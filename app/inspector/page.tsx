'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, MapPin, Loader2 } from 'lucide-react'

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

export default function InspectorPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [jobs, setJobs] = useState<any[]>([])
  const [job, setJob] = useState<any>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

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
    const { data } = await supabase.rpc('my_inspection_jobs')
    setJobs(data ?? [])
  }

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }))

  const getGps = () => {
    setGpsError('')
    if (!navigator.geolocation) return setGpsError('This device cannot share its location.')
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsError('Could not get your location. Allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  // Removes files uploaded by this attempt when the submission fails, so no orphans are left.
  // Storage only allows this for files that no submitted inspection references.
  const removeUploaded = async (paths: string[]) => {
    if (paths.length === 0) return
    const { error } = await supabase.storage.from('inspection-evidence').remove(paths)
    if (error) console.error('Could not remove unsubmitted evidence files:', error.message)
  }

  const submit = async () => {
    if (!job || busy) return
    if (!gps) return setMsg('Capture your GPS location first.')
    if (files.length < 3) return setMsg('Add at least 3 photos or videos as evidence.')
    if (!form.verdict) return setMsg('Choose PASS, FAIL or UNCERTAIN.')
    if (!String(form.verdict_reason ?? '').trim()) return setMsg('Give the reason for your verdict.')
    if (!String(form.claimant_name ?? '').trim()) return setMsg('Enter the name of the person you met.')

    setBusy(true)
    setMsg('')
    const { data: u } = await supabase.auth.getUser()
    const uid = u.user!.id
    const paths: string[] = []
    for (const f of files) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${uid}/${job.job_id}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from('inspection-evidence').upload(path, f, { contentType: f.type })
      if (error) {
        await removeUploaded(paths)
        setBusy(false)
        return setMsg('Upload failed: ' + error.message + '. Nothing was submitted. Please try again.')
      }
      paths.push(path)
    }

    const payload: Record<string, any> = {
      listing_id: job.listing_id,
      job_id: job.job_id,
      inspected_by: uid,
      gps_lat: gps.lat,
      gps_lng: gps.lng,
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
      evidence_paths: paths,
    }
    for (const c of CATS) {
      payload[c.notes] = form[c.notes] || null
      payload[c.match] = form[c.match] ?? null
    }
    const { error } = await supabase.from('property_inspections').insert(payload)
    if (error) {
      await removeUploaded(paths)
      setBusy(false)
      return setMsg('Could not submit: ' + error.message + '. Your uploaded files were removed. Please try again.')
    }
    setBusy(false)
    setJob(null)
    setForm({})
    setFiles([])
    setGps(null)
    setMsg('Submitted. A reviewer will check your evidence.')
    loadJobs()
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
      {msg && <div className="mb-4 text-sm rounded-lg border border-border bg-secondary px-3 py-2">{msg}</div>}

      {!job && (
        <div className="space-y-3">
          {jobs.filter((j) => j.status === 'assigned').length === 0 && (
            <p className="text-sm text-muted-foreground">No inspections assigned to you right now.</p>
          )}
          {jobs.map((j) => (
            <div key={j.job_id} className="bg-card border border-border rounded-lg p-3 flex gap-3">
              {j.photos?.[0] && <img src={j.photos[0]} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{j.title ?? 'Listing'}</p>
                <p className="text-xs text-muted-foreground truncate">{j.location_text}</p>
                <p className="text-xs text-muted-foreground">
                  Advertised: ₦{Number(j.price_monthly).toLocaleString()}/month · {j.bedrooms} bed
                </p>
                {j.status === 'assigned' ? (
                  <button onClick={() => setJob(j)} className="mt-2 text-xs font-semibold text-primary hover:underline">Start inspection</button>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Submitted, awaiting review</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {job && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-3 text-sm">
            <p className="font-semibold">{job.title}</p>
            <p className="text-xs text-muted-foreground">{job.location_text} · advertised ₦{Number(job.price_monthly).toLocaleString()}/month</p>
            <button onClick={() => setJob(null)} className="text-xs text-primary mt-1 hover:underline">Back</button>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-semibold mb-2">1. Location</p>
            <Button type="button" variant="outline" onClick={getGps} className="flex items-center gap-2">
              <MapPin size={15} /> {gps ? 'Recapture GPS' : 'Capture my GPS location'}
            </Button>
            {gps && <p className="text-xs text-emerald-700 mt-2">Captured: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</p>}
            {gpsError && <p className="text-xs text-destructive mt-2">{gpsError}</p>}
            <p className="text-xs text-muted-foreground mt-2">Stand at the property entrance when you capture this.</p>
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
            <p className="text-sm font-semibold mb-2">4. Evidence (at least 3 photos or videos)</p>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">{files.length} file(s) selected. Each file up to 30 MB.</p>
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

          <Button onClick={submit} disabled={busy} className="w-full font-semibold flex items-center justify-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Submit inspection
          </Button>
        </div>
      )}
    </div>
  )
}
