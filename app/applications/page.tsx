'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, CheckCircle2, XCircle, FileText, HelpCircle, MessageCircle, Eye, ArrowRight } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { displayTitle, listingIsLive } from '@/lib/property-display'

type ApplicationRow = {
  id: string
  status: string
  message: string | null
  created_at: string
  listing_id: string
  info_request: string | null
  tenant_reply: string | null
  decision_note: string | null
  tenant_interest_at: string | null
  tenant_inspected: boolean | null
  case_ref: string | null
}

type TenancyLite = { id: string; application_id: string; status: string | null }

const BADGES: Record<string, { label: string; cls: string; icon: any }> = {
  approved: { label: 'Approved', cls: 'text-emerald-900 bg-emerald-50 border border-emerald-300', icon: CheckCircle2 },
  rejected: { label: 'Not approved', cls: 'text-red-900 bg-red-50 border border-red-300', icon: XCircle },
  info_requested: { label: 'More information needed', cls: 'text-amber-900 bg-amber-50 border border-amber-300', icon: HelpCircle },
  withdrawn: { label: 'Withdrawn', cls: 'text-slate-800 bg-slate-100 border border-slate-300', icon: XCircle },
  pending: { label: 'Waiting for EboHomes', cls: 'text-amber-900 bg-amber-50 border border-amber-300', icon: Clock },
}

const JOURNEY = ['Applied', 'Review', 'Approved', 'Tenancy']

// How far the application has really got, from saved data only.
// 0-based index of the current step. 4 means every step is done (a tenancy exists).
function journeyPosition(a: ApplicationRow, tenancy: TenancyLite | undefined): number | null {
  if (a.status === 'rejected' || a.status === 'withdrawn') return null
  if (tenancy) return 4
  if (a.status === 'approved') return 3
  return 1
}

// True when the tenant has something to do on this application.
function needsTenant(a: ApplicationRow, tenancy: TenancyLite | undefined): boolean {
  if (a.status === 'info_requested') return true
  if (a.status === 'approved' && tenancy) return true
  if (a.status === 'approved' && !a.tenant_interest_at) return true
  return false
}

// What each saved status means, in plain words, and what the tenant should do next.
function meaning(a: ApplicationRow, tenancy: TenancyLite | undefined): { title: string; body: string; next: string } {
  if (a.status === 'pending')
    return { title: 'EboHomes is reviewing your application', body: 'Nothing is approved yet, and you do not need to pay anything.', next: 'Nothing to do. This page updates when EboHomes decides.' }
  if (a.status === 'info_requested')
    return { title: 'EboHomes needs more information', body: 'Your application is paused until you answer.', next: 'Type your answer in the box below and send it.' }
  if (a.status === 'rejected')
    return { title: 'EboHomes did not approve this application', body: 'No payment was taken.', next: 'You can apply again for this property, or search for another one.' }
  if (a.status === 'withdrawn')
    return { title: 'You withdrew this application', body: 'It is closed.', next: 'Apply again if you change your mind.' }
  if (a.status === 'approved' && tenancy)
    return { title: 'Your tenancy has been created', body: 'Your rental terms, payments and receipts are on your tenancy page.', next: 'Open your tenancy and review the rental terms.' }
  if (a.status === 'approved' && a.tenant_interest_at)
    return { title: 'You confirmed you want to proceed', body: 'The landlord sets up your tenancy and rental terms next. Nothing is due from you yet.', next: 'Wait for the landlord. Check My Tenancy & Payments.' }
  if (a.status === 'approved')
    return { title: 'Your application is approved. This is not a tenancy yet.', body: 'The property is not reserved and no payment has been taken.', next: 'See the property in person, then confirm below that you want to proceed.' }
  return { title: 'Application received', body: '', next: 'Nothing to do.' }
}

function Progress({ position }: { position: number }) {
  const shown = Math.min(position, JOURNEY.length - 1)
  return (
    <div className="mt-3" role="group" aria-label="Application progress">
      <div className="flex gap-1" aria-hidden>
        {JOURNEY.map((label, i) => (
          <span key={label} className={`h-1.5 flex-1 rounded-full ${i < position ? 'bg-primary' : i === position ? 'bg-primary/40' : 'bg-border'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {position >= JOURNEY.length
          ? 'All steps complete: your tenancy has been created.'
          : <>Step {shown + 1} of {JOURNEY.length}: <span className="font-semibold text-foreground">{JOURNEY[shown]}</span></>}
      </p>
    </div>
  )
}

export default function MyApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tenancies, setTenancies] = useState<Record<string, TenancyLite>>({})

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?redirect=/applications')
      return
    }
    const { data: apps, error: appsError } = await supabase
      .from('applications')
      .select('id, status, message, created_at, listing_id, info_request, tenant_reply, decision_note, tenant_interest_at, tenant_inspected, case_ref')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })

    if (appsError) {
      setError('Could not load your applications. Please refresh and try again.')
      setLoading(false)
      return
    }

    if (!apps || apps.length === 0) {
      setApplications([])
      setLoading(false)
      return
    }
    setApplications(apps as ApplicationRow[])

    // Which of these applications already have a tenancy? Failing to load this only hides the shortcut.
    const { data: ten } = await supabase.from('tenancies').select('id, application_id, status').in('application_id', apps.map((a) => a.id))
    setTenancies(Object.fromEntries((ten ?? []).map((t: any) => [t.application_id, t])))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { listings, inspected } = usePropertyData(useMemo(() => applications.map((a) => a.listing_id), [applications]))

  // Applications that need the tenant come first. Order within each group stays newest first.
  const sorted = useMemo(() => {
    const mine = applications.filter((a) => needsTenant(a, tenancies[a.id]))
    const rest = applications.filter((a) => !needsTenant(a, tenancies[a.id]))
    return [...mine, ...rest]
  }, [applications, tenancies])

  // Returns true only if the change was actually saved.
  const update = async (
    id: string,
    patch: Record<string, any>,
    successMessage: string,
    onlyWhenStatus: string[]
  ): Promise<boolean> => {
    if (busyId) return false
    setBusyId(id)
    setError('')
    setNotice('')
    const { data, error: err } = await supabase
      .from('applications')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', onlyWhenStatus)
      .select('id')

    let saved = false
    if (err) {
      setError(err.message)
    } else if (!data || data.length === 0) {
      setError('That change could not be saved because the application has changed. The page has been refreshed.')
    } else {
      setNotice(successMessage)
      saved = true
    }
    setBusyId(null)
    await load()
    return saved
  }

  const whatsapp = (app: ApplicationRow) => {
    const code = app.case_ref ?? displayTitle(listings[app.listing_id])
    const params = new URLSearchParams({
      new: '1',
      category: 'application',
      application: app.id,
      listing: app.listing_id,
      subject: `Application: ${String(code).slice(0, 90)}`,
    })
    return `/messages?${params.toString()}`
  }

  const actionCount = applications.filter((a) => needsTenant(a, tenancies[a.id])).length

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="mb-1 text-2xl font-bold text-foreground">My Applications</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Each card shows the property, where your application stands and what to do next.
          {!loading && actionCount > 0 && (
            <span className="mt-1 block font-semibold text-amber-900">
              {actionCount} {actionCount === 1 ? 'application needs' : 'applications need'} something from you.
            </span>
          )}
        </p>
        {error && <p role="alert" className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{notice}</p>}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading your applications">
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="h-5 w-32 rounded-full bg-secondary" />
                <div className="flex gap-3">
                  <div className="h-16 w-20 rounded-lg bg-secondary" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-secondary" />
                    <div className="h-3 w-1/2 rounded bg-secondary" />
                    <div className="h-3 w-1/3 rounded bg-secondary" />
                  </div>
                </div>
                <div className="h-16 rounded-lg bg-secondary" />
              </div>
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <FileText size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
            <p className="mb-4 text-sm text-muted-foreground">You haven&apos;t applied to any properties yet.</p>
            <Link href="/search" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Browse properties
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {sorted.map((app) => {
              const b = BADGES[app.status] ?? BADGES.pending
              const Icon = b.icon
              const listing = listings[app.listing_id]
              const listingOpen = listingIsLive(listing?.status)
              const tenancy = tenancies[app.id]
              const m = meaning(app, tenancy)
              const mine = needsTenant(app, tenancy)
              const position = journeyPosition(app, tenancy)
              return (
                <div key={app.id} className={`rounded-xl border bg-card p-4 ${mine ? 'border-amber-300' : 'border-border'}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${b.cls}`}>
                      <Icon size={12} aria-hidden /> {b.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {app.case_ref ? `${app.case_ref} · ` : ''}Applied {new Date(app.created_at).toLocaleDateString('en-NG')}
                    </span>
                  </div>

                  <PropertySummary compact listing={listing} inspected={inspected.has(app.listing_id)} href={listingOpen ? `/listing/${app.listing_id}` : undefined} />

                  {position !== null && <Progress position={position} />}

                  <div className={`mt-3 space-y-1 rounded-lg p-3 text-sm ${mine ? 'bg-amber-50' : 'bg-secondary'}`}>
                    {mine && <p className="text-xs font-semibold text-amber-900">Your action</p>}
                    <p className="font-bold text-foreground">{m.title}</p>
                    {m.body && <p className="text-foreground">{m.body}</p>}
                    <p className="flex items-start gap-1.5 font-semibold text-foreground">
                      <ArrowRight size={14} className="mt-1 shrink-0" aria-hidden />
                      <span>Next: <span className="font-normal">{m.next}</span></span>
                    </p>
                  </div>

                  {tenancy && (
                    <Link href={`/tenancies/${tenancy.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
                      Open my tenancy
                    </Link>
                  )}

                  {listing && !listingOpen && (app.status === 'pending' || app.status === 'info_requested' || app.status === 'approved') && (
                    <p className="mt-3 rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                      This property is not currently listed. Contact EboHomes if you need help.
                    </p>
                  )}

                  {app.status === 'info_requested' && (
                    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                      <p className="font-semibold text-amber-900">EboHomes asked:</p>
                      <p className="mt-1 text-amber-900">{app.info_request}</p>
                      <textarea
                        rows={3}
                        aria-label="Your answer to EboHomes"
                        value={replies[app.id] ?? ''}
                        onChange={(e) => setReplies((p) => ({ ...p, [app.id]: e.target.value }))}
                        placeholder="Type your answer"
                        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <button
                        disabled={busyId === app.id || !(replies[app.id] ?? '').trim()}
                        onClick={async () => {
                          const saved = await update(
                            app.id,
                            { tenant_reply: (replies[app.id] ?? '').trim(), status: 'pending' },
                            'Your answer was sent to EboHomes. They will review your application again.',
                            ['info_requested']
                          )
                          // Keep what the tenant typed if sending failed.
                          if (saved) setReplies((p) => ({ ...p, [app.id]: '' }))
                        }}
                        className="mt-2 min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {busyId === app.id ? 'Sending…' : 'Send answer'}
                      </button>
                    </div>
                  )}

                  {app.status === 'rejected' && app.decision_note && (
                    <p className="mt-3 rounded-md bg-secondary p-2 text-sm text-muted-foreground">EboHomes&apos; note: {app.decision_note}</p>
                  )}

                  {(app.status === 'rejected' || app.status === 'withdrawn') && listingOpen && (
                    <Link href={`/journey/apply/${app.listing_id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
                      Apply again →
                    </Link>
                  )}

                  {app.status === 'approved' && (
                    <div className="mt-4 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                      <details>
                        <summary className="cursor-pointer font-semibold text-foreground">What to check before you pay anything</summary>
                        <p className="mt-1 text-muted-foreground">
                          Even if EboHomes inspected the property, check the condition, location, utilities, the landlord or agent,
                          the rent and the agreement yourself.
                        </p>
                      </details>
                      {app.tenant_inspected && (
                        <p className="font-medium text-primary">Your viewing has been marked as completed.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {listingOpen && (
                          <Link href={`/listing/${app.listing_id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold hover:bg-secondary">
                            <Eye size={14} aria-hidden /> View property
                          </Link>
                        )}
                        <Link href={whatsapp(app)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold hover:bg-secondary">
                          <MessageCircle size={14} aria-hidden /> Talk to EboHomes
                        </Link>
                        <Link href="/viewings" className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold hover:bg-secondary">Request a viewing</Link>
                      </div>
                      {app.tenant_interest_at ? (
                        <p className="font-medium text-primary">
                          You confirmed you want to proceed on {new Date(app.tenant_interest_at).toLocaleDateString('en-NG')}. To change your mind, talk to EboHomes.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-1 h-4 w-4" checked={!!ready[app.id]} onChange={(e) => setReady((p) => ({ ...p, [app.id]: e.target.checked }))} />
                            <span>I have seen this property in person and want to proceed.</span>
                          </label>
                          <button
                            disabled={busyId === app.id || !ready[app.id]}
                            onClick={() =>
                              update(
                                app.id,
                                { tenant_interest_at: new Date().toISOString() },
                                'Confirmed. You told EboHomes you want to proceed. The landlord sets up your tenancy next. Nothing is reserved or charged yet.',
                                ['approved']
                              )
                            }
                            className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            Proceed with EboHomes
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(app.status === 'pending' || app.status === 'info_requested' || (app.status === 'approved' && !app.tenant_interest_at)) && (
                    <button
                      disabled={busyId === app.id}
                      onClick={() => {
                        if (window.confirm('Withdraw this application?')) {
                          update(app.id, { status: 'withdrawn' }, 'Your application was withdrawn.', [
                            'pending',
                            'info_requested',
                            'approved',
                          ])
                        }
                      }}
                      className="mt-3 min-h-11 text-xs text-muted-foreground hover:text-destructive hover:underline"
                    >
                      Withdraw application
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}