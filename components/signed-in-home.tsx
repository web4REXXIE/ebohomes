'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Key,
  Heart,
  CalendarClock,
  MessageCircle,
  Bell,
  ChevronRight,
  Home,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  List,
  CreditCard,
  KeyRound,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { useInspectedIds } from '@/lib/use-inspected-ids'
import { displayTitle, listingIsLive } from '@/lib/property-display'
import { groupListings, isNewlyApproved, listingStatusInfo } from '@/lib/listing-status'
import { TONE_CLASS } from '@/lib/viewing-status'
import { PropertySummary, type PropertyLite } from '@/components/property-summary'
import { TenantNextStep } from '@/components/tenant-next-step'
import { ListingCard } from '@/components/listing-card'

// Shown on the main page only when someone is signed in.
// Tenants see their tenant dashboard sections, landlords see their landlord dashboard sections.
// Visitors who are not signed in see nothing here, so the public page is unchanged.
export function SignedInHome() {
  const [role, setRole] = useState<'tenant' | 'landlord' | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const resolve = async (uid: string | null) => {
      if (!uid) {
        if (!cancelled) { setRole(null); setUserId(null) }
        return
      }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
      if (cancelled) return
      setUserId(uid)
      setRole(p?.role === 'landlord' ? 'landlord' : 'tenant')
    }

    supabase.auth.getUser().then(({ data }) => resolve(data?.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      resolve(session?.user?.id ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  if (!role || !userId) return null
  return role === 'landlord' ? <LandlordSections userId={userId} /> : <TenantSections userId={userId} />
}

/* =====================================================================
   TENANT
   ===================================================================== */

type Listing = {
  id: string
  title: string | null
  price_monthly: number | null
  location_text: string | null
  property_type: string | null
  bedrooms: number | null
  photos: string[] | null
}

type ConvoPreview = { id: string; lastMessage: string; lastTime: string; unread: boolean }

const ENDED = ['ended', 'terminated', 'cancelled', 'expired']
const naira = (v: unknown) => `₦${(Number(v) || 0).toLocaleString('en-NG')}`

function img(url: string | null | undefined, width: number) {
  if (!url) return '/placeholder.jpg'
  if (!url.includes('/upload/') || url.includes('/upload/f_auto')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function TenantSections({ userId }: { userId: string }) {
  const { unreadCount: unreadNotifs } = useNotifications()
  const [name, setName] = useState('')
  const [unreadMsgs, setUnreadMsgs] = useState(0)
  const [applicationsActive, setApplicationsActive] = useState(0)
  const [tenanciesActive, setTenanciesActive] = useState(0)
  const [viewingsUpcoming, setViewingsUpcoming] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [recommended, setRecommended] = useState<any[]>([])
  const [continueBrowsing, setContinueBrowsing] = useState<Listing[]>([])
  const [messages, setMessages] = useState<ConvoPreview[]>([])
  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [profRes, savedRes, appsRes, viewsRes, tenRes, msgCount] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
        supabase.from('saved_properties').select('listing_id').eq('tenant_id', userId),
        supabase.from('applications').select('status').eq('tenant_id', userId).limit(100),
        supabase.from('viewings').select('status, scheduled_for').eq('tenant_id', userId).limit(100),
        supabase.rpc('my_tenancies', { p_as: 'tenant' }),
        getUnreadMessageCount(),
      ])
      if (cancelled) return
      setName(((profRes.data?.full_name ?? '') as string).trim().split(/\s+/)[0] || '')
      setSavedCount((savedRes.data ?? []).length)
      setUnreadMsgs(msgCount)
      setApplicationsActive((appsRes.data ?? []).filter((a: any) => ['pending', 'info_requested', 'approved'].includes(a.status)).length)
      const now = Date.now()
      setViewingsUpcoming(
        (viewsRes.data ?? []).filter((v: any) => v.status === 'scheduled' && v.scheduled_for && new Date(v.scheduled_for).getTime() > now).length
      )
      setTenanciesActive(((tenRes.data ?? []) as any[]).filter((t) => !ENDED.includes(t.status ?? '')).length)

      // Recommended for you: the newest approved homes
      const { data: recs } = await supabase
        .from('listings')
        .select('id, title, price_monthly, price_yearly, location_text, property_type, bedrooms, bathrooms, photos, created_at, featured')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(4)
      if (!cancelled) setRecommended(recs ?? [])

      // Continue Browsing: most recent distinct listings the tenant viewed
      const { data: viewRows } = await supabase
        .from('property_views').select('listing_id, created_at').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(10)
      if (viewRows && viewRows.length > 0) {
        const seen: string[] = []
        for (const v of viewRows) {
          if (!seen.includes(v.listing_id)) seen.push(v.listing_id)
          if (seen.length >= 3) break
        }
        const { data: browsed } = await supabase.from('listings').select('*').in('id', seen)
        if (!cancelled) setContinueBrowsing(seen.map((id) => browsed?.find((b) => b.id === id)).filter(Boolean) as Listing[])
      }

      // Recent conversations with EboHomes Support
      const { data: threads } = await supabase
        .from('support_threads').select('id, subject, last_message_at').eq('customer_id', userId)
        .order('last_message_at', { ascending: false }).limit(3)
      if (threads && threads.length > 0) {
        const { data: unreadRows } = await supabase
          .from('support_messages').select('thread_id').eq('sender_kind', 'staff').is('read_at', null)
        const unreadSet = new Set((unreadRows ?? []).map((r: any) => r.thread_id))
        if (!cancelled) {
          setMessages(threads.map((t: any) => ({ id: t.id, lastMessage: t.subject, lastTime: formatTime(t.last_message_at), unread: unreadSet.has(t.id) })))
        }
      }

      const { data: notifs } = await supabase
        .from('notifications').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(3)
      if (!cancelled) setNotifications(notifs ?? [])
    })()
    return () => { cancelled = true }
  }, [userId])

  const tiles = [
    { href: '/applications', icon: FileText, title: 'My Applications', text: applicationsActive > 0 ? `${applicationsActive} in progress` : 'Track your progress', tint: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    { href: '/tenancies', icon: Key, title: 'Tenancy & Payments', text: tenanciesActive > 0 ? `${tenanciesActive} active` : 'Rent, receipts & more', tint: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300' },
    { href: '/saved', icon: Heart, title: 'Saved Homes', text: savedCount > 0 ? `${savedCount} saved` : 'Your favourites', tint: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' },
    { href: '/viewings', icon: CalendarClock, title: 'Viewings', text: viewingsUpcoming > 0 ? `${viewingsUpcoming} upcoming` : 'Requests & appointments', tint: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300' },
    { href: '/messages', icon: MessageCircle, title: 'Messages', text: unreadMsgs > 0 ? `${unreadMsgs} unread` : 'Chat with EboHomes', tint: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300' },
    { href: '/notifications', icon: Bell, title: 'Notifications', text: unreadNotifs > 0 ? `${unreadNotifs} new` : 'You’re all caught up', tint: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' },
  ]

  return (
    <section aria-label="Your dashboard" className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-6 md:pt-8 lg:px-8">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h2 className="text-2xl font-extrabold text-foreground">{name || 'there'} 👋</h2>
        <p className="text-sm text-muted-foreground">Here is what needs your attention.</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col items-center rounded-2xl border border-border bg-card p-3 text-center transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md sm:p-4"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14 ${t.tint}`}>
              <t.icon size={22} />
            </span>
            <span className="mt-2.5 text-xs font-bold text-foreground sm:text-sm">{t.title}</span>
            <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">{t.text}</span>
          </Link>
        ))}
      </div>

      {/* Recommended for you */}
      {recommended.length > 0 && (
        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-xl font-extrabold text-foreground">Recommended for you</h3>
              <p className="text-sm text-muted-foreground">The newest homes on EboHomes.</p>
            </div>
            <Link href="/search" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View all homes <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recommended.map((l) => (
              <ListingCard
                key={l.id}
                id={l.id}
                title={l.title ?? undefined}
                image={img(l.photos?.[0], 600)}
                price_monthly={l.price_monthly ?? 0}
                price_yearly={l.price_yearly ?? undefined}
                location={l.location_text ?? ''}
                property_type={l.property_type ?? ''}
                bedrooms={l.bedrooms ?? undefined}
                bathrooms={l.bathrooms ?? undefined}
                photoCount={Array.isArray(l.photos) ? l.photos.length : undefined}
                created_at={l.created_at}
                featured={!!l.featured}
              />
            ))}
          </div>
        </div>
      )}

      {/* Continue your rental journey: real steps from the tenant's records */}
      <TenantNextStep />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Continue Browsing" href="/search">
          {continueBrowsing.length === 0 ? (
            <EmptyRow text="Properties you view will show up here." />
          ) : (
            <div className="space-y-3">
              {continueBrowsing.map((l) => (
                <Link key={l.id} href={`/listing/${l.id}`} className="-mx-2 flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/40">
                  <img src={img(l.photos?.[0], 200)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{displayTitle(l)}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.location_text}</p>
                  </div>
                  <p className="whitespace-nowrap text-xs font-bold text-primary">{naira(l.price_monthly)}</p>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent Messages" href="/messages">
          {messages.length === 0 ? (
            <EmptyRow text="No conversations yet." />
          ) : (
            <div className="space-y-1">
              {messages.map((c) => (
                <Link key={c.id} href={`/messages?thread=${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">E</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">EboHomes Support</p>
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground">{c.lastTime}</span>
                    {c.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Notifications" href="/notifications">
          {notifications.length === 0 ? (
            <EmptyRow text="You’re all caught up." />
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-secondary/40">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bell size={13} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{n.message || n.title || n.body || 'Notification'}</p>
                    <p className="text-[10px] text-muted-foreground">{n.created_at ? formatTime(n.created_at) : ''}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  )
}

/* =====================================================================
   LANDLORD (same content and rules as app/dashboard/page.tsx)
   ===================================================================== */

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function LandlordSections({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<any>(null)
  const [listings, setListings] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const inspected = useInspectedIds(listings.map((l) => l.id))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [pRes, lRes, nRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('listings').select('*, properties(public_id)').eq('landlord_id', userId).order('created_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      ])
      if (cancelled) return
      if (lRes.error) setFailed(true)
      setProfile(pRes.data)
      setListings(lRes.data ?? [])
      setActivity(nRes.data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId])

  const groups = useMemo(() => groupListings(listings), [listings])
  const justApproved = useMemo(() => listings.filter((l) => isNewlyApproved(l, Date.now() - SEVEN_DAYS)), [listings])

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading your dashboard">
        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />)}
        </div>
      </section>
    )
  }

  const firstName = (profile?.full_name ?? profile?.name ?? '').split(' ')[0] || 'there'

  const CARDS = [
    { label: 'Needs your attention', sub: 'Not approved or hidden', value: groups.attention.length, icon: AlertTriangle, color: 'bg-red-50 text-red-800', href: '/dashboard/listings#group-attention' },
    { label: 'Under review', sub: 'EboHomes is checking', value: groups.review.length, icon: Clock, color: 'bg-amber-50 text-amber-900', href: '/dashboard/listings#group-review' },
    { label: 'Approved and live', sub: 'Tenants can see these', value: groups.live.length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-900', href: '/dashboard/listings#group-live' },
    { label: 'All properties', sub: 'Everything you submitted', value: listings.length, icon: Home, color: 'bg-primary/10 text-primary', href: '/dashboard/listings' },
  ]

  const QUICK_ACTIONS = [
    { label: 'Add new property', sub: 'List a property', icon: Plus, href: '/list-property', color: 'bg-emerald-50 text-emerald-900' },
    { label: 'My properties', sub: 'Status of each one', icon: List, href: '/dashboard/listings', color: 'bg-blue-50 text-blue-900' },
    { label: 'Viewings', sub: 'Appointments for your properties', icon: CalendarClock, href: '/dashboard/viewings', color: 'bg-purple-50 text-purple-900' },
    { label: 'Applications', sub: 'Tenants who applied', icon: FileText, href: '/dashboard/applications', color: 'bg-amber-50 text-amber-900' },
    { label: 'Tenancies', sub: 'Terms, rent and handover', icon: KeyRound, href: '/dashboard/tenancies', color: 'bg-primary/10 text-primary' },
    { label: 'Payments', sub: 'Recorded and verified', icon: CreditCard, href: '/dashboard/payments', color: 'bg-primary/10 text-primary' },
  ]

  const watch = [...groups.attention, ...groups.review].slice(0, 4)

  return (
    <section aria-label="Your dashboard" className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 md:pt-8 lg:px-8">
      <div className="mb-6">
        <h2 className="mb-1 text-2xl font-bold text-foreground">{greeting()}, {firstName}</h2>
        <p className="text-sm text-muted-foreground">Here is where each of your properties stands.</p>
      </div>

      {failed && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          We could not load your properties, so the numbers below may be wrong. Please refresh the page.
        </div>
      )}

      {justApproved.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-base font-bold text-emerald-900">
            <CheckCircle2 size={20} aria-hidden />
            {justApproved.length === 1
              ? 'One of your properties was approved and is now live'
              : `${justApproved.length} of your properties were approved and are now live`}
          </p>
          <p className="mt-1 text-sm text-emerald-900">EboHomes checked them. Tenants can now find them, request viewings and apply.</p>
          <Link href="/dashboard/listings#group-live" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
            See them in My Properties <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${c.color}`}>
              <c.icon size={16} aria-hidden />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{c.value}</p>
            <p className="text-sm font-semibold text-foreground">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">What needs your attention</h3>
          <Link href="/dashboard/listings" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">
            All properties <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
        {watch.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {listings.length === 0
              ? 'You have not added a property yet.'
              : 'Nothing needs your attention right now. Your other properties are live or paused.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {watch.map((l) => {
              const info = listingStatusInfo(l.status)
              return (
                <div key={l.id} className="rounded-2xl border border-border bg-card p-4">
                  <span className={`mb-3 inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[info.tone]}`}>{info.label}</span>
                  <PropertySummary
                    compact
                    listing={l as PropertyLite}
                    inspected={inspected.has(l.id)}
                    href={listingIsLive(l.status) ? `/listing/${l.id}` : undefined}
                  />
                  <p className="mt-3 text-sm text-foreground">{info.meaning}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Next: <span className="font-normal">{info.next}</span></p>
                  {l.status === 'rejected' && l.rejection_reason && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
                      <span className="font-semibold">Reason from EboHomes:</span> {l.rejection_reason}
                    </p>
                  )}
                  <Link href={`/dashboard/listings#listing-${l.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-bold text-foreground hover:bg-secondary">
                    Open this property
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mb-8">
        <h3 className="mb-3 text-lg font-bold text-foreground">Go to</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.label} href={a.href} className="rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${a.color}`}>
                <a.icon size={16} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-foreground">Recent updates</h3>
          <Link href="/notifications" className="inline-flex min-h-11 items-center text-xs font-semibold text-primary">View all</Link>
        </div>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="space-y-4">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bell size={14} className="text-primary" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{a.title ?? a.message ?? 'Update'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('en-NG')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ---------------- shared bits ---------------- */

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {href && (
          <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary">
            View all <ChevronRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{text}</p>
}