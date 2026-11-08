'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { ApplicantFacts, ApplicationStatusBadge } from '@/components/application-ui'
import { ApplicationDocuments } from '@/components/application-documents'
import { RentalOfferPanel } from '@/components/rental-offer-panel'
import { ToneChip } from '@/components/dashboard-ui'

// Landlord view of applications for the landlord's OWN properties.
// EboHomes makes every decision. The landlord can only add a recommendation while the application is still open.
// The database trigger enforce_application_rules is the real gate: it rejects any other change by a landlord.
// Stage 16 Part 2: presentation only. Queries, the update call and its filters are unchanged.
// New: tabs with counts, a retry button when loading fails, and a confirmation before "I do not recommend".

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
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const [loadFailed, setLoadFailed] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const goBackRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    setLoadFailed(false)
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
      setLoadFailed(true)
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

  // When the confirmation opens, focus goes to the safe choice (Go back).
  useEffect(() => {
    if (confirmId) goBackRef.current?.focus()
  }, [confirmId])

  const save = async (a: AppRow, confirmed = false) => {
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
    // A negative recommendation asks for one more tap. The request itself is unchanged.
    if (picked === 'not_recommend' && !confirmed) {
      setConfirmId(a.id)
      return
    }
    setConfirmId(null)
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
    const confirming = confirmId === a.id
    return (
      <li key={a.id} className="space-y-3 rounded-card border border-border bg-card p-4 shadow-rest">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ApplicationStatusBadge status={a.status} />
          <span className="text-xs text-muted-foreground">
            {a.case_ref ? `${a.case_ref} · ` : ''}Applied {fmt(a.created_at)}
          </span>
        </div>

        <PropertySummary compact listing={listings[a.listing_id]} inspected={inspected.has(a.listing_id)} />

        <ApplicantFacts data={a.application_data} />
        {a.message && <p className="rounded-md bg-secondary p-3 text-sm text-foreground">{a.message}</p>}

        {/* Phase 11.6: landlords see which document TYPES were provided. They never get the files. */}
        <ApplicationDocuments applicationId={a.id} mode="landlord" />

        {/* Phase 11.7: offers EboHomes prepared for this applicant. Shows nothing until an offer exists. */}
        <RentalOfferPanel applicationId={a.id} mode="landlord" />

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
                <label key={c.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name={`rec-${a.id}`}
                    value={c.value}
                    checked={(choice[a.id] ?? '') === c.value}
                    onChange={() => {
                      setChoice((p) => ({ ...p, [a.id]: c.value }))
                      if (confirmId === a.id) setConfirmId(null)
                    }}
                    className="h-5 w-5 shrink-0 accent-primary"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-right text-xs text-muted-foreground">
              {(note[a.id] ?? '').length}/{MAX_NOTE}
            </p>

            {confirming ? (
              <div role="group" aria-label="Confirm your recommendation" className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-3">
                <p className="text-sm font-semibold text-foreground">Tell EboHomes you do not recommend this applicant?</p>
                <p className="text-xs text-muted-foreground">
                  EboHomes still makes the final decision. You can change this while the application is open.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    ref={goBackRef}
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="focus-ring min-h-11 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground"
                  >
                    Go back
                  </button>
                  <button
                    type="button"
                    onClick={() => void save(a, true)}
                    className="focus-ring min-h-11 rounded-md bg-destructive px-4 text-sm font-semibold text-white"
                  >
                    Yes, save it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void save(a)}
                disabled={busyId === a.id || !(choice[a.id] ?? '')}
                className="focus-ring min-h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
              >
                {busyId === a.id ? 'Saving…' : 'Save recommendation'}
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              This is only advice. EboHomes approves or declines every application and tells the tenant.
            </p>
          </fieldset>
        ) : (
          <p className="text-xs text-muted-foreground">
            {a.status === 'approved'
              ? 'EboHomes approved this application. Approval does not reserve the property or create a tenancy. EboHomes sends the tenant a rental offer next. Set up the tenancy from Tenancies once they accept.'
              : a.status === 'accepted'
                ? 'The rental was completed with this applicant.'
                : a.status === 'not_selected'
                  ? 'Another applicant secured this property. This is not a rejection of this applicant.'
                  : a.status === 'rejected'
                    ? 'EboHomes declined this application.'
                    : a.status === 'withdrawn'
                      ? 'The applicant withdrew this application.'
                      : 'This application is closed.'}
          </p>
        )}
      </li>
    )
  }

  const shown = tab === 'open' ? open : closed

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground">Applications</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Tenants who applied for your properties. EboHomes makes the final decision on every application. You can add a
        recommendation to help.
      </p>

      {!loading && !loadFailed && waiting > 0 && (
        <p role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-warning/30 bg-warning-soft p-3 text-sm font-semibold text-foreground">
          <ToneChip tone="amber">Action needed</ToneChip>
          {waiting} {waiting === 1 ? 'application is' : 'applications are'} waiting for your recommendation.
        </p>
      )}

      {error && (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger">
          <span>{error}</span>
          {loadFailed && (
            <button
              type="button"
              onClick={() => { setLoading(true); setError(''); void load() }}
              className="focus-ring min-h-11 rounded-md border border-danger/40 px-4 font-semibold"
            >
              Try again
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-md border border-success/30 bg-success-soft p-3 text-sm font-medium text-foreground">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading applications">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-card border border-border bg-secondary" />
          ))}
        </div>
      ) : loadFailed && apps.length === 0 ? null : apps.length === 0 ? (
        <div className="rounded-card border border-dashed border-border py-14 text-center">
          <p className="text-sm font-semibold text-foreground">No applications yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            When a tenant applies for one of your properties, it appears here.
          </p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Application groups" className="mb-4 flex gap-2">
            {([
              ['open', 'Open', open.length],
              ['closed', 'Decided and closed', closed.length],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`apps-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="apps-panel"
                onClick={() => setTab(key)}
                className={`focus-ring min-h-11 flex-1 rounded-lg border px-3 text-sm font-semibold sm:flex-none ${
                  tab === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          <div id="apps-panel" role="tabpanel" aria-labelledby={`apps-tab-${tab}`}>
            {shown.length === 0 ? (
              <p className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {tab === 'open' ? 'Nothing is waiting right now.' : 'No decided or closed applications yet.'}
              </p>
            ) : (
              <ul className="space-y-4">{shown.map((a) => card(a, tab === 'open'))}</ul>
            )}
          </div>
        </>
      )}
    </main>
  )
}
