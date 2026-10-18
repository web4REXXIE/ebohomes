'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, CheckCircle2, XCircle, FileText, HelpCircle, MessageCircle, Eye } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'

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
  listing?: { title: string; location_text: string; price_monthly: number; photos: string[]; status: string; properties?: { public_id: string } | null }
}

const BADGES: Record<string, { label: string; cls: string; icon: any }> = {
  approved: { label: 'Approved', cls: 'text-primary bg-primary/10', icon: CheckCircle2 },
  rejected: { label: 'Declined', cls: 'text-destructive bg-destructive/10', icon: XCircle },
  info_requested: { label: 'More info needed', cls: 'text-amber-700 bg-amber-100', icon: HelpCircle },
  withdrawn: { label: 'Withdrawn', cls: 'text-muted-foreground bg-secondary', icon: XCircle },
  pending: { label: 'Awaiting EboHomes review', cls: 'text-muted-foreground bg-secondary', icon: Clock },
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
    const listingIds = [...new Set(apps.map((a) => a.listing_id))]
    const { data: listings } = await supabase
      .from('listings')
      .select('id, title, location_text, price_monthly, photos, status, properties(public_id)')
      .in('id', listingIds)

    setApplications(apps.map((a) => ({ ...a, listing: listings?.find((l: any) => l.id === a.listing_id) as any })))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const code = app.listing?.properties?.public_id ?? app.listing?.title ?? 'my application'
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
        <h1 className="text-xl font-bold text-foreground mb-1">My Applications</h1>
        <p className="text-sm text-muted-foreground mb-6">Track the status of properties you've applied to.</p>
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3 mb-3">{error}</p>}
        {notice && <p className="text-sm text-primary bg-primary/10 rounded-md p-3 mb-3">{notice}</p>}

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
              const code = app.listing?.properties?.public_id
              const listingOpen = app.listing?.status === 'approved'
              return (
                <div key={app.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img src={app.listing?.photos?.[0] || '/placeholder.jpg'} alt={app.listing?.title ?? 'Listing'} className="w-16 h-16 rounded-md object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{app.listing?.title ?? 'Listing'}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.listing?.location_text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {app.case_ref ? `${app.case_ref} · ` : ''}{code ? `${code} · ` : ''}Applied {new Date(app.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0 ${b.cls}`}>
                      <Icon size={12} /> {b.label}
                    </span>
                  </div>

                  {app.listing && !listingOpen && (app.status === 'pending' || app.status === 'info_requested' || app.status === 'approved') && (
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
                            'Your answer was sent. EboHomes will review your application again.',
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
                      <p className="font-semibold text-foreground">EboHomes has approved your application.</p>
                      <p className="text-muted-foreground">
                        Approval is not a tenancy and no payment has been taken. Next step: see the property
                        yourself. Even if EboHomes inspected it, check the condition, location, utilities, the landlord or
                        agent, the rent and the agreement before you pay anything.
                      </p>
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
                          You confirmed you want to proceed on {new Date(app.tenant_interest_at).toLocaleDateString()}. EboHomes will guide you from here. To change your mind, talk to EboHomes.
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
                                'Thanks. Your interest is confirmed and EboHomes will guide you on the agreement and payment.',
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