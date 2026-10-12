'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Search, UserPlus } from 'lucide-react'

const REASONS = [
  { v: 'new_property', l: 'New property' },
  { v: 'high_risk', l: 'High risk' },
  { v: 'high_value', l: 'High value' },
  { v: 'duplicate', l: 'Duplicate or conflicting' },
  { v: 'reported', l: 'Reported by a user' },
  { v: 'reinspection', l: 'Re-inspection' },
]

type Tab = 'jobs' | 'review' | 'inspectors'

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
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  // inspectors
  const [email, setEmail] = useState('')
  const [areas, setAreas] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
    loadInspectors()
    loadJobs()
  }, [])

  useEffect(() => {
    if (tab === 'review') loadInspections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filter])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 4000)
  }

  const loadInspectors = async () => {
    const { data } = await supabase.from('inspectors').select('*').order('onboarded_at', { ascending: false })
    setInspectors(data ?? [])
  }

  const loadJobs = async () => {
    const { data } = await supabase
      .from('inspection_jobs')
      .select('id, listing_id, inspector_id, reason, status, needs_second_inspector, created_at, listing:listings(title, location_text)')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100)
    setJobs(data ?? [])
  }

  const loadInspections = async () => {
    const { data } = await supabase
      .from('property_inspections')
      .select('*, listing:listings(title, location_text)')
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

  const assign = async (jobId: string, inspectorId: string) => {
    if (!inspectorId) return
    const { error } = await supabase
      .from('inspection_jobs')
      .update({ inspector_id: inspectorId, status: 'assigned', assigned_at: new Date().toISOString() })
      .eq('id', jobId)
    if (error) return flash('Failed: ' + error.message)
    loadJobs()
  }

  const cancelJob = async (jobId: string) => {
    if (!window.confirm('Cancel this inspection request?')) return
    await supabase.from('inspection_jobs').update({ status: 'cancelled' }).eq('id', jobId)
    loadJobs()
  }

  const showEvidence = async (insp: any) => {
    const paths: string[] = insp.evidence_paths ?? []
    const urls: string[] = []
    for (const path of paths) {
      const { data } = await supabase.storage.from('inspection-evidence').createSignedUrl(path, 300)
      if (data?.signedUrl) urls.push(data.signedUrl)
    }
    setEvidenceUrls((prev) => ({ ...prev, [insp.id]: urls }))
  }

  const review = async (insp: any, decision: 'approved' | 'rejected' | 'reinspect') => {
    if (insp.inspected_by === me) return flash('You cannot review your own inspection.')
    const note = (notes[insp.id] ?? '').trim()
    if (decision !== 'approved' && !note) return flash('Add a note explaining the decision.')
    const { error } = await supabase
      .from('property_inspections')
      .update({ review_status: decision, review_note: note || null })
      .eq('id', insp.id)
    if (error) return flash('Failed: ' + error.message)

    if (decision === 'approved' && insp.verdict === 'pass') {
      await supabase.from('listings').update({ status: 'pending' }).eq('id', insp.listing_id).eq('status', 'inspection_required')
    }
    if (decision === 'reinspect') {
      await supabase.from('inspection_jobs').insert({
        listing_id: insp.listing_id,
        reason: 'reinspection',
        needs_second_inspector: true,
        created_by: me,
      })
    }
    flash('Saved.')
    loadInspections()
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

  const nameOf = (id: string | null) => inspectors.find((i) => i.user_id === id)?.full_name ?? (id ? 'Inspector' : '—')
  const active = inspectors.filter((i) => i.status === 'active')

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
        <ClipboardCheck size={22} /> Inspections
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Inspectors submit evidence. A different reviewer approves it. Inspectors are paid for completing an inspection, never for passing a property.
      </p>

      {msg && <div className="mb-4 text-sm rounded-lg border border-border bg-secondary px-3 py-2">{msg}</div>}

      <div className="flex gap-2 mb-6">
        {(['jobs', 'review', 'inspectors'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize ${
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
              <Button onClick={search}><Search size={16} /></Button>
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
                      <button onClick={() => cancelJob(j.id)} className="text-xs text-destructive hover:underline">Cancel</button>
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
          <div className="flex gap-2 mb-4 text-xs">
            {(['submitted', 'approved', 'rejected', 'reinspect'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full capitalize border ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
              >
                {f}
              </button>
            ))}
          </div>
          {inspections.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
          <div className="space-y-4">
            {inspections.map((i) => (
              <div key={i.id} className="bg-card border border-border rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-semibold">{i.listing?.title ?? 'Listing'}</p>
                    <p className="text-xs text-muted-foreground">{i.listing?.location_text} · {new Date(i.inspected_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full h-fit ${
                    i.verdict === 'pass' ? 'bg-emerald-100 text-emerald-700' : i.verdict === 'fail' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>{i.verdict ?? 'legacy'}</span>
                </div>
                {i.verdict_reason && <p><span className="text-muted-foreground">Reason:</span> {i.verdict_reason}</p>}
                <p className="text-xs text-muted-foreground">
                  Inspector: {nameOf(i.inspected_by)}
                  {i.gps_lat ? ` · GPS ${i.gps_lat.toFixed(5)}, ${i.gps_lng.toFixed(5)}` : ' · no GPS'}
                </p>
                <p className="text-xs">
                  Claimant: {i.claimant_name ?? '—'} ({i.claimant_relationship ?? '—'}) · ID seen: {i.claimant_id_seen ? 'yes' : 'no'}
                </p>
                <p className="text-xs">
                  Rent matches: {i.rent_matches == null ? '—' : i.rent_matches ? 'yes' : 'NO'} · Photos/video match: {i.listing_matches == null ? '—' : i.listing_matches ? 'yes' : 'NO'}
                </p>
                {(i.evidence_paths ?? []).length > 0 && (
                  <div>
                    <button onClick={() => showEvidence(i)} className="text-xs text-primary font-medium hover:underline">
                      View {i.evidence_paths.length} evidence file(s)
                    </button>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(evidenceUrls[i.id] ?? []).map((u, idx) => (
                        <a key={idx} href={u} target="_blank" rel="noreferrer" className="text-xs border border-border rounded px-2 py-1 hover:bg-secondary">File {idx + 1}</a>
                      ))}
                    </div>
                  </div>
                )}
                {i.review_note && <p className="text-xs text-muted-foreground">Review note: {i.review_note}</p>}
                {i.review_status === 'submitted' && (
                  <div className="pt-2 space-y-2">
                    <textarea
                      value={notes[i.id] ?? ''}
                      onChange={(e) => setNotes((p) => ({ ...p, [i.id]: e.target.value }))}
                      rows={2}
                      placeholder="Note (required to reject or ask for another inspection)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                    {i.inspected_by === me ? (
                      <p className="text-xs text-destructive">You submitted this inspection, so someone else must review it.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => review(i, 'approved')}>Approve</Button>
                        <Button variant="outline" onClick={() => review(i, 'reinspect')}>Another inspection</Button>
                        <Button variant="outline" className="text-destructive border-destructive" onClick={() => review(i, 'rejected')}>Reject</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'inspectors' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2"><UserPlus size={15} /> Add an inspector</p>
            <p className="text-xs text-muted-foreground">They must already have an EboHomes account. Use the email they signed up with.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Assigned areas, e.g. Abakaliki" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            <Button onClick={addInspector}>Add inspector</Button>
          </div>
          <div className="space-y-2">
            {inspectors.map((i) => (
              <div key={i.user_id} className="bg-card border border-border rounded-lg p-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-semibold">{i.full_name ?? 'Unnamed'} <span className="text-xs text-muted-foreground">{i.phone}</span></p>
                  <p className="text-xs text-muted-foreground">{i.areas ?? 'No area set'} · {i.status}</p>
                </div>
                <button onClick={() => toggleInspector(i)} className="text-xs text-primary hover:underline">
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
