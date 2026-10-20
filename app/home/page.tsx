'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  MapPin,
  FileText,
  Key,
  Heart,
  CalendarClock,
  MessageCircle,
  Bell,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Bed,
  Bath,
  Building2,
  ShieldCheck,
  BadgeCheck,
  Headphones,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { useInspectedIds } from '@/lib/use-inspected-ids'
import { displayTitle } from '@/lib/property-display'
import { TenantNextStep } from '@/components/tenant-next-step'

type Listing = {
  id: string
  title: string | null
  price_monthly: number | null
  location_text: string | null
  property_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  photos: string[] | null
  landlord_id: string | null
  created_at: string
}

type ConvoPreview = {
  partnerId: string
  partnerName: string
  lastMessage: string
  lastTime: string
  unread: boolean
}

// Same property types the public home page uses (values match the search filter).
const TYPES = [
  'Flat / Apartment', 'Bungalow', 'Self Contain', 'Duplex', 'Penthouse', 'Hostel',
  'Office', 'Shop / Mall', 'Warehouse', 'Land / Plot', 'Event Center',
]

const PRICE_OPTIONS = [100000, 200000, 300000, 500000, 1000000]

const ENDED = ['ended', 'terminated', 'cancelled', 'expired']

const naira = (v: unknown) => `₦${(Number(v) || 0).toLocaleString('en-NG')}`

// Cloudinary: smaller, faster images. Other URLs are left alone.
function img(url: string | null | undefined, width: number) {
  if (!url) return '/placeholder.jpg'
  if (!url.includes('/upload/') || url.includes('/upload/f_auto')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}

export default function TenantHomePage() {
  const router = useRouter()
  const { unreadCount: unreadNotifs } = useNotifications()

  const [loading, setLoading] = useState(true)

  // Search card
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  // Real data only
  const [recommended, setRecommended] = useState<Listing[]>([])
  const [areas, setAreas] = useState<{ name: string; count: number }[]>([])
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)

  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [applicationsActive, setApplicationsActive] = useState(0)
  const [tenanciesActive, setTenanciesActive] = useState(0)
  const [viewingsUpcoming, setViewingsUpcoming] = useState(0)

  const [continueBrowsing, setContinueBrowsing] = useState<Listing[]>([])
  const [recentSearches, setRecentSearches] = useState<{ id: string; text: string }[]>([])
  const [recentMessages, setRecentMessages] = useState<ConvoPreview[]>([])
  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    // Run the independent queries together so the page appears sooner.
    const [recsRes, areaRes, savedRes, appsRes, viewsRes, tenRes, msgCount] = await Promise.all([
      supabase
        .from('listings')
        .select('id, title, price_monthly, location_text, property_type, bedrooms, bathrooms, photos, landlord_id, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('listings')
        .select('location_text, property_type')
        .eq('status', 'approved')
        .limit(500),
      supabase.from('saved_properties').select('listing_id').eq('tenant_id', user.id),
      supabase.from('applications').select('status').eq('tenant_id', user.id).limit(100),
      supabase.from('viewings').select('status, scheduled_for').eq('tenant_id', user.id).limit(100),
      supabase.rpc('my_tenancies', { p_as: 'tenant' }),
      getUnreadMessageCount(),
    ])

    setRecommended((recsRes.data ?? []) as Listing[])

    // Popular areas and property types come from approved listings. Nothing is made up.
    const places: Record<string, { name: string; count: number }> = {}
    const types: Record<string, number> = {}
    for (const r of areaRes.data ?? []) {
      const name = (r.location_text || '').trim()
      if (name) {
        const key = name.toLowerCase()
        places[key] = { name: places[key]?.name ?? name, count: (places[key]?.count ?? 0) + 1 }
      }
      if (r.property_type) types[r.property_type] = (types[r.property_type] || 0) + 1
    }
    setAreas(Object.values(places).sort((a, b) => b.count - a.count))
    setTypeCounts(types)

    setSavedIds(new Set((savedRes.data ?? []).map((s: any) => s.listing_id as string)))
    setUnreadMsgCount(msgCount)

    setApplicationsActive(
      (appsRes.data ?? []).filter((a: any) => ['pending', 'info_requested', 'approved'].includes(a.status)).length
    )
    const now = Date.now()
    setViewingsUpcoming(
      (viewsRes.data ?? []).filter(
        (v: any) => v.status === 'scheduled' && v.scheduled_for && new Date(v.scheduled_for).getTime() > now
      ).length
    )
    setTenanciesActive(
      ((tenRes.data ?? []) as any[]).filter((t) => !ENDED.includes(t.status ?? '')).length
    )

    setLoading(false)
    loadActivity(user.id)
  }

  // Lower-priority sections load after the page is already visible.
  async function loadActivity(uid: string) {
    // Continue Browsing: most recent distinct listings the user viewed
    const { data: viewRows } = await supabase
      .from('property_views')
      .select('listing_id, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(10)
    if (viewRows && viewRows.length > 0) {
      const seen: string[] = []
      for (const v of viewRows) {
        if (!seen.includes(v.listing_id)) seen.push(v.listing_id)
        if (seen.length >= 3) break
      }
      if (seen.length > 0) {
        const { data: browsed } = await supabase.from('listings').select('*').in('id', seen)
        setContinueBrowsing(seen.map((id) => browsed?.find((b) => b.id === id)).filter(Boolean) as Listing[])
      }
    }

    // Recent searches
    const { data: searchRows } = await supabase
      .from('search_history')
      .select('id, query_text, location_text')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentSearches((searchRows ?? []).map((s) => ({ id: s.id, text: s.query_text || s.location_text || 'Search' })))

    // Recent conversations with EboHomes Support (top 3)
    const { data: threads } = await supabase
      .from('support_threads')
      .select('id, subject, last_message_at')
      .eq('customer_id', uid)
      .order('last_message_at', { ascending: false })
      .limit(3)
    if (threads && threads.length > 0) {
      const { data: unreadRows } = await supabase
        .from('support_messages').select('thread_id').eq('sender_kind', 'staff').is('read_at', null)
      const unreadSet = new Set((unreadRows ?? []).map((r: any) => r.thread_id))
      setRecentMessages(
        threads.map((t: any) => ({
          partnerId: t.id,
          partnerName: 'EboHomes Support',
          lastMessage: t.subject,
          lastTime: formatTime(t.last_message_at),
          unread: unreadSet.has(t.id),
        }))
      )
    }

    // Notifications (last 3; columns beyond user_id/read are not guaranteed, so render defensively)
    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(3)
    setNotifications(notifs ?? [])
  }

  async function toggleSave(listingId: string) {
    if (!userId) return
    const was = savedIds.has(listingId)
    // update the screen first, undo if the save fails
    setSavedIds((prev) => {
      const next = new Set(prev)
      was ? next.delete(listingId) : next.add(listingId)
      return next
    })
    const res = was
      ? await supabase.from('saved_properties').delete().eq('tenant_id', userId).eq('listing_id', listingId)
      : await supabase.from('saved_properties').insert({ tenant_id: userId, listing_id: listingId })
    if (res.error) {
      console.error('Could not update saved home:', res.error.message)
      setSavedIds((prev) => {
        const next = new Set(prev)
        was ? next.add(listingId) : next.delete(listingId)
        return next
      })
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location.trim()) params.set('location', location.trim())
    if (propertyType) params.set('type', propertyType)
    if (maxPrice) params.set('maxPrice', maxPrice)
    const q = params.toString()
    router.push('/search' + (q ? '?' + q : ''))
  }

  const typeOptions = useMemo(() => {
    const withListings = TYPES.filter((t) => (typeCounts[t] ?? 0) > 0)
    return withListings.length > 0 ? withListings : TYPES
  }, [typeCounts])

  const inspectedIds = useInspectedIds(recommended.map((l) => l.id))

  const tiles = [
    {
      href: '/applications', icon: FileText, title: 'My Applications',
      text: applicationsActive > 0 ? `${applicationsActive} in progress` : 'Track your progress',
      tint: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    {
      href: '/tenancies', icon: Key, title: 'Tenancy & Payments',
      text: tenanciesActive > 0 ? `${tenanciesActive} active` : 'Rent, receipts & more',
      tint: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300',
    },
    {
      href: '/saved', icon: Heart, title: 'Saved Homes',
      text: savedIds.size > 0 ? `${savedIds.size} saved` : 'Your favourites',
      tint: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    },
    {
      href: '/viewings', icon: CalendarClock, title: 'Viewings',
      text: viewingsUpcoming > 0 ? `${viewingsUpcoming} upcoming` : 'Requests & appointments',
      tint: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    },
    {
      href: '/messages', icon: MessageCircle, title: 'Messages',
      text: unreadMsgCount > 0 ? `${unreadMsgCount} unread` : 'Chat with EboHomes',
      tint: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
    },
    {
      href: '/notifications', icon: Bell, title: 'Notifications',
      text: unreadNotifs > 0 ? `${unreadNotifs} new` : 'You’re all caught up',
      tint: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    },
  ]

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* ===== Hero + search ===== */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <img
          src="/hero-home.jpg"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          fetchPriority="high"
        />
        {/* Fades the photo into the page colour so the text is readable in light and dark mode */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/90 to-background/30 sm:via-background/80" />

        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12 lg:px-8 lg:pb-12 lg:pt-14">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-bold tracking-widest text-primary">
              RENT · LIVE · BELONG
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight text-foreground sm:text-4xl lg:text-5xl">
              Find a place you’ll love to call home.
            </h1>
            <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
              Discover reviewed properties, compare your options and move through your rental journey with confidence.
            </p>

            {/* Search card */}
            <form
              onSubmit={handleSearch}
              className="mt-6 rounded-2xl border border-border bg-card p-3 shadow-lg sm:p-4"
            >
              <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_auto]">
                <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
                  <MapPin size={17} className="shrink-0 text-muted-foreground" />
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    list="home-areas"
                    placeholder="Enter location (e.g. Abakaliki)"
                    aria-label="Location"
                    className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <datalist id="home-areas">
                    {areas.slice(0, 30).map((a) => <option key={a.name} value={a.name} />)}
                  </datalist>
                </label>

                <div className="relative">
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    aria-label="Property type"
                    className="h-12 w-full appearance-none rounded-xl border border-border bg-background pl-3 pr-9 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="">All types</option>
                    {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>

                <div className="relative">
                  <select
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    aria-label="Maximum monthly price"
                    className="h-12 w-full appearance-none rounded-xl border border-border bg-background pl-3 pr-9 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="">Any price</option>
                    {PRICE_OPTIONS.map((p) => <option key={p} value={p}>Up to {naira(p)} / month</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>

                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <Search size={17} /> Search
                </button>
              </div>
            </form>

            {/* Popular areas: real areas from approved listings */}
            {areas.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Popular:</span>
                {areas.slice(0, 6).map((a) => (
                  <Link
                    key={a.name}
                    href={`/search?location=${encodeURIComponent(a.name)}`}
                    className="rounded-full border border-border bg-card/90 px-3 py-1 font-medium text-foreground hover:border-primary hover:text-primary"
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trust card (desktop). Describes the real review process, not a "verified" claim. */}
        <div className="absolute right-8 top-10 hidden w-72 rounded-2xl border border-border bg-card p-4 shadow-lg xl:block">
          <div className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={24} />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Reviewed listings</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Listings are checked before they go live. Look for the Inspected badge.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* ===== Quick actions ===== */}
        <section aria-label="Quick actions" className="grid grid-cols-3 gap-3 lg:grid-cols-6">
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
        </section>

        {/* ===== Recommended ===== */}
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-foreground">Recommended for you</h2>
              <p className="text-sm text-muted-foreground">The newest homes on EboHomes.</p>
            </div>
            <Link href="/search" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View all homes <ArrowRight size={14} />
            </Link>
          </div>

          {recommended.length === 0 ? (
            <EmptyRow text="No homes are listed yet. Check back soon." />
          ) : (
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {recommended.map((l) => (
                <HomeCard
                  key={l.id}
                  listing={l}
                  inspected={inspectedIds.has(l.id)}
                  saved={savedIds.has(l.id)}
                  onToggleSave={() => toggleSave(l.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ===== Continue your rental journey (real steps from your records) ===== */}
        <TenantNextStep savedCount={savedIds.size} />

        {/* ===== Continue Browsing + Recent Searches ===== */}
        <div id="continue-browsing" className="grid gap-6 lg:grid-cols-2">
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
                    <p className="whitespace-nowrap text-sm font-bold text-primary">{naira(l.price_monthly)}/month</p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent Searches">
            {recentSearches.length === 0 ? (
              <EmptyRow text="Your recent searches will appear here." />
            ) : (
              <div className="space-y-1">
                {recentSearches.map((s) => (
                  <Link
                    key={s.id}
                    href={`/search?location=${encodeURIComponent(s.text)}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-foreground hover:bg-secondary/40"
                  >
                    <span className="flex items-center gap-2"><Search size={13} className="text-muted-foreground" />{s.text}</span>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ===== Recent Messages + Notifications ===== */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Recent Messages" href="/messages">
            {recentMessages.length === 0 ? (
              <EmptyRow text="No conversations yet." />
            ) : (
              <div className="space-y-1">
                {recentMessages.map((c) => (
                  <Link
                    key={c.partnerId}
                    href={`/messages?thread=${c.partnerId}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {c.partnerName[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{c.partnerName}</p>
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

        {/* ===== Trust banner ===== */}
        <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white">
          <img
            src="/hero-3.jpg"
            alt=""
            className="absolute inset-y-0 right-0 -z-10 hidden h-full w-1/2 object-cover opacity-40 md:block"
            loading="lazy"
          />
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_2fr_auto] lg:items-center">
            <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">A safer way to find and rent homes.</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: BadgeCheck, title: 'Reviewed listings', text: 'Checked before they go live' },
                { icon: ShieldCheck, title: 'Inspected homes', text: 'Look for the Inspected badge' },
                { icon: Headphones, title: 'Support', text: 'Message EboHomes any time' },
              ].map((p) => (
                <div key={p.title} className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <p.icon size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-bold">{p.title}</p>
                    <p className="text-xs text-white/70">{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/search"
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-emerald-950 hover:bg-amber-300"
            >
              Explore homes <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------- pieces ---------------- */

function HomeCard({
  listing,
  inspected,
  saved,
  onToggleSave,
}: {
  listing: Listing
  inspected: boolean
  saved: boolean
  onToggleSave: () => void
}) {
  return (
    <Link
      href={`/listing/${listing.id}`}
      className="w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md sm:w-auto"
    >
      <div className="relative h-40 bg-secondary">
        <img src={img(listing.photos?.[0], 600)} alt="" loading="lazy" className="h-full w-full object-cover" />
        {inspected && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            <ShieldCheck size={12} /> Inspected
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave() }}
          aria-label={saved ? 'Remove from saved homes' : 'Save this home'}
          aria-pressed={saved}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-foreground shadow-sm"
        >
          <Heart size={16} className={saved ? 'fill-rose-500 text-rose-500' : 'text-gray-700'} />
        </button>
      </div>
      <div className="p-3.5">
        <p className="truncate text-sm font-bold text-foreground">{displayTitle(listing)}</p>
        <p className="truncate text-xs text-muted-foreground">{listing.location_text}</p>
        <p className="mt-2 text-base font-extrabold text-foreground">
          {naira(listing.price_monthly)} <span className="text-xs font-normal text-muted-foreground">/ month</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {listing.bedrooms != null && <span className="inline-flex items-center gap-1"><Bed size={12} />{listing.bedrooms} {listing.bedrooms === 1 ? 'Bed' : 'Beds'}</span>}
          {listing.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath size={12} />{listing.bathrooms} {listing.bathrooms === 1 ? 'Bath' : 'Baths'}</span>}
          {listing.property_type && <span className="inline-flex items-center gap-1"><Building2 size={12} />{listing.property_type}</span>}
        </div>
      </div>
    </Link>
  )
}

function Panel({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
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

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}