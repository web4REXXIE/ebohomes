'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  CASE_EVENT_LABEL, CASE_STATUS_LABEL, CASE_STATUS_TONE, DECISION_OWNERSHIP, OUTCOME_OPTIONS,
  buildActionRows, caseMatches, cleanTitle, countText, dayRange, formatDuration, friendlyTrustError,
  isCaseActive, paginate, parseOverview, presetRange, rangeValid, ratioText, sortCases, titleOk,
  type CaseStatus, type Overview, type RangePreset,
} from '@/lib/trust-ops'
import { SEVERITY_INFO, CATEGORY_INFO, type RiskSeverity, type RiskCategory } from '@/lib/risk-alerts'

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50'
const btnPrimary = `${btn} border-primary bg-primary text-primary-foreground`
const btnPlain = `${btn} border-border bg-card`
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const PAGE_SIZE = 15

const TABS = [
  { key: 'overview', label: 'Overview' }, { key: 'cases', label: 'Investigations' },
  { key: 'reports', label: 'Reports' }, { key: 'rules', label: 'Who decides what' },
] as const
type TabKey = (typeof TABS)[number]['key']

type Access = { enforced: boolean; can_case: boolean; is_super: boolean }

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <p role={ok ? 'status' : 'alert'} className={`rounded-lg border p-2 text-sm ${ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{children}</p>
}

export default function TrustOperationsPage() {
  // useSearchParams needs a Suspense boundary so the page can still be prepared at build time.
  return <Suspense fallback={<div className="p-4"><Loader2 className="animate-spin" aria-label="Loading" /></div>}><Operations /></Suspense>
}

function Operations() {
  const router = useRouter()
  const params = useSearchParams()
  const t = params.get('tab')
  const tab: TabKey = TABS.some((x) => x.key === t) ? (t as TabKey) : 'overview'
  const [access, setAccess] = useState<Access | null>(null)

  const loadAccess = useCallback(async () => {
    const { data } = await supabase.rpc('admin_trust_my_access')
    if (data && typeof data === 'object') setAccess(data as Access)
  }, [])
  useEffect(() => { loadAccess() }, [loadAccess])

  const go = (k: TabKey) => router.push(`/admin/operations?tab=${k}`)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><ShieldCheck size={22} aria-hidden /> Trust Operations</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        One place to see what is waiting and to track investigations. Each decision still belongs to its own review page.
        Opening or closing an investigation never approves or rejects a property, and never bans anyone.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Trust operations sections">
        {TABS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => go(x.key)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${tab === x.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{x.label}</button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'cases' && <CasesTab access={access} initialStatus={params.get('status')} fromAlert={params.get('alert')} />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'rules' && <RulesTab access={access} onChanged={loadAccess} />}
    </div>
  )
}

// ---------------------------------------------------------------- overview
function OverviewTab() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = presetRange('30', new Date())
      const { data, error } = await supabase.rpc('admin_trust_overview', { p_from: r.from, p_to: r.to })
      if (!alive) return
      if (error) return setErr(friendlyTrustError(error.message))
      setOv(parseOverview(data))
    })()
    return () => { alive = false }
  }, [])

  if (err) return <Notice ok={false}>{err}</Notice>
  if (!ov) return <Loader2 className="animate-spin" aria-label="Loading" />
  const rows = buildActionRows(ov.queues)
  const waiting = rows.filter((r) => r.count && r.count > 0)
  return (
    <div className="space-y-4">
      <section aria-labelledby="waiting-h" className="space-y-2">
        <h2 id="waiting-h" className="font-semibold text-foreground">Waiting for a decision</h2>
        {waiting.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing is waiting right now.</p>}
        <ul className="space-y-2">
          {waiting.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border bg-card p-3 ${r.urgent ? 'border-red-300' : 'border-border'}`}>
                <span className="min-w-0"><span className="block font-semibold text-foreground">{r.label}</span><span className="block text-xs text-muted-foreground">{r.hint}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-3 py-1 text-sm font-bold ${r.urgent ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'}`}>{countText(r.count)}</span><ChevronRight size={16} aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
        {rows.some((r) => r.count === null) && <p className="text-xs text-muted-foreground">A dash means that count could not be read. It is not zero.</p>}
      </section>

      <section aria-labelledby="recent-h" className="space-y-2">
        <h2 id="recent-h" className="font-semibold text-foreground">Recently completed</h2>
        {ov.recent.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No completed reviews yet.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {ov.recent.map((r, i) => (
              <li key={i}>
                <Link href={r.href} className="flex min-h-12 items-center justify-between gap-3 p-3 text-sm">
                  <span className="min-w-0"><span className="block font-medium capitalize text-foreground">{r.kind}</span><span className="block truncate text-xs text-muted-foreground">{r.label}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{when(r.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- investigations
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'active', label: 'Active' }, { key: 'escalated', label: 'Escalated' }, { key: 'info_requested', label: 'Waiting for lister' },
  { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All' },
]

function CasesTab({ access, initialStatus, fromAlert }: { access: Access | null; initialStatus: string | null; fromAlert: string | null }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState(STATUS_FILTERS.some((f) => f.key === initialStatus) ? (initialStatus as string) : 'active')
  const [text, setText] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(!!fromAlert)
  const [err, setErr] = useState<string | null>(null)
  const canWork = !!access?.can_case // the database decides; this only switches the buttons

  const load = useCallback(async () => {
    setErr(null)
    const { data, error } = await supabase.from('trust_cases').select('*').order('opened_at', { ascending: false }).limit(500)
    if (error) { setErr('Could not load investigations.'); setRows([]); return }
    setRows(data ?? [])
    const ids = [...new Set((data ?? []).flatMap((c: any) => [c.subject_user_id, c.assigned_to]).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      const m: Record<string, string> = {}
      ;(ps ?? []).forEach((p: any) => { m[p.id] = p.full_name || 'Unnamed account' })
      setNames((prev) => ({ ...prev, ...m }))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const list = (rows ?? []).filter((c) => {
      if (!caseMatches(c, text)) return false
      if (filter === 'active') return isCaseActive(c.status)
      if (filter === 'all') return true
      return c.status === filter
    })
    return sortCases(list)
  }, [rows, filter, text])
  const pg = paginate(shown, page, PAGE_SIZE)

  if (creating) return <NewCase fromAlert={fromAlert} onCancel={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await load(); setOpenId(id) }} />
  const open = openId ? (rows ?? []).find((c) => c.id === openId) : null
  if (open) return <CaseDetail c={open} names={names} canWork={canWork} onBack={() => setOpenId(null)} onChanged={load} />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Tracked investigations. Risk alerts stay in Risk Alerts; a case can link to them.</p>
        <button disabled={!canWork} onClick={() => setCreating(true)} className={btnPrimary}>New investigation</button>
      </div>
      {access && !canWork && <Notice ok={false}>You do not have the role needed to work on investigation cases. You can still read them.</Notice>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} onClick={() => { setFilter(f.key); setPage(1) }}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${filter === f.key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>{f.label}</button>
        ))}
      </div>
      <label className="block"><span className="sr-only">Search by reference or title</span>
        <input value={text} onChange={(e) => { setText(e.target.value); setPage(1) }} placeholder="Search by reference or title" className={field} /></label>
      {err && <Notice ok={false}>{err}</Notice>}
      {rows === null ? <Loader2 className="animate-spin" aria-label="Loading" />
        : pg.items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No investigations match.</p>
        : pg.items.map((c) => (
          <button key={c.id} onClick={() => setOpenId(c.id)} className="block w-full rounded-lg border border-border bg-card p-3 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CASE_STATUS_TONE[c.status as CaseStatus]}`}>{CASE_STATUS_LABEL[c.status as CaseStatus]}</span>
              {c.priority === 'high' && c.status !== 'closed' && <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-900">High priority</span>}
              <span className="text-xs text-muted-foreground">{c.ref}</span>
            </div>
            <p className="mt-1 font-semibold text-foreground">{c.title}</p>
            <p className="text-sm text-muted-foreground">{c.listing_title ?? 'No listing'} · {names[c.subject_user_id] ?? 'Account'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Opened {when(c.opened_at)}{c.assigned_to ? ` · ${names[c.assigned_to] ?? 'Assigned'}` : ' · Not assigned'}</p>
          </button>
        ))}
      {pg.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2">
          <button disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)} className={btnPlain}>Previous</button>
          <span className="text-sm text-muted-foreground">Page {pg.page} of {pg.pages}</span>
          <button disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)} className={btnPlain}>Next</button>
        </nav>
      )}
    </div>
  )
}

function NewCase({ fromAlert, onCancel, onCreated }: { fromAlert: string | null; onCancel: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
  const [note, setNote] = useState('')
  const [alert, setAlert] = useState<any | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<any[]>([])
  const [listing, setListing] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!fromAlert) return
    ;(async () => {
      const { data } = await supabase.from('risk_alerts').select('id, ref, category, severity, explanation, listing_id, listing_title').eq('id', fromAlert).maybeSingle()
      if (!data) return
      setAlert(data)
      setTitle((p) => p || cleanTitle(`${CATEGORY_INFO[data.category as RiskCategory]?.label ?? 'Risk alert'}: ${data.listing_title ?? data.ref}`))
      if (data.severity === 'high') setPriority('high')
    })()
  }, [fromAlert])

  useEffect(() => {
    const s = q.trim()
    if (s.length < 3) { setFound([]); return }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('listings').select('id, title, location_text').ilike('title', `%${s.replace(/[%_]/g, '')}%`).limit(6)
      setFound(data ?? [])
    }, 300)
    return () => clearTimeout(h)
  }, [q])

  const create = async () => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('admin_case_open', {
      p_title: cleanTitle(title), p_listing: listing?.id ?? null, p_user: null,
      p_alerts: alert ? [alert.id] : null, p_priority: priority, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setMsg(friendlyTrustError(error.message))
    onCreated(String(data))
  }

  return (
    <div className="space-y-3">
      <button onClick={onCancel} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> Back</button>
      <h2 className="text-lg font-bold text-foreground">New investigation</h2>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">A case tracks an investigation. It does not approve, reject, hold or suspend anything. Use the owning page for that.</p>
      {alert && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <p className="font-semibold text-foreground">From risk alert {alert.ref}</p>
          <p className="text-muted-foreground">{alert.explanation}</p>
        </div>
      )}
      <label className="block"><span className="text-sm font-medium">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field} placeholder="What is being investigated?" /></label>
      {!alert && (
        <div>
          <label className="block"><span className="text-sm font-medium">Listing (search by title)</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} className={field} placeholder="Type at least 3 letters" /></label>
          {listing && <p className="mt-1 text-sm">Selected: <strong>{listing.title}</strong> <button className="underline" onClick={() => setListing(null)}>change</button></p>}
          {!listing && found.length > 0 && (
            <ul className="mt-1 divide-y divide-border rounded-lg border border-border bg-card">
              {found.map((l) => <li key={l.id}><button onClick={() => { setListing(l); setFound([]); setQ('') }} className="block min-h-11 w-full p-2 text-left text-sm">{l.title}<span className="block text-xs text-muted-foreground">{l.location_text}</span></button></li>)}
            </ul>
          )}
        </div>
      )}
      <label className="block"><span className="text-sm font-medium">Priority</span>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={field}><option value="normal">Normal</option><option value="high">High</option></select></label>
      <label className="block"><span className="text-sm font-medium">First note (internal, optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={field} /></label>
      {msg && <Notice ok={false}>{msg}</Notice>}
      <button disabled={busy || !titleOk(title) || (!alert && !listing)} onClick={create} className={btnPrimary}>{busy ? 'Opening...' : 'Open investigation'}</button>
      {!alert && !listing && <p className="text-xs text-muted-foreground">Choose a listing, or open the case from a risk alert.</p>}
    </div>
  )
}

type Act = 'note' | 'ask' | 'escalate' | 'assign' | 'link' | 'close'
const ACTS: { key: Act; label: string; ph: string; help: string }[] = [
  { key: 'note', label: 'Add a note', ph: 'What did you check or find?', help: 'INTERNAL. Only administrators can see this. The lister never sees it.' },
  { key: 'ask', label: 'Ask the lister', ph: 'What do you need from the lister?', help: 'The lister SEES this message. Do not name other accounts, mention this investigation or share private details.' },
  { key: 'escalate', label: 'Escalate', ph: 'Why does this need senior attention?', help: 'Tells other administrators. Does not penalise anyone.' },
  { key: 'assign', label: 'Assign to me', ph: '', help: 'You become the person responsible for this case.' },
  { key: 'link', label: 'Link a risk alert', ph: '', help: 'Records that an alert belongs to this case. The alert itself is not changed.' },
  { key: 'close', label: 'Record decision', ph: 'Why did you decide this?', help: 'Closes the case. It does not approve or reject the property and does not resolve risk alerts.' },
]

function CaseDetail({ c, names, canWork, onBack, onChanged }: { c: any; names: Record<string, string>; canWork: boolean; onBack: () => void; onChanged: () => void }) {
  const [events, setEvents] = useState<any[] | null>(null)
  const [linked, setLinked] = useState<any[]>([])
  const [candidates, setCandidates] = useState<any[]>([])
  const [ctx, setCtx] = useState<{ listing: any | null; onHold: boolean | null }>({ listing: null, onHold: null })
  const [actorNames, setActorNames] = useState<Record<string, string>>({})
  const [act, setAct] = useState<Act>('note')
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState('')
  const [alertPick, setAlertPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const closed = c.status === 'closed'

  const loadAll = useCallback(async () => {
    const [e, l] = await Promise.all([
      supabase.from('trust_case_events').select('*').eq('case_id', c.id).order('created_at', { ascending: false }),
      supabase.from('trust_case_alerts').select('alert_id, risk_alerts(id, ref, category, severity, status, explanation)').eq('case_id', c.id),
    ])
    setEvents(e.data ?? [])
    const links = (l.data ?? []).map((x: any) => x.risk_alerts).filter(Boolean)
    setLinked(links)
    const ids = [...new Set((e.data ?? []).map((x: any) => x.actor_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      const m: Record<string, string> = {}
      ;(data ?? []).forEach((p: any) => { m[p.id] = p.full_name || 'Administrator' })
      setActorNames(m)
    }
    if (c.listing_id) {
      const [li, hold, al] = await Promise.all([
        supabase.from('listings').select('id, title, status, authority_status, location_text').eq('id', c.listing_id).maybeSingle(),
        supabase.rpc('listing_on_hold', { p_listing: c.listing_id }),
        supabase.from('risk_alerts').select('id, ref, category, severity, status').eq('listing_id', c.listing_id).neq('status', 'resolved'),
      ])
      setCtx({ listing: li.data ?? null, onHold: typeof hold.data === 'boolean' ? hold.data : null })
      const have = new Set(links.map((x: any) => x.id))
      setCandidates((al.data ?? []).filter((x: any) => !have.has(x.id)))
    }
  }, [c.id, c.listing_id])
  useEffect(() => { loadAll() }, [loadAll])

  const run = async (fn: string, args: Record<string, unknown>, okMsg: string) => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return setMsg({ ok: false, t: friendlyTrustError(error.message) })
    let t = okMsg
    if (fn === 'admin_case_close' && data && typeof data === 'object' && (data as any).linked_alerts_still_open > 0) {
      t = `Case closed. ${(data as any).linked_alerts_still_open} linked risk alert(s) are still open. Resolve them in Risk Alerts.`
    }
    setMsg({ ok: true, t }); setText(''); setOutcome(''); setAlertPick('')
    await loadAll(); onChanged()
  }

  const submit = () => {
    const note = text.trim()
    if (closed) return run('admin_case_reopen', { p_case: c.id, p_note: note }, 'Case reopened.')
    if (act === 'note') return run('admin_case_add_note', { p_case: c.id, p_note: note }, 'Note saved.')
    if (act === 'ask') return run('admin_case_request_info', { p_case: c.id, p_message: note }, 'Message sent to the lister.')
    if (act === 'escalate') return run('admin_case_escalate', { p_case: c.id, p_note: note }, 'Case escalated.')
    if (act === 'assign') return run('admin_case_assign', { p_case: c.id, p_assignee: null }, 'Assigned to you.')
    if (act === 'link') return run('admin_case_link_alert', { p_case: c.id, p_alert: alertPick }, 'Risk alert linked.')
    if (!outcome) return setMsg({ ok: false, t: 'Choose a decision.' })
    return run('admin_case_close', { p_case: c.id, p_outcome: outcome, p_note: note }, 'Decision recorded. The case is closed.')
  }

  const needsText = closed || ['note', 'ask', 'escalate', 'close'].includes(act)
  const ready = canWork && !busy && (!needsText || text.trim().length >= 5) && (act !== 'link' || closed || !!alertPick) && (act !== 'close' || closed || !!outcome)
  const opt = OUTCOME_OPTIONS.find((o) => o.value === c.outcome)

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> All investigations</button>
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CASE_STATUS_TONE[c.status as CaseStatus]}`}>{CASE_STATUS_LABEL[c.status as CaseStatus]}</span>
          {c.priority === 'high' && !closed && <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-900">High priority</span>}
          <span className="text-xs text-muted-foreground">{c.ref}</span>
        </div>
        <h2 className="mt-1 text-lg font-bold text-foreground">{c.title}</h2>
        <p className="text-sm text-muted-foreground">Account: {names[c.subject_user_id] ?? 'Account'} · {c.assigned_to ? `Assigned to ${names[c.assigned_to] ?? 'an administrator'}` : 'Not assigned'}</p>
        <p className="text-xs text-muted-foreground">Opened {when(c.opened_at)}{closed ? ` · Closed ${when(c.closed_at)}` : ''}</p>
        {closed && <p className="mt-2 rounded bg-secondary p-2 text-sm"><strong>{opt?.label ?? c.outcome}.</strong> {c.decision_note}</p>}
      </div>

      {c.listing_id && (
        <section aria-labelledby="ctx-h" className="rounded-lg border border-border bg-card p-3 text-sm">
          <h3 id="ctx-h" className="font-semibold text-foreground">Property and where each decision lives</h3>
          <p className="text-muted-foreground">{ctx.listing?.title ?? c.listing_title ?? 'Listing'}{ctx.listing?.location_text ? ` · ${ctx.listing.location_text}` : ''}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Authority: <strong>{(ctx.listing?.authority_status ?? 'unknown').replace(/_/g, ' ')}</strong> · Listing: <strong>{ctx.listing?.status ?? 'unknown'}</strong> · Hold: <strong>{ctx.onHold === null ? 'unknown' : ctx.onHold ? 'on hold' : 'none'}</strong>
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <Link className="min-h-11 inline-flex items-center underline" href={`/admin/listing-authority?listing=${c.listing_id}`}>Authority review</Link>
            <Link className="min-h-11 inline-flex items-center underline" href="/admin/property-review">Property review</Link>
            <Link className="min-h-11 inline-flex items-center underline" href="/admin/inspections">Inspections</Link>
            <Link className="min-h-11 inline-flex items-center underline" href="/admin/holds">Property holds</Link>
          </div>
        </section>
      )}

      <section aria-labelledby="alerts-h" className="rounded-lg border border-border bg-card p-3 text-sm">
        <h3 id="alerts-h" className="font-semibold text-foreground">Linked risk alerts</h3>
        {linked.length === 0 ? <p className="text-muted-foreground">None linked.</p> : (
          <ul className="mt-1 space-y-2">
            {linked.map((a) => {
              const sev = SEVERITY_INFO[a.severity as RiskSeverity]
              return (
                <li key={a.id} className="rounded border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sev?.tone ?? ''}`}>{sev?.label ?? a.severity}</span><span className="text-xs text-muted-foreground">{a.ref} · {a.status === 'resolved' ? 'Resolved' : 'Still open'}</span></div>
                  <p className="mt-1 text-foreground">{CATEGORY_INFO[a.category as RiskCategory]?.label ?? a.category}</p>
                  <p className="text-xs text-muted-foreground">{a.explanation}</p>
                </li>
              )
            })}
          </ul>
        )}
        <Link className="mt-2 inline-flex min-h-11 items-center underline" href="/admin/risk">Open Risk Alerts</Link>
      </section>

      <section aria-labelledby="act-h" className="space-y-2 rounded-lg border border-border bg-card p-3">
        <h3 id="act-h" className="font-semibold text-foreground">{closed ? 'Reopen this case' : 'Take an action'}</h3>
        {!canWork && <Notice ok={false}>You do not have the role needed to act on investigation cases.</Notice>}
        {!closed && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Actions">
            {ACTS.map((a) => <button key={a.key} role="tab" aria-selected={act === a.key} onClick={() => { setAct(a.key); setMsg(null) }}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${act === a.key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>{a.label}</button>)}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{closed ? 'Reopening puts the case back to Investigating and is recorded.' : ACTS.find((a) => a.key === act)?.help}</p>
        {!closed && act === 'link' && (
          candidates.length === 0 ? <p className="text-sm text-muted-foreground">No other open alerts exist for this listing.</p> : (
            <select value={alertPick} onChange={(e) => setAlertPick(e.target.value)} className={field} aria-label="Risk alert to link">
              <option value="">Choose an alert</option>
              {candidates.map((a) => <option key={a.id} value={a.id}>{a.ref} · {CATEGORY_INFO[a.category as RiskCategory]?.label ?? a.category}</option>)}
            </select>
          )
        )}
        {!closed && act === 'close' && (
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Decision</legend>
            {OUTCOME_OPTIONS.map((o) => (
              <label key={o.value} className="flex min-h-11 items-start gap-2 rounded border border-border p-2 text-sm">
                <input type="radio" name="outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} className="mt-1" />
                <span><span className="font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.help}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        {needsText && <textarea aria-label="Your note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder={closed ? 'Why are you reopening this?' : ACTS.find((a) => a.key === act)?.ph} className={field} />}
        {msg && <Notice ok={msg.ok}>{msg.t}</Notice>}
        <button disabled={!ready} onClick={submit} className={btnPrimary}>{busy ? 'Saving...' : closed ? 'Reopen case' : ACTS.find((a) => a.key === act)?.label}</button>
      </section>

      <section aria-labelledby="hist-h" className="space-y-2">
        <h3 id="hist-h" className="font-semibold text-foreground">History</h3>
        {events === null ? <Loader2 className="animate-spin" aria-label="Loading" /> : (
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-card p-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-foreground">{CASE_EVENT_LABEL[e.event] ?? e.event}</span><span className="text-xs text-muted-foreground">{when(e.created_at)}</span></div>
                <p className="text-xs text-muted-foreground">{e.actor_id ? actorNames[e.actor_id] ?? 'Administrator' : 'System'}{e.landlord_visible ? ' · Shown to the lister' : e.note ? ' · Internal' : ''}</p>
                {e.note && <p className="mt-1 whitespace-pre-wrap text-foreground">{e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- reports
function ReportsTab() {
  const [preset, setPreset] = useState<RangePreset | 'custom'>('30')
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [range, setRange] = useState(() => presetRange('30', new Date()))
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr(null)
      const { data, error } = await supabase.rpc('admin_trust_overview', { p_from: range.from, p_to: range.to })
      if (!alive) return
      setLoading(false)
      if (error) { setErr(friendlyTrustError(error.message)); return }
      setOv(parseOverview(data))
    })()
    return () => { alive = false }
  }, [range])

  const pickPreset = (p: RangePreset) => { setPreset(p); setRange(presetRange(p, new Date())) }
  const applyCustom = () => {
    const r = fromDay && toDay ? dayRange(fromDay, toDay) : null
    if (!r || !rangeValid(r.from, r.to)) return setErr('Choose a start date before the end date, no more than a year apart.')
    setPreset('custom'); setRange(r)
  }

  const P = ov?.period ?? {}, Q = ov?.queues ?? {}
  const group = (title: string, items: [string, string, string?][]) => (
    <section className="rounded-lg border border-border bg-card p-3" aria-label={title}>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(([k, v, note]) => (
          <div key={k} className="rounded border border-border p-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-bold text-foreground">{v}</dd>{note && <dd className="text-xs text-muted-foreground">{note}</dd>}</div>
        ))}
      </dl>
    </section>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {(['7', '30', '90'] as RangePreset[]).map((p) => (
          <button key={p} onClick={() => pickPreset(p)} aria-pressed={preset === p} className={`${btn} ${preset === p ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>Last {p} days</button>
        ))}
        <label className="text-xs">From<input type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} className={field} /></label>
        <label className="text-xs">To<input type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} className={field} /></label>
        <button onClick={applyCustom} className={btnPlain}>Apply dates</button>
      </div>
      <p className="text-xs text-muted-foreground">Showing {when(range.from)} to {when(range.to)}. Backlog numbers are right now; everything else is for this period. Every number is counted from saved records.</p>
      {err && <Notice ok={false}>{err}</Notice>}
      {loading || !ov ? <Loader2 className="animate-spin" aria-label="Loading" /> : (
        <>
          {group('Backlog right now', [
            ['Listings awaiting authority review', countText(Q.authority_pending ?? null), ov.oldestAuthorityWaitDays === null ? undefined : `Oldest has waited ${formatDuration(ov.oldestAuthorityWaitDays * 24)}`],
            ['Documents awaiting a review decision', countText(Q.docs_unreviewed ?? null)],
            ['Inspections to review', countText(Q.inspections_pending ?? null)],
            ['Landlord identity checks waiting', countText(Q.identity_pending ?? null)],
          ])}
          {group('Authority review time', [
            ['Average time to a decision', formatDuration(ov.authorityAvgHours), ov.authorityAvgSample > 0 ? `Based on ${ov.authorityAvgSample} decision${ov.authorityAvgSample === 1 ? '' : 's'}` : 'No decisions in this period'],
          ])}
          {group('Reviews completed', [
            ['Authority accepted', countText(P.authority_accepted ?? null)],
            ['Authority rejected', countText(P.authority_rejected ?? null)],
            ['Authority: more evidence asked for', countText(P.authority_needs_evidence ?? null)],
            ['Inspections approved', countText(P.inspections_approved ?? null)],
            ['Inspections rejected or sent back', countText(P.inspections_rejected ?? null)],
            ['Requests for more evidence, all workflows', countText(P.evidence_requests_sent ?? null), 'Authority, risk alerts and investigations'],
          ])}
          {group('Risk alerts', [
            ['Raised', countText(P.risk_raised ?? null)],
            ['Resolved', countText(P.risk_resolved ?? null)],
            ['Resolved as false positive', ratioText(P.risk_false_positive ?? null, P.risk_resolved ?? null), 'Out of alerts resolved in this period'],
            ['Open at "Investigate" or higher now', countText(Q.risk_open ?? null)],
          ])}
          {group('Investigations', [
            ['Opened', countText(P.cases_opened ?? null)],
            ['Closed', countText(P.cases_closed ?? null)],
            ['Open now', countText(Q.cases_open ?? null)],
            ['Escalated now', countText(Q.cases_escalated ?? null)],
          ])}
          <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">Identity review time is not shown. Identity decisions are not time-stamped anywhere this report can read, so any figure would be invented.</p>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- who decides what + permissions
function RulesTab({ access, onChanged }: { access: Access | null; onChanged: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const toggle = async () => {
    if (!access) return
    const next = !access.enforced
    if (!window.confirm(next ? 'Turn the role requirement ON? Only reviewers and super admins will be able to work on investigation cases.' : 'Turn the role requirement OFF? Every administrator will be able to work on investigation cases again.')) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('admin_trust_set_enforcement', { p_on: next, p_reason: reason.trim() })
    setBusy(false)
    if (error) return setMsg({ ok: false, t: friendlyTrustError(error.message) })
    setReason(''); setMsg({ ok: true, t: next ? 'Role requirement is on.' : 'Role requirement is off.' }); onChanged()
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="own-h" className="space-y-2">
        <h2 id="own-h" className="font-semibold text-foreground">Each decision has one owner</h2>
        <p className="text-xs text-muted-foreground">If a decision is made in the wrong place, it overwrites someone else's work. This is the rule the system follows.</p>
        <ul className="space-y-2">
          {DECISION_OWNERSHIP.map((o) => (
            <li key={o.decision} className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="font-semibold text-foreground">{o.decision}</p>
              <p className="text-muted-foreground">{o.owner} · <Link href={o.href} className="underline">{o.where}</Link></p>
              <p className="mt-1 text-xs text-muted-foreground">{o.doesNot}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="perm-h" className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
        <h2 id="perm-h" className="font-semibold text-foreground">Who can work on investigation cases</h2>
        {!access ? <Loader2 className="animate-spin" aria-label="Loading" /> : (
          <>
            <p className="text-muted-foreground">
              {access.enforced
                ? 'The role requirement is ON. Only staff with the reviewer or super admin role can open, assign, escalate or close cases.'
                : 'The role requirement is OFF. Every administrator can work on cases, as before. Everyone can still read them.'}
            </p>
            <p className="text-xs text-muted-foreground">You: {access.can_case ? 'can work on cases' : 'cannot work on cases'}{access.is_super ? ' (super admin)' : ''}. The database checks this on every action, so hiding a button is never the only protection.</p>
            {access.is_super ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Before turning it on, check on the Staff Roles page that every person who should work cases has the reviewer or super admin role.</p>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change" maxLength={300} className={field} aria-label="Reason for the change" />
                {msg && <Notice ok={msg.ok}>{msg.t}</Notice>}
                <button disabled={busy || reason.trim().length < 5} onClick={toggle} className={btnPlain}>{access.enforced ? 'Turn the role requirement off' : 'Turn the role requirement on'}</button>
              </div>
            ) : <p className="text-xs text-muted-foreground">Only a super admin can change this. Roles are managed on the <Link href="/admin/staff-roles" className="underline">Staff Roles</Link> page.</p>}
          </>
        )}
      </section>
    </div>
  )
        }
