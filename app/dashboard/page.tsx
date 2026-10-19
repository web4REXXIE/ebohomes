'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Home,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Plus,
  List,
  CreditCard,
  CalendarClock,
  FileText,
  KeyRound,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, type PropertyLite } from '@/components/property-summary'
import { listingIsLive } from '@/lib/property-display'
import { groupListings, isNewlyApproved, listingStatusInfo } from '@/lib/listing-status'
import { TONE_CLASS } from '@/lib/viewing-status'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardOverview() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [listings, setListings] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [pRes, lRes, nRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('listings').select('*, properties(public_id)').eq('landlord_id', user.id).order('created_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ])
      if (lRes.error) setFailed(true)
      setProfile(pRes.data)
      setListings(lRes.data ?? [])
      setActivity(nRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const groups = useMemo(() => groupListings(listings), [listings])
  const justApproved = useMemo(() => listings.filter((l) => isNewlyApproved(l, Date.now() - SEVEN_DAYS)), [listings])

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-card rounded-2xl border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  const firstName = (profile?.full_name ?? profile?.name ?? '').split(' ')[0] || 'there'

  const CARDS = [
    { label: 'Needs your attention', sub: 'Not approved or hidden', value: groups.attention.length, icon: AlertTriangle, color: 'bg-red-50 text-red-700', href: '/dashboard/listings#group-attention' },
    { label: 'Under review', sub: 'EboHomes is checking', value: groups.review.length, icon: Clock, color: 'bg-amber-50 text-amber-700', href: '/dashboard/listings#group-review' },
    { label: 'Approved & live', sub: 'Tenants can see these', value: groups.live.length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700', href: '/dashboard/listings#group-live' },
    { label: 'All properties', sub: 'Everything you submitted', value: listings.length, icon: Home, color: 'bg-primary/10 text-primary', href: '/dashboard/listings' },
  ]

  const QUICK_ACTIONS = [
    { label: 'Add New Property', sub: 'List a property', icon: Plus, href: '/list-property', color: 'bg-emerald-50 text-emerald-700' },
    { label: 'My Properties', sub: 'Status of each one', icon: List, href: '/dashboard/listings', color: 'bg-blue-50 text-blue-700' },
    { label: 'Viewings', sub: 'Appointments for your properties', icon: CalendarClock, href: '/dashboard/viewings', color: 'bg-purple-50 text-purple-700' },
    { label: 'Applications', sub: 'Tenants who applied', icon: FileText, href: '/dashboard/applications', color: 'bg-amber-50 text-amber-700' },
    { label: 'Tenancies', sub: 'Terms, rent and handover', icon: KeyRound, href: '/dashboard/tenancies', color: 'bg-primary/10 text-primary' },
    { label: 'Payments', sub: 'Recorded and verified', icon: CreditCard, href: '/dashboard/payments', color: 'bg-primary/10 text-primary' },
  ]

  // The properties that need a decision or a wait, most urgent first.
  const watch = [...groups.attention, ...groups.review].slice(0, 4)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">{greeting()}, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">Here is where each of your properties stands.</p>
      </div>

      {failed && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          We could not load your properties, so the numbers below may be wrong. Please refresh the page.
        </div>
      )}

      {justApproved.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-base font-bold text-emerald-900">
            <CheckCircle2 size={20} />
            {justApproved.length === 1 ? 'One of your properties was approved and is now live' : `${justApproved.length} of your properties were approved and are now live`}
          </p>
          <p className="mt-1 text-sm text-emerald-900">EboHomes checked them. Tenants can now find them, request viewings and apply.</p>
          <Link href="/dashboard/listings#group-live" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
            See them in My Properties <ArrowRight size={12} />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {CARDS.map((c) => (
          <Link key={c.label} href={c.href} className="bg-card border border-border rounded-2xl p-4 hover:border-primary/40 transition-colors">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${c.color}`}>
              <c.icon size={16} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{c.value}</p>
            <p className="text-sm font-semibold text-foreground">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">What needs your attention</h2>
          <Link href="/dashboard/listings" className="text-xs font-semibold text-primary flex items-center gap-1">
            All properties <ArrowRight size={12} />
          </Link>
        </div>
        {watch.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
            {listings.length === 0 ? 'You have not added a property yet.' : 'Nothing needs your attention right now. Your other properties are live or paused.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watch.map((l) => {
              const info = listingStatusInfo(l.status)
              return (
                <div key={l.id} className="bg-card border border-border rounded-2xl p-4">
                  <span className={`mb-3 inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[info.tone]}`}>{info.label}</span>
                  <PropertySummary compact listing={l as PropertyLite} inspected={false} href={listingIsLive(l.status) ? `/listing/${l.id}` : undefined} />
                  <p className="mt-3 text-sm text-foreground">{info.meaning}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Next: <span className="font-normal">{info.next}</span></p>
                  {l.status === 'rejected' && l.rejection_reason && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900"><span className="font-semibold">Reason from EboHomes:</span> {l.rejection_reason}</p>
                  )}
                  <Link href={`/dashboard/listings#listing-${l.id}`} className="mt-3 inline-flex min-h-10 items-center rounded-full border border-border px-4 text-xs font-bold text-foreground">
                    Open this property
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-bold text-foreground mb-3">Go to</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => router.push(a.href)}
              className="bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${a.color}`}>
                <a.icon size={16} />
              </div>
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.sub}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-foreground">Recent updates</h2>
          <Link href="/notifications" className="text-xs font-semibold text-primary">View all</Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No updates yet.</p>
        ) : (
          <div className="space-y-4">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Eye size={14} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{a.title ?? a.message ?? 'Update'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}