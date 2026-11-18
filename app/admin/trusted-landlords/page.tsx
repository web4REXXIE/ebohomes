'use client'

import { useState } from 'react'
import { Loader2, Search, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useConfirm } from '@/components/confirm-dialog'
import { TrustedBadge } from '@/components/trusted-badge'

// Idea 16, admin side. Trusted is calculated by the database. This page does two things only:
//   1. shows why a landlord is or is not Trusted
//   2. lets an admin record an upheld finding (the label goes away) or lift one (with a note)
// An open dispute only pauses the label. It is not a finding. All checks are in the database functions.

type Landlord = { id: string; full_name: string | null }
type Finding = { id: string; source: string; source_id: string | null; note: string; created_at: string; lifted_at: string | null; lift_note: string | null }
type Summary = { completed: number; needed: number; blocker: string | null; trusted: boolean; findings: Finding[] }
type HandoverRow = { id: string; tenancy_code: string | null; status: string; completed_via: string | null; created_at: string }
type DisputeRow = { id: string; tenancy_code: string | null; category: string; status: string; created_at: string }
type Cases = { handovers: HandoverRow[]; disputes: DisputeRow[] }

const NOTE_MIN = 20
const NOTE_MAX = 1000

function day(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusLine(s: Summary) {
  if (s.trusted) return 'Trusted. The label is showing to tenants.'
  if (s.blocker === 'upheld_finding') return 'Not Trusted. An upheld finding is on record.'
  if (s.blocker === 'open_dispute') return 'Paused. A dispute against this landlord is still open.'
  return `Not Trusted yet. ${s.completed} of ${s.needed} completed handovers (both sides confirmed).`
}

export default function TrustedLandlordsPage() {
  const { confirm, dialog } = useConfirm()
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Landlord[] | null>(null)
  const [selected, setSelected] = useState<Landlord | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [cases, setCases] = useState<Cases>({ handovers: [], disputes: [] })
  const [loadingOne, setLoadingOne] = useState(false)
  const [caseKey, setCaseKey] = useState('none')
  const [note, setNote] = useState('')
  const [liftNote, setLiftNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const search = async () => {
    const term = q.replace(/[%_,()]/g, ' ').trim()
    setMsg(null)
    if (term.length < 2) {
      setMsg({ ok: false, text: 'Type at least 2 letters of the landlord\'s name.' })
      return
    }
    setSearching(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'landlord')
      .ilike('full_name', `%${term}%`)
      .limit(10)
    setSearching(false)
    if (error) {
      setMsg({ ok: false, text: 'Could not search. Try again.' })
      return
    }
    setResults((data ?? []) as Landlord[])
  }

  const open = async (l: Landlord) => {
    setSelected(l)
    setSummary(null)
    setCases({ handovers: [], disputes: [] })
    setCaseKey('none')
    setNote('')
    setLiftNote({})
    setMsg(null)
    setLoadingOne(true)
    const [s, c] = await Promise.all([
      supabase.rpc('eb_admin_landlord_trust', { p_landlord: l.id }),
      supabase.rpc('eb_admin_landlord_cases', { p_landlord: l.id }),
    ])
    setLoadingOne(false)
    if (s.error) {
      setMsg({ ok: false, text: s.error.message })
      return
    }
    setSummary(s.data as Summary)
    if (!c.error && c.data) setCases(c.data as Cases)
  }

  const reload = async () => {
    if (selected) await open(selected)
  }

  const record = async () => {
    if (!selected) return
    const text = note.trim()
    if (text.length < NOTE_MIN || text.length > NOTE_MAX) {
      setMsg({ ok: false, text: `Write a note of ${NOTE_MIN} to ${NOTE_MAX} characters.` })
      return
    }
    const [source, id] = caseKey === 'none' ? ['other', null] : (caseKey.split(':') as [string, string])
    const ok = await confirm({
      title: 'Record an upheld finding?',
      message: `This removes the Trusted label from ${selected.full_name ?? 'this landlord'} straight away. It stays off until you lift the finding. Only record this when EboHomes has decided the problem was real.`,
      confirmLabel: 'Record finding',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('eb_admin_record_upheld_finding', {
      p_landlord: selected.id,
      p_source: source,
      p_source_id: id,
      p_note: text,
    })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }
    setMsg({ ok: true, text: 'Finding recorded. The Trusted label is off.' })
    await reload()
  }

  const lift = async (f: Finding) => {
    const text = (liftNote[f.id] ?? '').trim()
    if (text.length < NOTE_MIN || text.length > NOTE_MAX) {
      setMsg({ ok: false, text: `Write a note of ${NOTE_MIN} to ${NOTE_MAX} characters to lift a finding.` })
      return
    }
    const ok = await confirm({
      title: 'Lift this finding?',
      message: 'The finding stays on record but stops counting. The landlord can become Trusted again if nothing else blocks it.',
      confirmLabel: 'Lift finding',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('eb_admin_lift_upheld_finding', { p_finding: f.id, p_note: text })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }
    setMsg({ ok: true, text: 'Finding lifted.' })
    await reload()
  }

  const active = summary?.findings.filter((f) => !f.lifted_at) ?? []
  const past = summary?.findings.filter((f) => f.lifted_at) ?? []

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-foreground">
        <ShieldCheck size={20} className="text-primary" aria-hidden /> Trusted landlords
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        A landlord earns Trusted from completed rentals where both sides confirmed the key handover. It is calculated by the
        system and cannot be switched on here. You can only record or lift an upheld finding.
      </p>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Landlord name"
          aria-label="Landlord name"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-input px-3 text-sm"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {searching ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />} Search
        </button>
      </div>

      {msg && (
        <p role="status" className={`mt-3 text-sm ${msg.ok ? 'text-success' : 'text-destructive'}`}>
          {msg.text}
        </p>
      )}

      {results && results.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No landlord found with that name.</p>}
      {results && results.length > 0 && (
        <ul className="mt-3 space-y-2">
          {results.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => open(l)}
                className={`focus-ring min-h-11 w-full rounded-md border px-3 text-left text-sm font-medium ${
                  selected?.id === l.id ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                {l.full_name ?? 'Unnamed landlord'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
            {selected.full_name ?? 'Unnamed landlord'} {summary?.trusted && <TrustedBadge />}
          </h2>
          {loadingOne && <Loader2 className="mt-3 animate-spin text-primary" size={22} aria-label="Loading" />}

          {summary && (
            <>
              <p className="mt-2 text-sm text-foreground">{statusLine(summary)}</p>

              <h3 className="mt-5 text-sm font-semibold text-foreground">Findings on record</h3>
              {summary.findings.length === 0 && <p className="mt-1 text-sm text-muted-foreground">None.</p>}
              <ul className="mt-2 space-y-3">
                {active.map((f) => (
                  <li key={f.id} className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Recorded {day(f.created_at)} · {f.source}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{f.note}</p>
                    <label className="mt-3 block text-xs font-semibold text-muted-foreground" htmlFor={`lift-${f.id}`}>
                      Why lift it? ({NOTE_MIN}+ characters)
                    </label>
                    <textarea
                      id={`lift-${f.id}`}
                      value={liftNote[f.id] ?? ''}
                      onChange={(e) => setLiftNote((p) => ({ ...p, [f.id]: e.target.value }))}
                      rows={2}
                      maxLength={NOTE_MAX}
                      className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => lift(f)}
                      disabled={busy}
                      className="focus-ring mt-2 min-h-11 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:opacity-60"
                    >
                      Lift finding
                    </button>
                  </li>
                ))}
                {past.map((f) => (
                  <li key={f.id} className="rounded-md border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Lifted {day(f.lifted_at)} · recorded {day(f.created_at)} · {f.source}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{f.note}</p>
                    {f.lift_note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">Lifted because: {f.lift_note}</p>}
                  </li>
                ))}
              </ul>

              <h3 className="mt-6 text-sm font-semibold text-foreground">Record an upheld finding</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Only after EboHomes has decided the problem was real. An open dispute does not need this: it pauses the label on its own.
              </p>
              <label className="mt-3 block text-xs font-semibold text-muted-foreground" htmlFor="case-pick">Related record</label>
              <select
                id="case-pick"
                value={caseKey}
                onChange={(e) => setCaseKey(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-border bg-input px-2 text-sm"
              >
                <option value="none">Not linked to a handover or dispute</option>
                {cases.handovers.map((h) => (
                  <option key={h.id} value={`handover:${h.id}`}>
                    Handover {h.tenancy_code ?? ''} · {h.status}{h.completed_via ? ` (${h.completed_via})` : ''} · {day(h.created_at)}
                  </option>
                ))}
                {cases.disputes.map((d) => (
                  <option key={d.id} value={`dispute:${d.id}`}>
                    Dispute {d.tenancy_code ?? ''} · {d.category} · {d.status} · {day(d.created_at)}
                  </option>
                ))}
              </select>
              <label className="mt-3 block text-xs font-semibold text-muted-foreground" htmlFor="finding-note">
                What was decided? ({NOTE_MIN}+ characters)
              </label>
              <textarea
                id="finding-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={NOTE_MAX}
                className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={record}
                disabled={busy}
                className="focus-ring mt-3 min-h-11 rounded-md bg-destructive px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? 'Saving...' : 'Record upheld finding'}
              </button>
            </>
          )}
        </section>
      )}
      {dialog}
    </div>
  )
}
