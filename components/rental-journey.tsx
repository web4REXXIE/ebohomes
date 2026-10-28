'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDown, ArrowLeft, ArrowRight, CalendarClock, Check, CheckCircle2, Eye, Info, Loader2, Lock,
  MessageCircle, Receipt, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PayOnlinePanel } from '@/components/pay-online-panel'
import { TenancyHub } from '@/components/tenancy-hub'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { ApplicantFacts, ApplicationStatusBadge } from '@/components/application-ui'
import { listingIsLive } from '@/lib/property-display'
import { fmtDate, fmtDateTime, naira, toIso } from '@/lib/case-status'
import { getPaymentState, paymentLabel } from '@/lib/payment-status'
import { OPEN_STATUSES, TONE_CLASS, normaliseNgPhone, tenantPanel, viewingLabel, viewingTone, type Tone } from '@/lib/viewing-status'
import {
  NO_RESERVATION_NOTICE, STEP_ORDER, STEP_TITLE, buildJourney, lockedReason, pickTenancy, showsNoReservationNotice, statusPanel,
  type JourneyStep, type StepKey,
} from '@/lib/rental-journey'
import { TenancyChecklist } from '@/components/tenancy-checklist'
import { getPaymentState, isVerified, paymentLabel } from '@/lib/payment-status'

const INTRO_KEY = 'ebohomes_journey_intro_v1'
const LIVE_TERMS = ['proposed', 'accepted', 'signed']
const btnP = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const field = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm'
const TOP: Record<Tone, string> = {
  green: 'border-t-emerald-600', blue: 'border-t-blue-600', amber: 'border-t-amber-500', red: 'border-t-red-600', grey: 'border-t-slate-400',
}
const PAY_TONE: Record<string, string> = {
  verified: TONE_CLASS.green, legacy_confirmed: TONE_CLASS.amber, awaiting_verification: TONE_CLASS.amber,
  pending: TONE_CLASS.grey, rejected: TONE_CLASS.red, other: TONE_CLASS.grey,
}

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-NG') : null)

// Some viewing text is stored in capitals. Same helper idea as the Viewings page.
function tidy(s: string | null | undefined): string {
  if (!s) return ''
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s
  const lower = s.toLowerCase().replace(/ebohomes/g, 'EboHomes')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const smooth = (): ScrollBehavior => (reduceMotion() ? 'auto' : 'smooth')

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[tone]}`}>{children}</span>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

export function RentalJourney({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadState, setLoadState] = useState<'ok' | 'error' | 'notfound'>('ok')
  const [warn, setWarn] = useState('')
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [app, setApp] = useState<any>(null)
  const [extra, setExtra] = useState<{ decided_at?: string | null; application_data?: unknown }>({})
  const [viewings, setViewings] = useState<any[]>([])
  const [tenancyRow, setTenancyRow] = useState<any>(null)
  const [terms, setTerms] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [renewalOffered, setRenewalOffered] = useState(false)
  const [waitlisted, setWaitlisted] = useState(false)
  const [renewalOffer, setRenewalOffer] = useState<any>(null)
  // Set only when the saved data moves the journey forward after an action.
  const [unlocked, setUnlocked] = useState<{ from: StepKey; to: StepKey } | null>(null)
  const prevKey = useRef<StepKey | null>(null)

  const [picked, setPicked] = useState<StepKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [reply, setReply] = useState('')
  const [ready, setReady] = useState(false)
  const [note, setNote] = useState('')
  const [intro, setIntro] = useState(false)
  // Request-a-viewing form (same fields and database function as the Viewings page).
  const [reqWhen, setReqWhen] = useState('')
  const [reqPhone, setReqPhone] = useState<string | null>(null)
  const [reqNote, setReqNote] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  // The tenancy records panel (handover, repairs, disputes, deposit) loads only when the tenant opens it.
  const [hubOpen, setHubOpen] = useState(false)

  const topRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLHeadingElement>(null)
  const msgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { if (!window.localStorage.getItem(INTRO_KEY)) setIntro(true) } catch { /* storage unavailable: show nothing */ }
  }, [])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return
      const { data } = await supabase.from('profiles').select('phone').eq('id', uid).maybeSingle()
      if (alive) setProfilePhone((data as any)?.phone ?? '')
    })()
    return () => { alive = false }
  }, [])
  // Arriving straight from the Apply form: show the success card once, then clean the address.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('submitted') === '1') {
        setJustSubmitted(true)
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch { /* ignore */ }
  }, [])
  const dismissIntro = () => {
    setIntro(false)
    try { window.localStorage.setItem(INTRO_KEY, '1') } catch { /* ignore */ }
  }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push(`/login?redirect=/journey/${applicationId}`); return }

    const { data: a, error: ae } = await supabase
      .from('applications')
      .select('id, status, message, created_at, listing_id, info_request, tenant_reply, decision_note, tenant_interest_at, tenant_inspected, case_ref')
      .eq('id', applicationId)
      .eq('tenant_id', user.id)
      .maybeSingle()
    if (ae) { console.error('Journey: application load failed:', ae.message); setLoadState('error'); setLoading(false); return }
    if (!a) { setLoadState('notfound'); setLoading(false); return }
    setApp(a)
    setLoadState('ok')

    // Optional extras. If this query is refused, the journey still works without them.
    const ex = await supabase.from('applications').select('decided_at, application_data').eq('id', applicationId).maybeSingle()
    setExtra(ex.error || !ex.data ? {} : (ex.data as any))

    const [vw, tn] = await Promise.all([
      supabase.from('viewings').select('*').eq('application_id', applicationId).order('created_at', { ascending: false }),
      supabase.from('tenancies').select('id, application_id, status').eq('application_id', applicationId),
    ])
    const problems: string[] = []
    if (vw.error) problems.push('viewings')
    if (tn.error) problems.push('tenancy')
    setViewings(vw.data ?? [])

    const lite = pickTenancy((tn.data ?? []) as any[])
    if (!lite) {
      setTenancyRow(null); setTerms([]); setPayments([]); setRenewalOffered(false); setRenewalOffer(null)
      // Waiting list: the database tells us (yes/no only) whether another applicant already has an agreed tenancy here.
      // If the function is not installed yet or fails, we show nothing different rather than guess.
      if (a.status === 'approved') {
        const w = await supabase.rpc('eb_my_application_waiting', { p_application: applicationId })
        setWaitlisted(!w.error && w.data === true)
      } else setWaitlisted(false)
    } else {
      setWaitlisted(false)
      const [mine, rt, pay, ren] = await Promise.all([
        supabase.rpc('my_tenancies', { p_as: 'tenant' }),
        supabase.from('rental_terms').select('*').eq('tenancy_id', lite.id).order('version', { ascending: false }),
        supabase.from('payments').select('id, tenancy_id, amount, type, status, receipt_code, created_at, verified_by, review_note').eq('tenancy_id', lite.id).order('created_at', { ascending: false }),
        supabase.from('renewals').select('id, status, new_rent, new_end_date, terms').eq('tenancy_id', lite.id).eq('status', 'offered').order('created_at', { ascending: false }),
      ])
      const full = (mine.data ?? []).find((x: any) => x && x.id === lite.id)
      if (mine.error || !full) problems.push('tenancy details')
      setTenancyRow({ ...lite, ...(full ?? {}) })
      if (rt.error) problems.push('rental terms')
      if (pay.error) problems.push('payments')
      setTerms(rt.data ?? [])
      setPayments(pay.data ?? [])
      setRenewalOffered(!ren.error && (ren.data ?? []).length > 0)
      setRenewalOffer(!ren.error && (ren.data ?? []).length > 0 ? (ren.data as any[])[0] : null)
    }
    setWarn(problems.length ? `Some information could not load (${problems.join(', ')}). What you see may be incomplete. Please refresh the page.` : '')
    setLoading(false)
  }, [applicationId, router])

  useEffect(() => { load() }, [load])

  const { listings, inspected } = usePropertyData(useMemo(() => (app ? [app.listing_id] : []), [app]))
  const listing = app ? listings[app.listing_id] : undefined
  const listingOpen = listingIsLive(listing?.status)
  const liveTerms = terms.find((x) => LIVE_TERMS.includes(x.status)) ?? null

  const journey = useMemo(() => {
    if (!app) return null
       return buildJourney({
      app,
      viewings,
      tenancy: tenancyRow ? { id: tenancyRow.id, status: tenancyRow.status } : null,
      terms: liveTerms,
      waitlisted,
      paymentVerified: payments.some((p) => isVerified(p)),
    })
  }, [app, viewings, tenancyRow, liveTerms, waitlisted, payments])

  // The first load never shows a banner. After that, a banner appears only when the journey really moved to a later stage.
  useEffect(() => {
    const cur = journey?.currentKey ?? null
    const prev = prevKey.current
    prevKey.current = cur
    if (cur && prev && cur !== prev && STEP_ORDER.indexOf(cur) > STEP_ORDER.indexOf(prev)) {
      setUnlocked({ from: prev, to: cur })
      setPicked(null)
    }
  }, [journey?.currentKey])

  const selected: StepKey = picked ?? journey?.currentKey ?? 'application'

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    requestAnimationFrame(() => msgRef.current?.scrollIntoView({ behavior: smooth(), block: 'center' }))
  }

  const selectStep = (key: StepKey) => {
    setPicked(key)
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: smooth(), block: 'start' })
      detailRef.current?.focus({ preventScroll: true })
    })
  }
  const toOverview = () => topRef.current?.scrollIntoView({ behavior: smooth(), block: 'start' })

  // Existing database functions only. The success message is shown only after the database accepts the action.
  const rpc = async (fn: string, args: Record<string, any>, ok: string, confirmText?: string): Promise<boolean> => {
    if (busy) return false
    if (confirmText && !window.confirm(confirmText)) return false
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { flash(error.message, false); return false }
    flash(ok, true)
    await load()
    return true
  }

  // Same guarded update the My Applications page uses.
  const updateApp = async (patch: Record<string, any>, ok: string, onlyWhen: string[]): Promise<boolean> => {
    if (busy) return false
    setBusy(true); setMsg(null)
    const { data, error } = await supabase
      .from('applications')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', applicationId)
      .in('status', onlyWhen)
      .select('id')
    setBusy(false)
    let saved = false
    if (error) flash(error.message, false)
    else if (!data || data.length === 0) flash('That change could not be saved because the application has changed. The page has been refreshed.', false)
    else { flash(ok, true); saved = true }
    await load()
    return saved
  }

  // Same guarded update the Tenancies page uses. It only changes an offer that is still "offered".
  const respondRenewal = async (id: string, status: 'accepted' | 'declined'): Promise<boolean> => {
    if (busy) return false
    const verb = status === 'accepted' ? 'accept' : 'decline'
    if (!window.confirm(`Are you sure you want to ${verb} this renewal offer? No payment is taken.`)) return false
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.from('renewals').update({ status }).eq('id', id).eq('status', 'offered').select('id')
    setBusy(false)
    let saved = false
    if (error) flash(error.message, false)
    else if (!data || data.length === 0) flash('This offer could not be updated. It may already have been answered.', false)
    else {
      flash(status === 'accepted' ? 'You accepted the renewal offer. This records your response only. No payment has been charged.' : 'You declined the renewal offer.', true)
      saved = true
    }
    await load()
    return saved
  }

  const submitViewing = async () => {
    const ph = reqPhone ?? profilePhone
    const iso = toIso(reqWhen)
    if (!iso || !normaliseNgPhone(ph)) return
    const ok = await rpc(
      'request_viewing',
      { p_application: applicationId, p_preferred: iso, p_note: reqNote.trim() || null, p_phone: ph },
      'Viewing requested. EboHomes has received it and will confirm the appointment right here on this page.',
    )
    if (ok) { setReqWhen(''); setReqNote('') }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading your rental journey">
        <div className="h-5 w-40 animate-pulse rounded bg-secondary" />
        <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-48 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    )
  }
  if (loadState !== 'ok' || !app || !journey) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-16 text-center">
        <p className="font-semibold text-foreground">{loadState === 'error' ? 'We could not load your rental journey' : 'Application not found'}</p>
        <p className="text-sm text-muted-foreground">
          {loadState === 'error'
            ? 'This is usually temporary. Please try again.'
            : 'We could not find this application on your account. The link may belong to a different account. If you are signed in with another account, sign out and sign in with the right one.'}
        </p>
        <div className="flex justify-center gap-2">
          {loadState === 'error' && <button className={btnP} onClick={() => { setLoading(true); load() }}>Try again</button>}
          <Link href="/journey?all=1" className={btnS}>Back to my journeys</Link>
        </div>
      </div>
    )
  }

  // The full viewing row (the journey helper only keeps the fields it needs).
  const v: any = journey.viewing ? (viewings.find((x) => x.id === journey.viewing!.id) ?? null) : null
  const tenancyStatus: string | null = tenancyRow?.status ?? null
  const panel = statusPanel(journey.phase, {
    submittedOn: day(app.created_at), decidedOn: day(extra.decided_at), interestOn: day(app.tenant_interest_at),
    viewingWhen: v ? fmtDateTime(v.scheduled_for ?? v.proposed_at) : null, viewingStatus: v?.status ?? null,
    tenancyId: tenancyRow?.id ?? null, tenancyStatus, listingId: app.listing_id, listingOpen,
    appStatus: app.status, renewalOffered,
  })
  const selStep = journey.steps.find((s) => s.key === selected)!
  const selIndex = STEP_ORDER.indexOf(selected)
  const locked = lockedReason(journey, selected)
  const appOpen = app.status === 'pending' || app.status === 'info_requested'

  // ---------- pieces ----------

  const messagesHref = `/messages?${new URLSearchParams({ new: '1', category: 'application', application: app.id, listing: app.listing_id, subject: `Application: ${String(app.case_ref ?? 'my application').slice(0, 90)}` }).toString()}`

  const renderTenancyFacts = () => {
    if (!tenancyRow) return null
    const signed = liveTerms?.status === 'signed'
    return (
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-secondary/60 p-3 sm:grid-cols-3">
          <Row label="Tenancy reference">{tenancyRow.tenancy_code ?? '—'}</Row>
          <Row label="Tenancy status"><span className="capitalize">{tenancyStatus ?? '—'}</span></Row>
          <Row label="Landlord">{tenancyRow.other_party ?? '—'}</Row>
          <Row label={signed ? 'Agreed rent' : 'Rent'}>{naira(signed ? liveTerms.rent_amount : tenancyRow.rent_amount)}</Row>
          <Row label="Payment frequency">{tenancyRow.rent_period ?? '—'}</Row>
          <Row label="Payment schedule">{liveTerms?.payment_schedule ?? 'Not recorded yet'}</Row>
          <Row label="Starts">{day(tenancyRow.start_date) ?? '—'}</Row>
          <Row label="Ends">{day(tenancyRow.end_date) ?? '—'}</Row>
          {liveTerms && <Row label="Deposit">{naira(liveTerms.deposit_amount)}</Row>}
          {liveTerms && <Row label="Fees">{naira(liveTerms.fees_amount)}</Row>}
          {liveTerms?.notice_days !== null && liveTerms?.notice_days !== undefined && <Row label="Notice period">{liveTerms.notice_days} days</Row>}
        </dl>
        {liveTerms?.house_rules && <p className="rounded-md bg-secondary p-3 text-sm"><span className="font-semibold">House rules: </span>{liveTerms.house_rules}</p>}
        {liveTerms && (
          <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
            <Pill tone={liveTerms.status === 'signed' ? 'green' : 'amber'}>
              {liveTerms.status === 'signed' ? 'Signed agreement recorded' : liveTerms.status === 'accepted' ? 'Accepted by both sides' : 'Waiting for acceptance'}
            </Pill>
            <p className="text-xs text-muted-foreground">
              You: {liveTerms.tenant_accepted_at ? `accepted ${day(liveTerms.tenant_accepted_at)}` : 'not yet'} · Landlord: {liveTerms.landlord_accepted_at ? `accepted ${day(liveTerms.landlord_accepted_at)}` : 'not yet'}
            </p>
            {liveTerms.status === 'signed' && liveTerms.signed_reference && (
              <p className="text-xs text-foreground">Signed copy reference {liveTerms.signed_reference}{liveTerms.signed_recorded_at ? ` (recorded ${day(liveTerms.signed_recorded_at)})` : ''}</p>
            )}
            {liveTerms.status === 'accepted' && <p className="text-xs text-muted-foreground">EboHomes records the signed agreement once it has seen it. This page does not replace the signed document.</p>}
          </div>
        )}
      </div>
    )
  }

  const renderPayments = () => {
    if (!tenancyRow) return null
    return (
      <div className="space-y-4">
        {liveTerms?.status === 'signed' && (
          <PayOnlinePanel tenancyId={tenancyRow.id} terms={liveTerms} title={tenancyRow.title} reference={tenancyRow.tenancy_code} period={tenancyRow.rent_period} />
        )}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-foreground">Payment history</h4>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.{liveTerms?.status !== 'signed' ? ' Payment options appear once your agreement is recorded.' : ''}</p>
          ) : (
            <>
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{naira(p.amount)} <span className="text-xs font-normal capitalize text-muted-foreground">{p.type}</span></p>
                      <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${PAY_TONE[getPaymentState(p)]}`}>{paymentLabel(p)}</span>
                      {getPaymentState(p) === 'rejected' && p.review_note && <p className="mt-1 text-xs text-muted-foreground">EboHomes’ note: {p.review_note}</p>}
                    </div>
                    {p.receipt_code && (
                      <Link href={`/receipt/${p.receipt_code}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        <Receipt size={14} aria-hidden /> Open receipt {p.receipt_code}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">A payment record is not proof of cleared funds. Only a payment marked “Verified by EboHomes” has been checked by EboHomes.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------- step details ----------

  const detailApplication = (
    <div className="space-y-4">
      <PropertySummary compact listing={listing} inspected={inspected.has(app.listing_id)} href={listingOpen ? `/listing/${app.listing_id}` : undefined} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-secondary/60 p-3 sm:grid-cols-3">
        <Row label="Application reference">{app.case_ref ?? '—'}</Row>
        <Row label="Submitted">{day(app.created_at) ?? '—'}</Row>
        <Row label="Application status"><ApplicationStatusBadge status={app.status} /></Row>
      </dl>
      <ApplicantFacts data={extra.application_data} />
      {app.message && <p className="rounded-md bg-secondary p-3 text-sm"><span className="font-semibold">Your message: </span>{app.message}</p>}
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">Full property details</summary>
        <div className="mt-2"><PropertySummary listing={listing} inspected={inspected.has(app.listing_id)} full /></div>
      </details>
      <div className="flex flex-wrap gap-2">
        {listingOpen && <Link href={`/listing/${app.listing_id}`} className={btnS}><Eye size={15} aria-hidden /> View property</Link>}
        <Link href={messagesHref} className={btnS}><MessageCircle size={15} aria-hidden /> Talk to EboHomes</Link>
      </div>
      {(app.status === 'pending' || app.status === 'info_requested' || (app.status === 'approved' && !app.tenant_interest_at && !tenancyRow)) && (
        <button
          disabled={busy}
          onClick={() => { if (window.confirm('Withdraw this application?')) updateApp({ status: 'withdrawn' }, 'Your application was withdrawn.', ['pending', 'info_requested', 'approved']) }}
          className="min-h-11 text-xs text-muted-foreground underline hover:text-destructive"
        >
          Withdraw application
        </button>
      )}
    </div>
  )

  const detailDecision = (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-secondary/60 p-3">
        <Row label="Decision"><Pill tone={selStep.tone}>{selStep.label}</Pill></Row>
        <Row label="Decision date">{(app.status === 'approved' || app.status === 'rejected') ? (day(extra.decided_at) ?? 'Not recorded') : 'Not decided yet'}</Row>
      </dl>
      {app.status === 'info_requested' && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">EboHomes asked:</p>
          <p>{app.info_request}</p>
          <label className="block text-xs font-semibold" htmlFor="journey-reply">Your answer</label>
          <textarea id="journey-reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your answer" className={`${field} text-foreground`} />
          <button
            disabled={busy || !reply.trim()}
            onClick={async () => {
              const saved = await updateApp({ tenant_reply: reply.trim(), status: 'pending' }, 'Your answer was sent to EboHomes. They will review your application again.', ['info_requested'])
              if (saved) setReply('')
            }}
            className={btnP}
          >
            {busy ? 'Sending…' : 'Send answer to EboHomes'}
          </button>
        </div>
      )}
      {app.status === 'pending' && app.tenant_reply && <p className="rounded-md bg-secondary p-3 text-sm"><span className="font-semibold">Your last answer to EboHomes: </span>{app.tenant_reply}</p>}
      {app.status === 'rejected' && app.decision_note && <p className="rounded-md bg-secondary p-3 text-sm"><span className="font-semibold">EboHomes’ note: </span>{app.decision_note}</p>}
      <div className="rounded-lg border border-border p-3 text-sm">
        <p className="font-semibold text-foreground">What can happen</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>EboHomes approves your application. You then see the property and confirm that you want to proceed.</li>
          <li>EboHomes asks you a question. You answer it here.</li>
          <li>EboHomes does not approve it. The application closes and nothing is charged.</li>
        </ul>
      </div>
    </div>
  )

  const canRequestViewing =
    (app.status === 'pending' || app.status === 'info_requested' || app.status === 'approved') &&
    !tenancyRow &&
    !viewings.some((x) => OPEN_STATUSES.includes(x.status))
  const reqPh = reqPhone ?? profilePhone
  const reqPhoneOk = !!normaliseNgPhone(reqPh)
  const reqIso = toIso(reqWhen)
  const requestForm = (
    <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <p className="font-semibold text-foreground">Tell us when and how to reach you</p>
      <label className="block text-xs font-semibold text-foreground">Preferred date and time
        <input type="datetime-local" value={reqWhen} onChange={(e) => setReqWhen(e.target.value)} className={`${field} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-foreground">Phone number EboHomes can call
        <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={reqPh} onChange={(e) => setReqPhone(e.target.value)} className={`${field} mt-1`} />
      </label>
      {reqPh && !reqPhoneOk && <p className="text-xs text-red-700">Enter a valid Nigerian mobile number, for example 0803 123 4567.</p>}
      <input aria-label="Anything we should know?" value={reqNote} onChange={(e) => setReqNote(e.target.value)} maxLength={300} placeholder="Anything we should know? (optional)" className={field} />
      <button disabled={busy || !reqPhoneOk || !reqIso} onClick={submitViewing} className={`${btnP} w-full`}>Request viewing</button>
      {(!reqPhoneOk || !reqIso) && <p className="text-xs text-muted-foreground">Choose a date and enter a valid phone number to continue.</p>}
    </div>
  )

  const vPanel = v ? tenantPanel(v, fmtDateTime, { status: app.status, tenant_interest_at: app.tenant_interest_at }) : null
  const detailViewing = (
    <div className="space-y-4">
      {!v && canRequestViewing && requestForm}
      {!v ? (
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="font-semibold text-foreground">No viewing requested yet</p>
          <p className="text-muted-foreground">See the property in person before you pay anything. EboHomes confirms every appointment and calls you to coordinate.</p>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Pill tone={viewingTone(v.status)}>{viewingLabel(v.status)}</Pill>
            <span className="text-xs font-semibold text-muted-foreground">Reference VW-{String(v.id).slice(0, 8).toUpperCase()}</span>
          </div>
          {vPanel && (
            <div className="space-y-1">
              <p className="font-bold text-foreground">{tidy(vPanel.heading)}</p>
              <p>{vPanel.body}</p>
              <p className="flex items-start gap-1.5 font-semibold"><ArrowRight size={14} className="mt-1 shrink-0" aria-hidden /> <span>Next: <span className="font-normal">{tidy(vPanel.next)}</span></span></p>
            </div>
          )}
          <p className="flex items-center gap-2 rounded-md bg-secondary p-2">
            <CalendarClock size={15} aria-hidden />
            {v.scheduled_for ? <span><b>Confirmed:</b> {fmtDateTime(v.scheduled_for)}</span>
              : v.proposed_at ? <span><b>Proposed:</b> {fmtDateTime(v.proposed_at)}</span>
              : v.preferred_at ? <span><b>Requested:</b> {fmtDateTime(v.preferred_at)}</span>
              : <span className="text-muted-foreground">No time given yet. EboHomes will suggest one.</span>}
          </p>
          {v.admin_response && <p className="rounded-md bg-secondary p-2"><span className="font-semibold">Message from EboHomes: </span>{v.admin_response}</p>}
          {v.meeting_instructions && v.status === 'scheduled' && <p><span className="font-semibold">Meeting instructions: </span>{v.meeting_instructions}</p>}

          {v.status === 'reschedule_proposed' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className={btnP} onClick={() => rpc('tenant_respond_proposal', { p_viewing: v.id, p_accept: true, p_message: null }, 'Accepted. Your viewing is scheduled for the proposed time.')}>Accept proposed time</button>
                <button disabled={busy} className={btnS} onClick={() => rpc('tenant_respond_proposal', { p_viewing: v.id, p_accept: false, p_message: note.trim() || null }, 'Declined. EboHomes will offer another time.')}>Decline proposed time</button>
              </div>
              <input aria-label="Tell EboHomes what time suits you" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Tell EboHomes what time suits you (optional)" className={field} />
            </div>
          )}
          {v.status === 'completed' && !v.tenant_decision && (
            <div className="space-y-2 rounded-lg border-2 border-primary p-3">
              <p className="font-bold text-foreground">What would you like to do next?</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button disabled={busy} className={btnP} onClick={() => rpc('tenant_viewing_decision', { p_viewing: v.id, p_interested: true }, 'Recorded. EboHomes will review your application and confirm the property and rental terms. Nothing is approved or reserved yet.', 'Continue with renting this property? This does not approve your application or reserve the property.')}>I’m interested — continue with renting</button>
                <button disabled={busy} className={btnS} onClick={() => rpc('tenant_viewing_decision', { p_viewing: v.id, p_interested: false }, 'Recorded. You are no longer interested in this property.', 'Tell EboHomes you are no longer interested in this property?')}>I’m no longer interested</button>
              </div>
            </div>
          )}
          {OPEN_STATUSES.includes(v.status) && (
            <button disabled={busy} className="min-h-11 text-xs text-muted-foreground underline hover:text-destructive" onClick={() => rpc('cancel_viewing', { p_viewing: v.id, p_note: null }, 'Viewing cancelled.', 'Cancel this viewing?')}>Cancel this viewing</button>
          )}
          <Link href="/viewings" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">Open full viewing page (history) →</Link>
        </div>
      )}
      {v && canRequestViewing && (
        <details className="rounded-lg border border-border p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-foreground">Request another viewing</summary>
          <div className="mt-2">{requestForm}</div>
        </details>
      )}

      {app.status === 'approved' && !tenancyRow && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-bold text-foreground">Confirm that you want to proceed</p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">What to check before you pay anything</summary>
            <p className="text-muted-foreground">Even if EboHomes inspected the property, check the condition, location, utilities, the landlord or agent, the rent and the agreement yourself.</p>
          </details>
          {app.tenant_interest_at ? (
            <p className="flex items-start gap-2 font-medium text-primary"><CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> You confirmed you want to proceed on {day(app.tenant_interest_at)}. To change your mind, talk to EboHomes.</p>
          ) : (
            <div className="space-y-2">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={ready} onChange={(e) => setReady(e.target.checked)} />
                <span>I have seen this property in person and want to proceed.</span>
              </label>
              <button
                disabled={busy || !ready}
                className={btnP}
                onClick={() => updateApp({ tenant_interest_at: new Date().toISOString() }, 'Confirmed. You told EboHomes you want to proceed. The landlord sets up your tenancy next. Nothing is reserved or charged yet.', ['approved'])}
              >
                Proceed with EboHomes
              </button>
              {!ready && <p className="text-xs text-muted-foreground">Tick the box to enable this button. Nothing is charged.</p>}
            </div>
          )}
        </div>
      )}
      {app.status === 'approved' && tenancyRow && app.tenant_interest_at && <p className="text-sm font-medium text-primary">You confirmed you want to proceed on {day(app.tenant_interest_at)}.</p>}
    </div>
  )

  const detailSetup = !tenancyRow ? (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p className="font-semibold text-foreground">{journey.phase === 'awaiting_tenancy' ? 'The landlord is setting up your tenancy' : 'No tenancy exists yet'}</p>
      <p className="text-muted-foreground">
        {journey.phase === 'awaiting_tenancy'
          ? 'You confirmed that you want to proceed. When the landlord creates your tenancy it appears here, with the rent, dates and rental terms. Nothing is reserved or due yet.'
          : 'A tenancy appears here only after the landlord creates it.'}
      </p>
    </div>
  ) : (
    <div className="space-y-4">
      {renderTenancyFacts()}
      {(() => {
        // Progress comes only from the saved agreement status.
        const labels = ['Terms proposed', 'Accepted by both', 'Agreement recorded']
        const done = !liveTerms ? 0 : liveTerms.status === 'signed' ? 3 : liveTerms.status === 'accepted' ? 2 : 1
        return (
          <div role="group" aria-label="Agreement progress">
            <div className="flex gap-1" aria-hidden>
              {labels.map((l, i) => <span key={l} className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-primary' : 'bg-border'}`} />)}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {done === 0 ? 'No rental terms have been proposed yet.' : done === 3 ? 'Signed agreement recorded by EboHomes.' : `Agreement: ${labels[done - 1].toLowerCase()}. Not signed yet.`}
            </p>
          </div>
        )
      })()}
      {liveTerms?.status === 'proposed' && !liveTerms.tenant_accepted_at && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Your action: accept or decline these terms</p>
          <p>Rent {naira(liveTerms.rent_amount)} · Deposit {naira(liveTerms.deposit_amount)} · Fees {naira(liveTerms.fees_amount)}. Accept only if they are right.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className={btnP} onClick={() => rpc('respond_rental_terms', { p_terms: liveTerms.id, p_accept: true }, 'You accepted these terms.', 'Accept these rental terms?')}>Accept rental terms</button>
            <button disabled={busy} className={btnS} onClick={() => rpc('respond_rental_terms', { p_terms: liveTerms.id, p_accept: false }, 'You declined these terms.', 'Decline these rental terms?')}>Decline rental terms</button>
          </div>
        </div>
      )}
      {!liveTerms && <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">The landlord has not proposed rental terms yet. The rent and dates above come from the tenancy record and are not an agreement.</p>}
      {tenancyStatus !== 'active' && liveTerms?.status === 'signed' && renderPayments()}
    </div>
  )

  const detailActive = !tenancyRow ? null : (
    <div className="space-y-4">
      <TenancyChecklist tenancyId={tenancyRow.id} />
      <TenancyChecklist tenancyId={tenancyRow.id} />
      {renewalOffered && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Your action: you have a renewal offer</p>
          {renewalOffer && (
            <>
              <p>New rent <b>{naira(renewalOffer.new_rent)}</b>, until <b>{fmtDate(renewalOffer.new_end_date)}</b></p>
              {renewalOffer.terms && <p className="rounded-md bg-white/70 p-2">{renewalOffer.terms}</p>}
            </>
          )}
          <p className="text-xs">Responding records your decision only. No payment is taken.</p>
          {renewalOffer ? (
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className={btnP} onClick={() => respondRenewal(renewalOffer.id, 'accepted')}>Accept offer</button>
              <button disabled={busy} className={btnS} onClick={() => respondRenewal(renewalOffer.id, 'declined')}>Decline offer</button>
            </div>
          ) : (
            <Link href="/tenancies" className={btnP}>Respond to renewal offer <ArrowRight size={15} aria-hidden /></Link>
          )}
        </div>
      )}
      {renderTenancyFacts()}
      {renderPayments()}
      <p className="text-xs text-muted-foreground">This page does not show an automatic due date for the next payment. Follow the payment schedule above or ask EboHomes.</p>
      <details
        className="rounded-lg border border-border p-3 text-sm"
        onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setHubOpen(true) }}
      >
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">Handover, repairs, disputes and deposit</summary>
        <p className="mb-3 text-muted-foreground">Record your move-in condition, report a repair, raise a dispute or follow the deposit settlement. Everything is handled here.</p>
        {hubOpen && <TenancyHub role="tenant" tenancyId={tenancyRow.id} embedded />}
      </details>
    </div>
  )

  const detailBody: Record<StepKey, React.ReactNode> = {
    application: detailApplication, decision: detailDecision, viewing: detailViewing, setup: detailSetup, active: detailActive,
  }
  const prev = selIndex > 0 ? STEP_ORDER[selIndex - 1] : null
  const next = selIndex < STEP_ORDER.length - 1 ? STEP_ORDER[selIndex + 1] : null

  // ---------- stepper ----------

  const sr = (s: JourneyStep) => (s.state === 'done' ? 'completed' : s.state === 'current' ? 'current step' : s.state === 'stopped' ? 'closed' : 'not reached yet')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
      <div ref={topRef} className="scroll-mt-4">
        <Link href="/journey?all=1" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} aria-hidden /> All my journeys</Link>
        <h1 className="text-2xl font-bold text-foreground">Your rental journey</h1>
        <p className="text-sm text-muted-foreground">Five stages from application to moving in. Tap any stage to read about it.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <PropertySummary compact listing={listing} inspected={inspected.has(app.listing_id)} href={listingOpen ? `/listing/${app.listing_id}` : undefined} />
        <p className="mt-2 text-xs text-muted-foreground">{app.case_ref ? `Application ${app.case_ref} · ` : ''}Submitted {day(app.created_at)}</p>
      </div>

      {intro && (
        <div role="region" aria-label="How the journey works" className="relative rounded-xl border border-primary/30 bg-accent p-4 pr-12 text-sm text-accent-foreground">
          <p className="font-bold">How this works</p>
          <p className="mt-1">You apply (01). EboHomes decides (02). You see the property and confirm you want to proceed (03). The landlord sets up your tenancy and rental terms (04). Then your tenancy is active (05). A viewing can be requested while your application is still being reviewed.</p>
          <button onClick={dismissIntro} className="mt-2 min-h-11 font-semibold underline">Got it, hide this</button>
          <button onClick={dismissIntro} aria-label="Dismiss introduction" className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5"><X size={16} aria-hidden /></button>
        </div>
      )}

      {justSubmitted && app.status === 'pending' && (
        <section role="status" aria-labelledby="submitted-heading" className="space-y-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-950">
          <h2 id="submitted-heading" className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 size={22} aria-hidden /> Application submitted</h2>
          <p>Stage 1 is complete{app.case_ref ? `. Your reference is ${app.case_ref}` : ''}. EboHomes will now review your application.</p>
          <p className="font-medium">This is not an approval, a reservation or a payment. Nothing has been charged.</p>
          <button type="button" onClick={() => setJustSubmitted(false)} className="min-h-11 font-semibold underline">Got it, hide this</button>
        </section>
      )}

      {showsNoReservationNotice(journey.phase) && (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{NO_RESERVATION_NOTICE}</span>
        </p>
      )}

      {warn && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{warn}</p>}

      {/* Stepper */}
      <nav aria-label="Rental journey stages" className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <ol className="flex flex-col sm:flex-row">
          {journey.steps.map((s, i) => {
            const isSel = s.key === selected
            const isCur = s.key === journey.currentKey
            const last = i === journey.steps.length - 1
            const circle =
              s.state === 'done' ? 'border-primary bg-primary text-primary-foreground'
              : s.state === 'current' ? 'border-primary bg-card text-primary'
              : s.state === 'stopped' ? 'border-red-600 bg-red-50 text-red-700'
              : 'border-border bg-card text-muted-foreground'
            return (
              <li key={s.key} className="relative sm:flex-1">
                {!last && (
                  <span
                    aria-hidden
                    className={`absolute left-[1.65rem] top-12 bottom-0 w-0.5 sm:left-1/2 sm:right-auto sm:top-[1.7rem] sm:bottom-auto sm:h-0.5 sm:w-full ${s.state === 'done' ? 'bg-primary' : 'bg-border'}`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => selectStep(s.key)}
                  aria-current={isCur ? 'step' : undefined}
                  aria-pressed={isSel}
                  className="relative z-10 flex min-h-11 w-full items-start gap-3 rounded-lg p-2 pb-4 text-left focus-visible:outline-2 focus-visible:outline-primary sm:flex-col sm:items-center sm:pb-2 sm:text-center"
                >
                  {isCur && <span className="hidden items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-primary sm:inline-flex">You are here <ArrowDown size={12} aria-hidden /></span>}
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-card text-sm font-bold transition ${circle} ${isSel ? 'ring-4 ring-primary/25' : ''}`}>
                    {s.state === 'done' ? <Check size={18} aria-hidden /> : s.state === 'stopped' ? <X size={18} aria-hidden /> : s.number}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1 sm:flex-none">
                    {isCur && <span className="block text-[11px] font-bold uppercase tracking-wide text-primary sm:hidden">You are here</span>}
                    <span className={`block text-sm font-semibold leading-tight ${s.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'} ${isSel ? 'underline decoration-primary decoration-2 underline-offset-4' : ''}`}>
                      {s.number} {s.title}
                    </span>
                    <span className="block"><Pill tone={s.tone}>{s.label}</Pill></span>
                    {s.needsYou && <span className="block text-[11px] font-bold text-amber-900">Your action needed</span>}
                    <span className="sr-only">Status: {sr(s)}.</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {msg && (
        <div ref={msgRef} role={msg.ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-md border p-3 text-sm font-medium ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>
          {msg.ok && <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />}
          <span>{msg.text}</span>
        </div>
      )}

      {unlocked && (
        <div role="status" className="space-y-2 rounded-xl border-2 border-primary bg-primary/5 p-4 text-sm">
          <p className="flex items-center gap-2 text-base font-bold text-primary">
            <CheckCircle2 size={20} aria-hidden /> Stage {STEP_ORDER.indexOf(unlocked.from) + 1} complete
          </p>
          <p className="text-foreground">Stage {STEP_ORDER.indexOf(unlocked.to) + 1}, {STEP_TITLE[unlocked.to]}, is now open.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnP} onClick={() => { const k = unlocked.to; setUnlocked(null); selectStep(k) }}>Go to {STEP_TITLE[unlocked.to]} <ArrowDown size={15} aria-hidden /></button>
            <button type="button" className={btnS} onClick={() => setUnlocked(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Current status panel */}
      <section aria-labelledby="status-heading" className={`rounded-xl border border-border border-t-4 bg-card p-4 sm:p-5 ${TOP[panel.tone]}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Pill tone={panel.needsYou ? 'amber' : 'grey'}>{panel.needsYou ? 'Action needed from you' : 'No action needed from you'}</Pill>
          <span className="text-xs font-semibold text-muted-foreground">Current stage: {STEP_TITLE[journey.currentKey]}</span>
        </div>
        <h2 id="status-heading" className="text-lg font-bold leading-snug text-foreground">{panel.heading}</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What has happened</dt><dd className="text-sm text-foreground">{panel.happened}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What it means</dt><dd className="text-sm text-foreground">{panel.means}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What happens next</dt><dd className="text-sm text-foreground">{panel.next}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What you need to do</dt><dd className="text-sm font-semibold text-foreground">{panel.action}</dd></div>
        </dl>
        {panel.cta && (
          <div className="mt-4">
            {panel.cta.href && panel.cta.href !== '/viewings' ? (
              <Link href={panel.cta.href} className={btnP}>{panel.cta.label} <ArrowRight size={15} aria-hidden /></Link>
            ) : (
              <button type="button" onClick={() => selectStep(panel.cta!.step ?? 'viewing')} className={btnP}>{panel.cta.label} <ArrowDown size={15} aria-hidden /></button>
            )}
          </div>
        )}
      </section>

      {/* Selected stage details */}
      <section aria-labelledby="detail-heading" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Stage {selStep.number} of 05</p>
            <h2 id="detail-heading" ref={detailRef} tabIndex={-1} className="scroll-mt-4 text-lg font-bold text-foreground outline-none">{selStep.title}</h2>
          </div>
          <Pill tone={selStep.tone}>{selStep.label}</Pill>
        </div>
        <p className="text-sm text-muted-foreground">{selStep.blurb}</p>

        {selected !== journey.currentKey && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary p-2 text-sm">
            <Info size={15} aria-hidden className="shrink-0" />
            <span>You are reading a different stage from your current one.</span>
            <button type="button" onClick={() => { setPicked(null); toOverview() }} className="min-h-11 font-semibold text-primary underline">Back to my current stage</button>
          </div>
        )}

        {locked && (
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-secondary/60 p-3 text-sm">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">Not available yet</p>
              <p className="text-muted-foreground">{locked}</p>
            </div>
          </div>
        )}

        {selected === 'viewing' && locked
          ? (appOpen ? detailViewing : null)
          : locked
            ? null
            : detailBody[selected]}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          {prev ? <button type="button" onClick={() => selectStep(prev)} className={btnS}><ArrowLeft size={15} aria-hidden /> Previous: {STEP_TITLE[prev]}</button> : <span />}
          {next && <button type="button" onClick={() => selectStep(next)} className={btnS}>Next: {STEP_TITLE[next]} <ArrowRight size={15} aria-hidden /></button>}
        </div>
        <button type="button" onClick={toOverview} className="min-h-11 text-sm font-semibold text-primary underline">Back to overview</button>
      </section>
    </div>
  )
}