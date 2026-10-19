'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, CheckCircle2, XCircle, FileText, HelpCircle, MessageCircle, Eye } from 'lucide-react'
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
  approved: { label: 'APPROVED', cls: 'text-emerald-900 bg-emerald-50 border border-emerald-300', icon: CheckCircle2 },
  rejected: { label: 'NOT APPROVED', cls: 'text-red-900 bg-red-50 border border-red-300', icon: XCircle },
  info_requested: { label: 'ACTION NEEDED: MORE INFORMATION', cls: 'text-amber-900 bg-amber-50 border border-amber-300', icon: HelpCircle },
  withdrawn: { label: 'WITHDRAWN', cls: 'text-slate-800 bg-slate-100 border border-slate-300', icon: XCircle },
  pending: { label: 'WAITING FOR EBOHOMES', cls: 'text-amber-900 bg-amber-50 border border-amber-300', icon: Clock },
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-1">My Applications</h1>
        <p className="text-sm text-muted-foreground mb-6">Each card shows the property, where your application stands and what to do next.</p>
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3 mb-3">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-300 rounded-md p-3 mb-3 font-medium">{notice}</p>}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-24 bg-secondary rounded-lg" />
            <div className="h-24 bg-secondary rounded-lg" />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-4">You haven't applied to any properties yet.</p>
            <button onClick={() => router.push('/search')} className="text-primary text-sm font-medium hover:underline">
              Browse properties →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => {
              const b = BADGES[app.status] ?? BADGES.pending
              const Icon = b.icon
              const listing = listings[app.listing_id]
              const listingOpen = listingIsLive(listing?.status)
              const tenancy = tenancies[app.id]
              const m = meaning(app, tenancy)
              return (
                <div key={app.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${b.cls}`}>
                      <Icon size={12} /> {b.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {app.case_ref ? `${app.case_ref} · ` : ''}Applied {new Date(app.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <PropertySummary compact listing={listing} inspected={inspected.has(app.listing_id)} href={listingOpen ? `/listing/${app.listing_id}` : undefined} />

                  <div className="mt-3 rounded-lg bg-secondary p-3 text-sm space-y-1">
                    <p className="font-bold text-foreground">{m.title}</p>
                    {m.body && <p className="text-foreground">{m.body}</p>}
                    <p className="font-bold text-foreground">Next: <span className="font-normal">{m.next}</span></p>
                  </div>

                  {tenancy && (
                    <Link href={`/tenancies/${tenancy.id}`} className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
                      Open my tenancy
                    </Link>
                  )}

                  {listing && !listingOpen && (app.status === 'pending' || app.status === 'info_requested' || app.status === 'approved') && (
                    <p className="mt-3 text-xs text-muted-foreground bg-secondary rounded-md p-2">
                      This property is not currently listed. Contact EboHomes if you need help.
                    </p>
                  )}

                  {app.status === 'info_requested' && (
                    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                      <p className="font-semibold text-amber-900">EboHomes asked:</p>
                      <p className="text-amber-900 mt-1">{app.info_request}</p>
                      <textarea
                        rows={3}
                        value={replies[app.id] ?? ''}
                        onChange={(e) => setReplies((p) => ({ ...p, [app.id]: e.target.value }))}
                        placeholder="Type your answer"
                        className="mt-2 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
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
                        className="mt-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md px-3 py-1.5 disabled:opacity-50"
                      >
                        Send answer
                      </button>
                    </div>
                  )}

                  {app.status === 'rejected' && app.decision_note && (
                    <p className="mt-3 text-sm text-muted-foreground bg-secondary rounded-md p-2">EboHomes' note: {app.decision_note}</p>
                  )}

                  {(app.status === 'rejected' || app.status === 'withdrawn') && listingOpen && (
                    <Link href={`/apply/${app.listing_id}`} className="inline-block mt-3 text-sm font-medium text-primary hover:underline">
                      Apply again →
                    </Link>
                  )}

                  {app.status === 'approved' && (
                    <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-3">
                      <details>
                        <summary className="cursor-pointer font-semibold text-foreground">What to check before you pay anything</summary>
                        <p className="mt-1 text-muted-foreground">
                          Even if EboHomes inspected the property, check the condition, location, utilities, the landlord or agent,
                          the rent and the agreement yourself.
                        </p>
                      </details>
                      {app.tenant_inspected && (
                        <p className="text-primary font-medium">Your viewing has been marked as completed.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {listingOpen && (
                          <Link href={`/listing/${app.listing_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary">
                            <Eye size={14} /> View property
                          </Link>
                        )}
                        <Link href={whatsapp(app)} className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary">
                          <MessageCircle size={14} /> Talk to EboHomes
                        </Link>
                        <Link href="/viewings" className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary">Request a viewing</Link>
                      </div>
                      {app.tenant_interest_at ? (
                        <p className="text-primary font-medium">
                          You confirmed you want to proceed on {new Date(app.tenant_interest_at).toLocaleDateString()}. To change your mind, talk to EboHomes.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-1" checked={!!ready[app.id]} onChange={(e) => setReady((p) => ({ ...p, [app.id]: e.target.checked }))} />
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
                            className="text-sm font-semibold text-primary-foreground bg-primary rounded-md px-3 py-1.5 disabled:opacity-50"
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
                      className="mt-3 text-xs text-muted-foreground hover:text-destructive hover:underline"
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