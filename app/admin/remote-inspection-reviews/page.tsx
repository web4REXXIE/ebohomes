'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { friendlyError } from '@/lib/remote-inspection'

const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const mb = (n: number) => (Number(n) / (1024 * 1024)).toFixed(1) + ' MB'
const VERDICT: Record<string, string> = { pass: 'PASS', fail: 'FAIL', uncertain: 'UNCERTAIN' }
const yn = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '—')

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

// Remote inspections are private to the tenant. This page is where an admin decides whether the tenant may read the report.
// It never publishes anything and never touches the Inspected badge.
export default function RemoteInspectionReviewsPage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_remote_review_queue')
    if (error) setMsg({ text: friendlyError(error.message), ok: false })
    setRows((data ?? []) as any[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck size={20} /> Remote inspection reviews</h1>
        <p className="text-sm text-muted-foreground">Check the evidence, then release the report to the tenant, ask for another visit, or reject it. Landlords never see the report. Nothing here publishes anything or gives a badge.</p>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`text-sm rounded-lg border px-3 py-2 ${msg.ok ? 'border-border bg-secondary' : 'border-destructive/40 text-destructive'}`}>{msg.text}</div>}
      {loading && <Loader2 className="animate-spin text-muted-foreground" />}
      {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>}
      {rows.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-2">
          <button type="button" className="w-full text-left min-h-11" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
            <p className="font-semibold">{r.title ?? 'Property'} <span className="text-xs font-normal text-muted-foreground">{r.ref}</span></p>
            <p className="text-xs text-muted-foreground">{r.location_text}</p>
            <p className="text-xs">
              Inspector {r.inspector_name ?? '—'} · submitted {fmt(r.submitted_at)} · verdict {VERDICT[r.verdict] ?? r.verdict} · {r.files_total} file(s), {r.files_pending} not reviewed
              {r.extra_requested ? ' · waiting for extra evidence' : ''}
            </p>
          </button>
          {r.involved && <p className="text-xs text-amber-800">You are part of this request, so another administrator must review it.</p>}
          {openId === r.id && !r.involved && (
            <Review id={r.id} onFlash={(text, ok) => setMsg({ text, ok })} onDecided={() => { setOpenId(null); void load() }} />
          )}
        </div>
      ))}
    </div>
  )
}

function Review({ id, onFlash, onDecided }: { id: string; onFlash: (t: string, ok: boolean) => void; onDecided: () => void }) {
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [tenantNote, setTenantNote] = useState('')
  const [extra, setExtra] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [fileNote, setFileNote] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_remote_review_detail', { p_request: id })
    if (error) { onFlash(friendlyError(error.message), false); return }
    setD(data)
  }, [id, onFlash])
  useEffect(() => { void load() }, [load])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string, done = false) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { onFlash(friendlyError(error.message), false); return false }
    onFlash(ok, true)
    if (done) onDecided(); else await load()
    return true
  }

  async function open(fileId: string) {
    setBusy(true)
    const e = await openEvidence(fileId)
    setBusy(false)
    if (e) { onFlash(e, false); return }
    await load() // the open is now recorded, which unlocks Accept
  }

  async function reviewFile(fileId: string, decision: 'accepted' | 'rejected') {
    const n = (fileNote[fileId] ?? '').trim()
    if (decision === 'rejected' && n.length < 5) { onFlash('Write a reason of at least 5 characters.', false); return }
    const ok = await run(() => supabase.rpc('admin_review_inspection_file', { p_file: fileId, p_decision: decision, p_note: n || null }), 'Saved.')
    if (ok) setRejecting(null)
  }

  async function decide(decision: 'released' | 'reinspect' | 'rejected') {
    if (decision !== 'released' && note.trim().length < 5) { onFlash('Write the reason, at least 5 characters.', false); return }
    await run(() => supabase.rpc('admin_remote_review_decide', {
      p_request: id, p_decision: decision, p_note: note.trim() || null, p_report_note: decision === 'released' ? tenantNote.trim() || null : null,
    }), decision === 'released' ? 'Report released to the tenant.' : decision === 'reinspect' ? 'Sent back for another visit.' : 'Submission rejected.', true)
  }

  if (!d) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading…</p>
  const i = d.inspection
  const blockers: string[] = d.blockers ?? []
  const facts: [string, string | null][] = [
    ['Rent matches the listing', yn(i.rent_matches)], ['Listing details match', yn(i.listing_matches)],
    ['Road', i.road_condition], ['Water', i.water_source], ['Electricity', i.electricity_notes], ['Network', i.network_notes],
    ['Security', i.security_notes], ['Condition', i.condition_notes], ['Environment', i.environment_notes],
  ]

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="text-xs space-y-1">
        <p><b>Verdict {VERDICT[i.verdict] ?? i.verdict}:</b> {i.verdict_reason}</p>
        <p className="text-muted-foreground">
          Met: {i.claimant_name}{i.claimant_relationship ? ` (${i.claimant_relationship})` : ''} · ID seen: {yn(i.claimant_id_seen)} · GPS {i.gps_flag}
          {i.gps_distance_m != null ? `, ${Math.round(Number(i.gps_distance_m))} m from the pin` : ''} (a device claim, not proof)
        </p>
        {facts.filter(([, v]) => v).map(([k, v]) => <p key={k}><b>{k}:</b> {v}</p>)}
        {i.overall_notes && <p><b>Notes:</b> {i.overall_notes}</p>}
      </div>

      <ul className="space-y-2">
        {d.files.map((f: any) => (
          <li key={f.id} className="rounded-lg border border-border p-2 space-y-1.5 text-xs">
            <p><b>{f.kind === 'video' ? 'Video' : 'Photo'}</b> {f.name ?? 'file'} · {mb(f.bytes)} · {f.capture_method} · {f.review_status}{f.phase === 'supplement' ? ' · extra evidence' : ''}</p>
            {f.duplicates > 0 && <p className="text-amber-800 font-semibold flex items-center gap-1"><AlertTriangle size={13} /> Identical to a file in {f.duplicates} other inspection(s). This can have an innocent cause. Compare before deciding.</p>}
            {f.review_note && <p>Note: {f.review_note}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => open(f.id)}>Open (recorded)</Button>
              {f.review_status !== 'accepted' && <Button size="sm" disabled={busy || !f.opened_by_me} onClick={() => reviewFile(f.id, 'accepted')}>Accept</Button>}
              {f.review_status !== 'rejected' && <Button size="sm" variant="outline" className="text-destructive border-destructive" disabled={busy} onClick={() => setRejecting(rejecting === f.id ? null : f.id)}>Reject</Button>}
            </div>
            {!f.opened_by_me && f.review_status !== 'accepted' && <p className="text-muted-foreground">Open the file first. Accept unlocks after you have opened it.</p>}
            {rejecting === f.id && (
              <div className="space-y-2">
                <input className={field} maxLength={500} placeholder="Reason (required)" value={fileNote[f.id] ?? ''} onChange={(e) => setFileNote({ ...fileNote, [f.id]: e.target.value })} />
                <Button size="sm" disabled={busy} onClick={() => reviewFile(f.id, 'rejected')}>Confirm reject</Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {d.extra ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">Waiting for extra evidence (asked {fmt(d.extra.requested_at)})</p>
          <p>{d.extra.reason}</p>
          <button className="min-h-11 font-semibold underline" disabled={busy}
            onClick={() => { const r = window.prompt('Why cancel this request? (5+ characters)'); if (r) void run(() => supabase.rpc('admin_cancel_inspection_supplement', { p_request: d.extra.id, p_reason: r }), 'Request cancelled.') }}>
            Cancel request
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className={field} maxLength={1000} placeholder="Ask the inspector for more evidence: what is needed? (10+ characters)" value={extra} onChange={(e) => setExtra(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy || extra.trim().length < 10}
            onClick={async () => { if (await run(() => supabase.rpc('admin_request_inspection_supplement', { p_inspection: i.id, p_reason: extra.trim() }), 'Request sent. The report stays under review.')) setExtra('') }}>
            Request more evidence
          </Button>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-border">
        {blockers.length > 0 && (
          <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <p className="font-semibold">Not ready to release:</p>
            <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
        <input className={field} maxLength={500} placeholder="Message to the tenant with the report (optional, they will read it)" value={tenantNote} onChange={(e) => setTenantNote(e.target.value)} />
        <input className={field} maxLength={500} placeholder="Internal note. Required for another visit or reject. The tenant and landlord never see it." value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || blockers.length > 0} onClick={() => decide('released')}>Release report to tenant</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('reinspect')}>Another visit</Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive" disabled={busy} onClick={() => decide('rejected')}>Reject</Button>
        </div>
        <p className="text-xs text-muted-foreground">A FAIL or UNCERTAIN verdict is still a valid report. Release it if the evidence is sound. Rejecting is for evidence that cannot be trusted.</p>
      </div>
    </div>
  )
        }
