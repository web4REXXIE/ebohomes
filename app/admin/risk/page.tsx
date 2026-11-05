'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, ShieldAlert, ArrowLeft, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  CATEGORY_INFO, SEVERITY_INFO, STATUS_LABEL, RESOLUTION_OPTIONS, EVENT_LABEL,
  needsAttention, sortAlerts, isActive, friendlyRiskError, totalScore,
  type RiskCategory, type RiskSeverity, type RiskStatus,
} from '@/lib/risk-alerts'

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50'
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const TABS = [
  { key: 'attention', label: 'Needs attention' }, { key: 'info', label: 'Information' },
  { key: 'resolved', label: 'Resolved' }, { key: 'settings', label: 'Settings' },
] as const
type TabKey = (typeof TABS)[number]['key']

const GROUPS: { key: string; label: string; cats: RiskCategory[] | null }[] = [
  { key: 'all', label: 'All', cats: null },
  { key: 'property', label: 'Properties', cats: ['duplicate_property', 'multiple_accounts', 'repeated_rejected', 'recreated_listing'] },
  { key: 'document', label: 'Documents', cats: ['document_reuse'] },
  { key: 'account', label: 'Accounts', cats: ['unusual_representative', 'unauthorized_listing', 'manual_review'] },
  { key: 'location', label: 'Location', cats: ['location_change'] },
]

async function adminGetJson(path: string) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { headers: { Authorization: `Bearer ${t}` } })
  return { ok: res.ok, j: await res.json().catch(() => null) }
}

export default function AdminRiskPage() {
  const [tab, setTab] = useState<TabKey>('attention')
  const [group, setGroup] = useState('all')
  const [alerts, setAlerts] = useState<any[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadNames = useCallback(async (ids: (string | null | undefined)[]) => {
    const want = [...new Set(ids.filter(Boolean) as string[])]
    if (want.length === 0) return
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', want)
    setNames((prev) => {
      const m = { ...prev }
      ;(data ?? []).forEach((p: any) => { m[p.id] = p.full_name || 'Unnamed account' })
      return m
    })
  }, [])

  const load = useCallback(async () => {
    setErr(null)
    const { data, error } = await supabase.from('risk_alerts').select('*').order('detected_at', { ascending: false }).limit(400)
    if (error) { setErr('Could not load alerts.'); setAlerts([]); return }
    setAlerts(data ?? [])
    loadNames((data ?? []).flatMap((a: any) => [a.user_id, a.assigned_to]))
  }, [loadNames])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const list = alerts ?? []
    return {
      open: list.filter((a) => isActive(a.status) && needsAttention(a)).length,
      high: list.filter((a) => isActive(a.status) && a.severity === 'high').length,
      escalated: list.filter((a) => a.status === 'escalated').length,
      waiting: list.filter((a) => a.status === 'info_requested').length,
    }
  }, [alerts])

  const shown = useMemo(() => {
    const cats = GROUPS.find((g) => g.key === group)?.cats
    const list = (alerts ?? []).filter((a) => {
      if (cats && !cats.includes(a.category)) return false
      if (tab === 'attention') return needsAttention(a)
      if (tab === 'info') return isActive(a.status) && a.severity === 'info'
      return a.status === 'resolved'
    })
    return sortAlerts(list)
  }, [alerts, tab, group])

  const open = openId ? (alerts ?? []).find((a) => a.id === openId) : null
  if (open) return <Detail alert={open} names={names} loadNames={loadNames} onBack={() => setOpenId(null)} onChanged={load} />

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><ShieldAlert size={22} /> Risk alerts</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        These alerts point to things worth a closer look: matching properties, reused files, location changes. A match is a signal, not proof.
        Nothing here bans anyone, hides a listing or rejects a property. You decide, and every action is recorded.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Need attention', counts.open], ['High priority', counts.high], ['Escalated', counts.escalated], ['Waiting for lister', counts.waiting]].map(([l, n]) => (
          <div key={String(l)} className="rounded-lg border border-border bg-card p-3"><p className="text-2xl font-bold text-foreground">{n}</p><p className="text-xs text-muted-foreground">{l}</p></div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'settings' ? <Settings /> : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {GROUPS.map((g) => (
              <button key={g.key} onClick={() => setGroup(g.key)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${group === g.key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>{g.label}</button>
            ))}
          </div>
          {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
          {alerts === null ? <Loader2 className="animate-spin" />
            : shown.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here right now.</p>
            : shown.map((a) => {
              const sev = SEVERITY_INFO[a.severity as RiskSeverity]
              return (
                <button key={a.id} onClick={() => setOpenId(a.id)} className="block w-full rounded-lg border border-border bg-card p-3 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sev.tone}`}>{sev.label}</span>
                    <span className="text-xs text-muted-foreground">{a.ref} · {STATUS_LABEL[a.status as RiskStatus]}</span>
                  </div>
                  <p className="mt-1 font-semibold text-foreground">{CATEGORY_INFO[a.category as RiskCategory]?.label ?? a.category}</p>
                  <p className="text-sm text-muted-foreground">{a.listing_title ?? 'Listing'} · {names[a.user_id] ?? 'Account'}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">{a.explanation}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Detected {when(a.detected_at)}{a.assigned_to ? ` · ${names[a.assigned_to] ?? 'Assigned'}` : ' · Not assigned'}</p>
                </button>
              )
            })}
        </>
      )}
    </div>
  )
}

// ---------------- one alert ----------------
type Act = 'note' | 'ask' | 'escalate' | 'hold' | 'resolve'
const ACTS: { key: Act; label: string; ph: string; help: string }[] = [
  { key: 'note', label: 'Add a note', ph: 'What did you check or find?', help: 'Saved to the investigation history.' },
  { key: 'ask', label: 'Ask the lister', ph: 'What do you need from the lister?', help: 'The lister sees this message. Do not name other accounts or share private details.' },
  { key: 'escalate', label: 'Escalate', ph: 'Why does this need senior attention?', help: 'Tells other administrators. Does not penalise anyone.' },
  { key: 'hold', label: 'Property hold', ph: 'Why is a hold justified?', help: 'Blocks NEW applications, viewings and tenancies only. The listing stays visible and existing applications and tenancies are untouched.' },
  { key: 'resolve', label: 'Record decision', ph: 'Why did you decide this?', help: 'Closes the alert. It never bans, hides or rejects anything by itself.' },
]

function Detail({ alert: a, names, loadNames, onBack, onChanged }: { alert: any; names: Record<string, string>; loadNames: (ids: any[]) => void; onBack: () => void; onChanged: () => void }) {
  const [evidence, setEvidence] = useState<any[] | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [act, setAct] = useState<Act>('note')
  const [text, setText] = useState('')
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const resolved = a.status === 'resolved'

  const loadAll = useCallback(async () => {
    const [e, h] = await Promise.all([
      supabase.from('risk_alert_evidence').select('*').eq('alert_id', a.id).order('created_at'),
      supabase.from('risk_alert_events').select('*').eq('alert_id', a.id).order('created_at', { ascending: false }),
    ])
    setEvidence(e.data ?? [])
    setEvents(h.data ?? [])
    loadNames([...(e.data ?? []).filter((x: any) => x.ref_type === 'profile').map((x: any) => x.ref_id), ...(h.data ?? []).map((x: any) => x.actor_id), a.resolved_by])
  }, [a.id, a.resolved_by, loadNames])
  useEffect(() => { loadAll() }, [loadAll])

  const run = async (fn: string, args: Record<string, unknown>, okMsg: string) => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return setMsg({ ok: false, t: friendlyRiskError(error.message) })
    setMsg({ ok: true, t: typeof data === 'string' && data ? data : okMsg })
    setText(''); setResolution('')
    await loadAll(); onChanged()
  }

  const submit = () => {
    const note = text.trim()
    if (resolved) return run('admin_risk_reopen', { p_alert: a.id, p_note: note }, 'Alert reopened.')
    if (act === 'note') return run('admin_risk_add_note', { p_alert: a.id, p_note: note }, 'Note saved.')
    if (act === 'ask') return run('admin_risk_request_info', { p_alert: a.id, p_message: note }, 'Message sent to the lister.')
    if (act === 'escalate') return run('admin_risk_escalate', { p_alert: a.id, p_note: note }, 'Alert escalated.')
    if (act === 'hold') return run('admin_risk_place_hold', { p_alert: a.id, p_reason: note }, 'Hold placed.')
    if (!resolution) return setMsg({ ok: false, t: 'Choose a decision.' })
    return run('admin_risk_resolve', { p_alert: a.id, p_resolution: resolution, p_note: note }, 'Decision recorded.')
  }

  const openFile = async (id: string) => {
    setMsg(null)
    const { ok, j } = await adminGetJson(`/api/admin/listing-authority/document?id=${encodeURIComponent(id)}`)
    if (!ok || !j?.url) return setMsg({ ok: false, t: j?.error ?? 'Could not open the file.' })
    window.open(j.url, '_blank', 'noopener,noreferrer')
  }

  const sev = SEVERITY_INFO[a.severity as RiskSeverity]
  const cur = ACTS.find((x) => x.key === act)!
  const score = evidence ? totalScore(evidence) : a.score

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} /> Back to alerts</button>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sev.tone}`}>{sev.label}</span>
          <span className="text-xs text-muted-foreground">{a.ref} · {STATUS_LABEL[a.status as RiskStatus]}</span>
        </div>
        <h1 className="mt-1 text-lg font-bold text-foreground">{CATEGORY_INFO[a.category as RiskCategory]?.label ?? a.category}</h1>
        <p className="mt-1 text-sm text-foreground">{a.explanation}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div><dt>Account</dt><dd className="text-foreground">{names[a.user_id] ?? 'n/a'}</dd></div>
          <div><dt>Listing</dt><dd className="text-foreground">{a.listing_id ? <Link className="underline" href={`/listing/${a.listing_id}`}>{a.listing_title ?? 'Open listing'}</Link> : (a.listing_title ?? 'Deleted listing')}</dd></div>
          <div><dt>Detected</dt><dd className="text-foreground">{when(a.detected_at)}</dd></div>
          <div><dt>Assigned to</dt><dd className="text-foreground">{a.assigned_to ? names[a.assigned_to] ?? 'Assigned' : 'Nobody yet'}</dd></div>
        </dl>
        {a.listing_id && <Link href="/admin/listing-authority" className="mt-2 inline-block text-xs underline">Property authority is reviewed separately in Listing authority</Link>}
      </div>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="font-semibold text-foreground">Why this alert exists</h2>
        <p className="text-xs text-muted-foreground">Score {score} is the plain total of the points below. It only sets how urgent this is. It never replaces authority review.</p>
        {evidence === null ? <Loader2 className="mt-2 animate-spin" /> : (
          <ul className="mt-2 space-y-2">
            {evidence.map((e) => (
              <li key={e.id} className="rounded-lg bg-secondary p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {e.ref_type === 'profile' ? `${e.label}: ${names[e.ref_id] ?? 'Account'}` : e.label}
                  </span>
                  {e.weight > 0 && <span className="shrink-0 rounded-full bg-background px-2 text-xs font-semibold">+{e.weight}</span>}
                </div>
                {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                {e.ref_type === 'listing' && e.kind === 'listing' && <Link className="text-xs underline" href={`/listing/${e.ref_id}`}>View listing</Link>}
                {e.ref_type === 'authority_document' && (
                  <button onClick={() => openFile(e.ref_id)} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold underline"><FileText size={14} /> Open file (admin only, recorded)</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="font-semibold text-foreground">{resolved ? 'Decision' : 'Take action'}</h2>
        {resolved ? (
          <p className="text-sm text-foreground">{RESOLUTION_OPTIONS.find((r) => r.value === a.resolution)?.label ?? a.resolution}: {a.decision_note}</p>
        ) : (
          <>
            {a.assigned_to == null && (
              <button disabled={busy} onClick={() => run('admin_risk_assign', { p_alert: a.id }, 'Assigned to you.')} className={`${btn} mb-2 border-border bg-card`}>Assign to me</button>
            )}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {ACTS.map((x) => (
                <button key={x.key} onClick={() => { setAct(x.key); setMsg(null) }}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${act === x.key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>{x.label}</button>
              ))}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{cur.help}</p>
            {act === 'resolve' && (
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} className={`${field} mb-2`} aria-label="Decision">
                <option value="">Choose a decision</option>
                {RESOLUTION_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            )}
            {act === 'resolve' && resolution && <p className="mb-2 text-xs text-muted-foreground">{RESOLUTION_OPTIONS.find((r) => r.value === resolution)?.help}</p>}
          </>
        )}
        {resolved && <p className="mb-2 text-xs text-muted-foreground">Reopen only if new information changes the picture.</p>}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1500} placeholder={resolved ? 'Why are you reopening this?' : cur.ph} className={field} />
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 rounded-lg border p-2 text-sm ${msg.ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{msg.t}</p>}
        <button disabled={busy || text.trim().length < 5} onClick={submit} className={`${btn} mt-2 border-primary bg-primary text-primary-foreground`}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : resolved ? 'Reopen alert' : cur.label}
        </button>
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="font-semibold text-foreground">Investigation history</h2>
        <ul className="mt-2 space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="text-sm">
              <span className="font-medium text-foreground">{EVENT_LABEL[ev.event] ?? ev.event}</span>
              <span className="text-xs text-muted-foreground"> · {ev.actor_id ? names[ev.actor_id] ?? 'Administrator' : 'System'} · {when(ev.created_at)}</span>
              {ev.note && <p className="text-xs text-muted-foreground">{ev.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ---------------- settings + first scan ----------------
const SETTING_FIELDS: { k: string; label: string; help: string; min: number; max: number }[] = [
  { k: 'duplicate_radius_m', label: 'Same-place distance (metres)', help: 'Two pins closer than this count as the same place.', min: 5, max: 1000 },
  { k: 'location_jump_m', label: 'Large location jump (metres)', help: 'A move bigger than this is treated as more serious.', min: 100, max: 50000 },
  { k: 'photo_hamming_max', label: 'Photo similarity (0 to 16)', help: 'Higher means looser matching. Lower means only near-identical photos match.', min: 0, max: 16 },
  { k: 'photo_match_min', label: 'Photos that must match', help: 'How many photos must look alike before it counts.', min: 1, max: 10 },
  { k: 'phone_share_min', label: 'Accounts sharing an owner phone', help: 'Raise an alert when this many accounts name the same owner phone.', min: 2, max: 20 },
  { k: 'recreate_count', label: 'Re-creations that raise an alert', help: 'Deleted and re-listed this many times for one place.', min: 2, max: 20 },
  { k: 'recreate_window_days', label: 'Re-creation window (days)', help: 'How far back to count deletions.', min: 1, max: 365 },
]

function Settings() {
  const [vals, setVals] = useState<Record<string, string> | null>(null)
  const [tol, setTol] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [scan, setScan] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('risk_settings').select('*').eq('id', true).maybeSingle()
      const v: Record<string, string> = {}
      SETTING_FIELDS.forEach((f) => { v[f.k] = String(data?.[f.k] ?? '') })
      setVals(v)
      const { data: a } = await supabase.from('listing_authority_settings').select('gps_tolerance_m').eq('id', true).maybeSingle()
      setTol(a?.gps_tolerance_m ?? null)
    })()
  }, [])

  const save = async () => {
    setBusy(true); setMsg(null)
    const p: Record<string, number> = {}
    SETTING_FIELDS.forEach((f) => { const n = Number(vals?.[f.k]); if (Number.isFinite(n)) p[f.k] = n })
    const { error } = await supabase.rpc('admin_risk_update_settings', { p_values: p, p_reason: reason.trim() })
    setBusy(false)
    if (error) return setMsg({ ok: false, t: friendlyRiskError(error.message) })
    setReason(''); setMsg({ ok: true, t: 'Settings saved. They apply to new checks.' })
  }

  const scanExisting = async () => {
    if (!window.confirm('Check all existing listings for matches? This only creates alerts. It changes no listing, account or application.')) return
    setBusy(true); setMsg(null)
    let offset = 0, scanned = 0, raised = 0
    for (;;) {
      setScan(`Checked ${scanned} listings, ${raised} alert(s) so far...`)
      const { data, error } = await supabase.rpc('admin_risk_scan_batch', { p_offset: offset, p_limit: 100 })
      if (error) { setBusy(false); setScan(null); return setMsg({ ok: false, t: friendlyRiskError(error.message) }) }
      scanned += data?.scanned ?? 0; raised += data?.alerts_raised ?? 0
      if (!data?.scanned || data.scanned < 100) break
      offset += 100
    }
    setBusy(false); setScan(null)
    setMsg({ ok: true, t: `Done. Checked ${scanned} listings and raised ${raised} new alert(s).` })
  }

  if (!vals) return <Loader2 className="animate-spin" />
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        These numbers decide when something is flagged. They are guides, not fraud rules. Changes are recorded in the audit log.
        The location-change distance ({tol ?? 'n/a'} m) is set in Listing authority, so there is only one place to change it.
      </p>
      {SETTING_FIELDS.map((f) => (
        <label key={f.k} className="block">
          <span className="text-sm font-medium text-foreground">{f.label}</span>
          <input type="number" inputMode="numeric" min={f.min} max={f.max} value={vals[f.k]} onChange={(e) => setVals({ ...vals, [f.k]: e.target.value })} className={field} />
          <span className="text-xs text-muted-foreground">{f.help}</span>
        </label>
      ))}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change" maxLength={300} className={field} />
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border p-2 text-sm ${msg.ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{msg.t}</p>}
      <button disabled={busy || reason.trim().length < 5} onClick={save} className={`${btn} border-primary bg-primary text-primary-foreground`}>Save settings</button>

      <div className="rounded-lg border border-border bg-card p-3">
        <h2 className="font-semibold text-foreground">Check existing listings</h2>
        <p className="text-xs text-muted-foreground">New listings and files are checked automatically. Run this once to check what was already there. It is safe to repeat: the same finding is never raised twice.</p>
        {scan && <p className="mt-1 text-xs">{scan}</p>}
        <button disabled={busy} onClick={scanExisting} className={`${btn} mt-2 border-border bg-card`}>Check existing listings</button>
      </div>
    </div>
  )
}
