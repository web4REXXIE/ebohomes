'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Search,
  Home as HomeIcon,
  MessageCircle,
  CalendarClock,
  FileText,
  ChevronRight,
  Bed,
  Bath,
  ShieldCheck,
  Heart,
  Bell,
  KeyRound,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { resolveNotificationLink } from '@/components/notification-provider'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { TenantNextStep } from '@/components/tenant-next-step'
import { sizedPhoto } from '@/lib/image-url'
import { SmartImage } from '@/components/ui/smart-image'

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

type Profile = {
  id: string
  full_name: string | null
}

type ConvoPreview = {
  partnerId: string
  partnerName: string
  lastMessage: string
  lastTime: string
  unread: boolean
}

export default function TenantHomePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)

  const [unreadMsgCount, setUnreadMsgCount] = useState(0)

  const [recommended, setRecommended] = useState<Listing[]>([])
  const [landlordVerified, setLandlordVerified] = useState<Record<string, boolean>>({})
  const [continueBrowsing, setContinueBrowsing] = useState<Listing[]>([])
  const [recentSearches, setRecentSearches] = useState<{ id: string; text: string }[]>([])
  const [recentMessages, setRecentMessages] = useState<ConvoPreview[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [savedCount, setSavedCount] = useState<number | null>(null)
  // Sections whose data could not be loaded. They say so instead of showing an empty message.
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const bad: string[] = []
    try {
      await loadAll(bad)
    } catch (e) {
      console.error('Tenant dashboard: load failed:', e)
      bad.push('page')
    } finally {
      setFailed(Array.from(new Set(bad)))
      setLoading(false)
    }
  }

  async function loadAll(bad: string[]) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    setFullName(profile?.full_name ?? 'there')

    setUnreadMsgCount(await getUnreadMessageCount())

    // Listings on a property under an administrator hold are not shown here.
    // If the hold list cannot be loaded, the page still works.
    const heldSet = new Set<string>()
    const { data: heldRows, error: heldError } = await supabase.rpc('held_listing_ids')
    if (!heldError && Array.isArray(heldRows)) (heldRows as string[]).forEach((id) => heldSet.add(id))

    // New homes: the newest approved listings (not personalised)
    const { data: recsAll, error: recsError } = await supabase
      .from('listings')
      .select('id, title, price_monthly, location_text, property_type, bedrooms, bathrooms, photos, landlord_id, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(12)
    if (recsError) bad.push('homes')
    const recs = (recsAll ?? []).filter((r) => !heldSet.has(r.id)).slice(0, 4)
    setRecommended(recs)
    if (recs && recs.length > 0) {
      const landlordIds = Array.from(new Set(recs.map((r) => r.landlord_id).filter(Boolean)))
      if (landlordIds.length > 0) {
        const { data: landlords } = await supabase
          .from('profiles')
          .select('id, verified')
          .in('id', landlordIds)
        const map: Record<string, boolean> = {}
        ;(landlords ?? []).forEach((l: any) => { map[l.id] = !!l.verified })
        setLandlordVerified(map)
      }
    }

    // Continue Browsing — most recent distinct listings the user viewed
    const { data: views_rows } = await supabase
      .from('property_views')
      .select('listing_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (views_rows && views_rows.length > 0) {
      const seenIds: string[] = []
      for (const v of views_rows) {
        if (!seenIds.includes(v.listing_id)) seenIds.push(v.listing_id)
        if (seenIds.length >= 3) break
      }
      if (seenIds.length > 0) {
        const { data: browsed } = await supabase.from('listings').select('id, title, price_monthly, location_text, property_type, bedrooms, bathrooms, photos, landlord_id, created_at').in('id', seenIds)
        // preserve most-recent-first order
        const ordered = seenIds.filter((id) => !heldSet.has(id)).map((id) => browsed?.find((b) => b.id === id)).filter(Boolean) as Listing[]
        setContinueBrowsing(ordered)
      }
    }

    // Recent Searches
    const { data: searchRows } = await supabase
      .from('search_history')
      .select('id, query_text, location_text')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentSearches(
      (searchRows ?? []).map((s) => ({ id: s.id, text: s.query_text || s.location_text || 'Search' }))
    )

    // Recent conversations with EboHomes Support (top 3)
    const { data: threads, error: threadsError } = await supabase
      .from('support_threads')
      .select('id, subject, last_message_at')
      .eq('customer_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(3)
    if (threadsError) bad.push('messages')
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

    // Notifications (last 3, columns unconfirmed beyond user_id/read — select * and render defensively)
    const { data: notifs, error: notifsError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3)
    if (notifsError) bad.push('notifications')
    setNotifications(notifs ?? [])

    // Number of saved homes (same table and column the Saved page reads).
    const { count: savedTotal, error: savedError } = await supabase
      .from('saved_properties')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.id)
    if (!savedError && savedTotal != null) setSavedCount(savedTotal)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6" role="status" aria-busy="true" aria-label="Loading your dashboard">
        <div className="h-40 animate-pulse rounded-panel bg-secondary" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-card border border-border bg-card" />)}
        </div>
        <div className="h-56 animate-pulse rounded-card border border-border bg-card" />
      </div>
    )
  }

  const firstName = fullName.trim().split(/\s+/)[0] || 'there'
  const failedHomes = failed.includes('homes')

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Welcome and search */}
      <section aria-labelledby="dashboard-title" className="mb-6 rounded-panel bg-forest p-5 text-white sm:p-7">
        <p className="text-sm text-white/80">{greeting()},</p>
        <h1 id="dashboard-title" className="text-2xl font-bold sm:text-3xl">{firstName}</h1>
        <p className="mt-1 text-sm text-white/80">Here is what needs your attention.</p>
        <Link
          href="/search"
          className="focus-ring mt-5 flex min-h-12 items-center gap-3 rounded-button bg-white px-4 text-sm font-medium text-forest shadow-rest"
        >
          <Search size={18} aria-hidden />
          <span className="flex-1">Search for a home</span>
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>

      {failed.includes('page') && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-card border border-warning/40 bg-warning-soft p-3 text-sm text-foreground">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          Some of your dashboard could not load. Please refresh the page.
        </p>
      )}

      <TenantNextStep />

      {/* Where to find things */}
      <nav aria-label="Dashboard shortcuts" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={KeyRound} title="My Rental Journey" text="Apply, view, agree terms and pay" href="/journey" />
        <StatCard icon={CalendarClock} title="My Viewings" text="Requests and appointments" href="/viewings" />
        <StatCard
          icon={Heart}
          title="Saved Homes"
          text={savedCount != null && savedCount > 0 ? `${savedCount} saved` : 'Your favourites'}
          href="/saved"
        />
        <StatCard icon={HomeIcon} title="Tenancy & Payments" text="Rent terms, payments, receipts" href="/tenancies" />
        <StatCard icon={FileText} title="My Applications" text="Status of each application" href="/applications" />
        <StatCard icon={MessageCircle} title="Messages" text={unreadMsgCount > 0 ? `${unreadMsgCount} unread` : 'No unread messages'} href="/messages" />
      </nav>

      {/* Newest approved homes. This is a plain newest-first list, not a personalised recommendation. */}
      <Section title="New homes on EboHomes" href="/search">
        {failedHomes ? (
          <ErrorRow text="We could not load homes just now. Please refresh the page." />
        ) : recommended.length === 0 ? (
          <EmptyRow text="No homes to show yet. Search to see what is available." />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recommended.map((l) => (
              <ListingMini key={l.id} listing={l} verified={l.landlord_id ? landlordVerified[l.landlord_id] : false} />
            ))}
          </div>
        )}
      </Section>

      {/* Continue Browsing + Recent Searches */}
      <div id="continue-browsing" className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section title="Continue Browsing" href="/search" compact>
          {continueBrowsing.length === 0 ? (
            <EmptyRow text="Properties you view will show up here." />
          ) : (
            <div className="space-y-1">
              {continueBrowsing.map((l) => (
                <Link key={l.id} href={`/listing/${l.id}`} className="focus-ring -mx-2 flex min-h-14 items-center gap-3 rounded-card p-2 hover:bg-muted">
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-chip bg-secondary">
                    <SmartImage src={sizedPhoto(l.photos?.[0], 200) || '/placeholder.jpg'} alt="" fallbackSrc="/placeholder.jpg" compact />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{l.title || l.property_type}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.location_text}</p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-bold text-primary">{rent(l.price_monthly)}</p>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Recent Searches" id="recent-searches" compact>
          {recentSearches.length === 0 ? (
            <EmptyRow text="Your recent searches will appear here." />
          ) : (
            <div className="space-y-1">
              {recentSearches.map((s) => (
                <Link
                  key={s.id}
                  href={`/search?location=${encodeURIComponent(s.text)}`}
                  className="focus-ring flex min-h-11 items-center justify-between rounded-card px-2 text-sm text-foreground hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2"><Search size={14} className="shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{s.text}</span></span>
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Recent Messages + Notifications */}
      <div className="mb-8 mt-8 grid gap-6 lg:grid-cols-2">
        <Section title="Recent Messages" href="/messages" compact>
          {failed.includes('messages') ? (
            <ErrorRow text="We could not load your messages. Please refresh the page." />
          ) : recentMessages.length === 0 ? (
            <EmptyRow text="No conversations yet." />
          ) : (
            <div className="space-y-1">
              {recentMessages.map((c) => (
                <Link
                  key={c.partnerId}
                  href={`/messages?thread=${c.partnerId}`}
                  className="focus-ring flex min-h-14 items-center gap-3 rounded-card px-2 hover:bg-muted"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                    {c.partnerName[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{c.partnerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{c.lastTime}</span>
                    {c.unread && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                        <span className="sr-only">Unread</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Notifications" href="/notifications" compact>
          {failed.includes('notifications') ? (
            <ErrorRow text="We could not load your notifications. Please refresh the page." />
          ) : notifications.length === 0 ? (
            <EmptyRow text="You're all caught up." />
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => {
                const destination = resolveNotificationLink(n.link, 'tenant')
                const body = (
                  <>
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden>
                      <Bell size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-foreground">{n.message || n.title || n.body || 'Notification'}</p>
                      <p className="text-xs text-muted-foreground">{n.created_at ? formatTime(n.created_at) : ''}</p>
                    </div>
                    {!n.read && (
                      <>
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                        <span className="sr-only">Unread</span>
                      </>
                    )}
                  </>
                )
                const cls = 'flex min-h-14 items-start gap-3 rounded-card px-2 py-2'
                return destination ? (
                  <Link key={n.id} href={destination} className={`${cls} focus-ring hover:bg-muted`}>{body}</Link>
                ) : (
                  <div key={n.id} className={cls}>{body}</div>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, title, text, href }: { icon: any; title: string; text: string; href: string }) {
  return (
    <Link href={href} className="focus-ring rounded-card border border-border bg-card p-4 shadow-rest transition-colors hover:border-primary">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-button bg-primary/10">
        <Icon size={18} className="text-primary" aria-hidden />
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{text}</p>
    </Link>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function rent(n: number | null | undefined) {
  return n != null ? `₦${n.toLocaleString()}/month` : 'Price not set'
}

function Section({
  title,
  href,
  id,
  compact,
  children,
}: {
  title: string
  href?: string
  id?: string
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <section id={id} className={compact ? 'rounded-card border border-border bg-card p-4' : ''}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={compact ? 'text-sm font-semibold text-foreground' : 'text-lg font-bold text-foreground'}>{title}</h2>
        {href && (
          <Link href={href} className="focus-ring inline-flex min-h-11 items-center gap-0.5 rounded-chip px-1 text-xs font-semibold text-primary">
            View all <ChevronRight size={14} aria-hidden />
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

function ErrorRow({ text }: { text: string }) {
  return <p role="alert" className="py-4 text-center text-sm text-foreground">{text}</p>
}

function ListingMini({ listing, verified }: { listing: Listing; verified?: boolean }) {
  return (
    <Link href={`/listing/${listing.id}`} className="focus-ring overflow-hidden rounded-card border border-border bg-card shadow-rest transition-shadow hover:shadow-raised">
      <div className="relative h-28 sm:h-32">
        <SmartImage src={sizedPhoto(listing.photos?.[0], 480) || '/placeholder.jpg'} alt="" fallbackSrc="/placeholder.jpg" />
        {/* This is the landlord's own check (identity and ownership documents), not an inspection of the property. */}
        {verified && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-primary">
            <ShieldCheck size={12} aria-hidden /> Landlord verified
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-primary">{rent(listing.price_monthly)}</p>
        <p className="truncate text-xs text-muted-foreground">{listing.property_type}</p>
        <p className="truncate text-xs text-muted-foreground">{listing.location_text}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Bed size={12} aria-hidden /><span className="sr-only">Bedrooms: </span>{listing.bedrooms}</span>
          {listing.bathrooms != null && <span className="flex items-center gap-1"><Bath size={12} aria-hidden /><span className="sr-only">Bathrooms: </span>{listing.bathrooms}</span>}
        </div>
      </div>
    </Link>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
