'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, CheckCircle2, XCircle, FileText, HelpCircle, MessageCircle, Eye } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'

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
  listing?: { title: string; location_text: string; price_monthly: number; photos: string[]; status: string; properties?: { public_id: string } | null }
}

const BADGES: Record<string, { label: string; cls: string; icon: any }> = {
  approved: { label: 'Accepted', cls: 'text-primary bg-primary/10', icon: CheckCircle2 },
  rejected: { label: 'Declined', cls: 'text-destructive bg-destructive/10', icon: XCircle },
  info_requested: { label: 'More info needed', cls: 'text-amber-700 bg-amber-100', icon: HelpCircle },
  withdrawn: { label: 'Withdrawn', cls: 'text-muted-foreground bg-secondary', icon: XCircle },
  pending: { label: 'Pending', cls: 'text-muted-foreground bg-secondary', icon: Clock },
}

export default function MyApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [inspected, setInspected] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?redirect=/applications')
      return
    }
    const { data: apps } = await supabase
      .from('applications')
      .select('id, status, message, created_at, listing_id, info_request, tenant_reply, decision_note, tenant_interest_at')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })

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

  const update = async (id: string, patch: Record<string, any>) => {
    setBusyId(id)
    setError('')
    const { error: err } = await supabase
      .from('applications')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) setError(err.message)
    setBusyId(null)
    load()
  }

  const whatsapp = (app: ApplicationRow) => {
    const code = app.listing?.properties?.public_id ?? app.listing?.title ?? ''
    const text = `Hello EboHomes, my application for property ${code} was accepted and I'd like help with the next step.`
    return `https://wa.me/${EBOHOMES_WHATSAPP}?text=${encodeURIComponent(text)}`
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-xl font-bold text-foreground mb-1">My Applications</h1>
        <p className="text-sm text-muted-foreground mb-6">Track the status of properties you've applied to.</p>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}

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
              return (
                <div key={app.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img src={app.listing?.photos?.[0] || '/placeholder.jpg'} alt={app.listing?.title} className="w-16 h-16 rounded-md object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{app.listing?.title ?? 'Listing'}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.listing?.location_text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {code ? `${code} · ` : ''}Applied {new Date(app.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0 ${b.cls}`}>
                      <Icon size={12} /> {b.label}
                    </span>
                  </div>

                  {app.status === 'info_requested' && (
                    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                      <p className="font-semibold text-amber-900">The landlord asked:</p>
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
                        onClick={() => update(app.id, { tenant_reply: replies[app.id].trim(), status: 'pending' })}
                        className="mt-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md px-3 py-1.5 disabled:opacity-50"
                      >
                        Send answer
                      </button>
                    </div>
                  )}

                  {app.status === 'rejected' && app.decision_note && (
                    <p className="mt-3 text-sm text-muted-foreground bg-secondary rounded-md p-2">Landlord's note: {app.decision_note}</p>
                  )}

                  {app.status === 'approved' && (
                    <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-3">
                      <p className="font-semibold text-foreground">The landlord has accepted your application.</p>
                      <p className="text-muted-foreground">
                        Next step: go and see the property yourself. Even if EboHomes inspected it, check the condition,
                        location, utilities, the landlord or agent, the rent and the agreement before you pay anything.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {app.listing?.status === 'approved' && (
                          <Link href={`/listing/${app.listing_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary">
                            <Eye size={14} /> View property
                          </Link>
                        )}
                        <a href={whatsapp(app)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary">
                          <MessageCircle size={14} /> Talk to EboHomes
                        </a>
                      </div>
                      {app.tenant_interest_at ? (
                        <p className="text-primary font-medium">
                          You confirmed you want to proceed on {new Date(app.tenant_interest_at).toLocaleDateString()}. EboHomes will guide you from here.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-1" checked={!!inspected[app.id]} onChange={(e) => setInspected((p) => ({ ...p, [app.id]: e.target.checked }))} />
                            <span>I have inspected this property in person and want to proceed.</span>
                          </label>
                          <button
                            disabled={busyId === app.id || !inspected[app.id]}
                            onClick={() => update(app.id, { tenant_interest_at: new Date().toISOString(), tenant_inspected: true })}
                            className="text-sm font-semibold text-primary-foreground bg-primary rounded-md px-3 py-1.5 disabled:opacity-50"
                          >
                            Proceed with EboHomes
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(app.status === 'pending' || app.status === 'info_requested') && (
                    <button
                      disabled={busyId === app.id}
                      onClick={() => window.confirm('Withdraw this application?') && update(app.id, { status: 'withdrawn' })}
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
