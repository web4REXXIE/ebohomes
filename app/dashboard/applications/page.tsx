'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { ApplicantFacts, ApplicationStatusBadge } from '@/components/application-ui'

// Landlord view of applications for the landlord's OWN properties.
// EboHomes makes every decision. The landlord can only add a recommendation while the application is still open.
// The database trigger enforce_application_rules is the real gate: it rejects any other change by a landlord.

type AppRow = {
  id: string
  case_ref: string | null
  status: string
  created_at: string
  listing_id: string
  message: string | null
  application_data: unknown
  landlord_recommendation: string | null
  landlord_recommendation_note: string | null
  landlord_recommended_at: string | null
}

const OPEN = ['pending', 'info_requested']

const CHOICES: { value: string; label: string }[] = [
  { value: 'recommend', label: 'I recommend this applicant' },
  { value: 'neutral', label: 'I have no preference' },
  { value: 'not_recommend', label: 'I do not recommend this applicant' },
]

const CHOICE_LABEL: Record<string, string> = {
  recommend: 'You recommended this applicant',
  neutral: 'You said you have no preference',
  not_recommend: 'You did not recommend this applicant',
}

const MAX_NOTE = 500

function fmt(d: string | null) {
  if (!d) return ''
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-NG')
}

export default function LandlordApplicationsPage() {
  const [apps, setApps] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const { data, error: e } = await supabase
      .from('applications')
      .select(
        'id, case_ref, status, created_at, listing_id, message, application_data, landlord_recommendation, landlord_recommendation_note, landlord_recommended_at'
      )
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (e) {
      setError('Could not load applications. Please refresh and try again.')
      setLoading(false)
      return
    }
    const rows = (data ?? []) as AppRow[]
    setApps(rows)
    // Start each form from what the landlord already saved.
    setChoice(Object.fromEntries(rows.map((r) => [r.id, r.landlord_recommendation ?? ''])))
    setNote(Object.fromEntries(rows.map((r) => [r.id, r.landlord_recommendation_note ?? ''])))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { listings, inspected } = usePropertyData(useMemo(() => apps.map((a) => a.listing_id), [apps]))

  const open = useMemo(() => apps.filter((a) => OPEN.includes(a.status)), [apps])
  const closed = useMemo(() => apps.filter((a) => !OPEN.includes(a.status)), [apps])
  const waiting = open.filter((a) => !a.landlord_recommendation).length

  const save = async (a: AppRow) => {
    if (busyId) return
    const picked = choice[a.id] ?? ''
    if (!CHOICES.some((c) => c.value === picked)) {
      setError('Choose one option first.')
      setNotice('')
      return
    }
    const text = (note[a.id] ?? '').trim()
    if (text.length > MAX_NOTE) {
      setError(`Keep your note under ${MAX_NOTE} characters.`)
      setNotice('')
      return
    }
    setBusyId(a.id)
    setError('')
    setNotice('')
    // Only the two recommendation columns are sent. Status is never touched from this page.
    const { data, error: e } = await supabase
      .from('applications')
      .update({ landlord_recommendation: picked, landlord_recommendation_note: text || null })
      .eq('id', a.id)
      .in('status', OPEN)
      .select('id')
    if (e) {
      setError(e.message || 'Could not save your recommendation.')
    } else if (!data || data.length === 0) {
      setError('This application has already been decided by EboHomes, so it can no longer be changed.')
    } else {
      setNotice('Your recommendation was saved. EboHomes will make the final decision.')
    }
    setBusyId(null)
    await load()
  }

  const card = (a: AppRow, isOpen: boolean) => {
    const rec = a.landlord_recommendation
    return (
      <li key={a.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ApplicationStatusBadge status={a.status} />
          <span className="text-xs text-muted-foreground">
            {a.case_ref ? `${a.case_ref} · ` : ''}Applied {fmt(a.created_at)}
          </span>
        </div>

        <PropertySummary compact listing={listings[a.listing_id]} inspected={inspected.has(a.listing_id)} />

        <ApplicantFacts data={a.application_data} />
        {a.message && <p className="rounded-md bg-secondary p-3 text-sm text-foreground">{a.message}</p>}

        {rec && (
          <p className="rounded-md border border-border bg-secondary/60 p-3 text-sm">
            <span className="font-semibold">{CHOICE_LABEL[rec] ?? 'Recommendation saved'}.</span>
            {a.landlord_recommendation_note ? ` ${a.landlord_recommendation_note}` : ''}
            {a.landlord_recommended_at && (
              <span className="mt-1 block text-xs text-muted-foreground">Added {fmt(a.landlord_recommended_at)}</span>
            )}
          </p>
        )}

        {isOpen ? (
          <fieldset disabled={busyId === a.id} className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-foreground">
              {rec ? 'Change your recommendation' : 'Add your recommendation (optional)'}
            </legend>
            <div className="space-y-1.5">
              {CHOICES.map((c) => (
                <label key={c.value} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`rec-${a.id}`}
                    value={c.value}
                    checked={(choice[a.id] ?? '') === c.value}
                    onChange={() => setChoice((p) => ({ ...p, [a.id]: c.value }))}
                    className="h-4 w-4"
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <textarea
              rows={2}
              maxLength={MAX_NOTE}
              aria-label="Short note for EboHomes (optional)"
              placeholder="Short note for EboHomes (optional)"
              value={note[a.id] ?? ''}
              onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void save(a)}
              disabled={busyId === a.id || !(choice[a.id] ?? '')}
              className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busyId === a.id ? 'Saving…' : 'Save recommendation'}
            </button>
            <p className="text-xs text-muted-foreground">
              This is only advice. EboHomes approves or declines every application and tells the tenant.
            </p>
          </fieldset>
        ) : (
          <p className="text-xs text-muted-foreground">
            {a.status === 'approved'
              ? 'EboHomes approved this application. Approval does not reserve the property or create a tenancy. Set up the tenancy from Tenancies.'
              : 'This application is closed.'}
          </p>
        )}
      </li>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground">Applications</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Tenants who applied for your properties. EboHomes makes the final decision on every application. You can add a
        recommendation to help.
        {!loading && waiting > 0 && (
          <span className="mt-1 block font-semibold text-amber-900">
            {waiting} {waiting === 1 ? 'application is' : 'applications are'} waiting for your recommendation.
          </span>
        )}
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading applications">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-secondary" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No one has applied for your properties yet.
        </div>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Open ({open.length})</h2>
          {open.length === 0 ? (
            <p className="mb-6 text-sm text-muted-foreground">Nothing is waiting right now.</p>
          ) : (
            <ul className="mb-6 space-y-4">{open.map((a) => card(a, true))}</ul>
          )}

          {closed.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="mb-3 min-h-11 text-sm font-semibold text-primary hover:underline"
              >
                {showAll ? 'Hide' : 'Show'} decided and closed applications ({closed.length})
              </button>
              {showAll && <ul className="space-y-4">{closed.map((a) => card(a, false))}</ul>}
            </>
          )}
        </>
      )}
    </main>
  )
}