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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
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

  useEffect(() => { load() }, [])

  async function load() {
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

    // Recommended For You
    const { data: recs } = await supabase
      .from('listings')
      .select('id, title, price_monthly, location_text, property_type, bedrooms, bathrooms, photos, landlord_id, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(4)
    setRecommended(recs ?? [])
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
        const { data: browsed } = await supabase.from('listings').select('*').in('id', seenIds)
        // preserve most-recent-first order
        const ordered = seenIds.map((id) => browsed?.find((b) => b.id === id)).filter(Boolean) as Listing[]
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
    const { data: threads } = await supabase
      .from('support_threads')
      .select('id, subject, last_message_at')
      .eq('customer_id', user.id)
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

    // Notifications (last 3, columns unconfirmed beyond user_id/read — select * and render defensively)
    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3)
    setNotifications(notifs ?? [])

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Greeting */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">{fullName} 👋</h1>
        <p className="text-sm text-muted-foreground mb-3">Here is what needs your attention.</p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-full"
        >
          <Search size={16} />
          Search Homes
        </Link>
      </div>

      <TenantNextStep />

      {/* Where to find things */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={CalendarClock} title="My Viewings" text="Requests and appointments" href="/viewings" />
        <StatCard icon={FileText} title="My Applications" text="Status of each application" href="/applications" />
        <StatCard icon={HomeIcon} title="My Tenancy & Payments" text="Rent terms, payments, receipts" href="/tenancies" />
        <StatCard icon={MessageCircle} title="Messages" text={unreadMsgCount > 0 ? `${unreadMsgCount} unread` : 'No unread messages'} href="/messages" />
      </div>

      {/* Recommended For You */}
      <Section title="Recommended For You" href="/search">
        {recommended.length === 0 ? (
          <EmptyRow text="No recommendations yet — start browsing to see properties here." />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {recommended.map((l) => (
              <ListingMini key={l.id} listing={l} verified={l.landlord_id ? landlordVerified[l.landlord_id] : false} />
            ))}
          </div>
        )}
      </Section>

      {/* Continue Browsing + Recent Searches */}
      <div id="continue-browsing" className="grid lg:grid-cols-2 gap-6 mt-8">
        <Section title="Continue Browsing" href="/search" compact>
          {continueBrowsing.length === 0 ? (
            <EmptyRow text="Properties you view will show up here." />
          ) : (
            <div className="space-y-3">
              {continueBrowsing.map((l) => (
                <Link key={l.id} href={`/listing/${l.id}`} className="flex items-center gap-3 hover:bg-secondary/40 rounded-lg p-2 -mx-2">
                  <img
                    src={l.photos?.[0] || '/placeholder.jpg'}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{l.title || l.property_type}</p>
                    <p className="text-xs text-muted-foreground truncate">{l.location_text}</p>
                  </div>
                  <p className="text-sm font-bold text-primary whitespace-nowrap">₦{l.price_monthly?.toLocaleString()}/month</p>
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
                  className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-secondary/40 text-sm text-foreground"
                >
                  <span className="flex items-center gap-2"><Search size={13} className="text-muted-foreground" />{s.text}</span>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Recent Messages + Notifications */}
      <div className="grid lg:grid-cols-2 gap-6 mt-8 mb-8">
        <Section title="Recent Messages" href="/messages" compact>
          {recentMessages.length === 0 ? (
            <EmptyRow text="No conversations yet." />
          ) : (
            <div className="space-y-1">
              {recentMessages.map((c) => (
                <Link
                  key={c.partnerId}
                  href={`/messages?thread=${c.partnerId}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary/40"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {c.partnerName[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{c.partnerName}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{c.lastTime}</span>
                    {c.unread && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="Notifications" href="/notifications" compact>
          {notifications.length === 0 ? (
            <EmptyRow text="You're all caught up." />
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-secondary/40">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bell size={13} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{n.message || n.title || n.body || 'Notification'}</p>
                    <p className="text-[10px] text-muted-foreground">{n.created_at ? formatTime(n.created_at) : ''}</p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, title, text, href }: { icon: any; title: string; text: string; href: string }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-4 hover:border-primary transition-colors">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
        <Icon size={17} className="text-primary" />
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
    <section id={id} className={compact ? 'bg-card border border-border rounded-xl p-4' : ''}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={compact ? 'font-semibold text-foreground text-sm' : 'text-lg font-bold text-foreground'}>{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-primary flex items-center gap-0.5">
            View all <ChevronRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>
}

function ListingMini({ listing, verified }: { listing: Listing; verified?: boolean }) {
  return (
    <Link href={`/listing/${listing.id}`} className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative h-28">
        <img src={listing.photos?.[0] || '/placeholder.jpg'} alt="" className="w-full h-full object-cover" />
        {verified && (
          <span className="absolute top-2 left-2 bg-white/95 text-primary text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck size={10} /> Verified
          </span>
        )}
        <button className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
          <Heart size={11} />
        </button>
      </div>
      <div className="p-2.5">
        <p className="text-sm font-bold text-primary">₦{listing.price_monthly?.toLocaleString()}/month</p>
        <p className="text-xs text-muted-foreground truncate">{listing.property_type}</p>
        <p className="text-xs text-muted-foreground truncate">{listing.location_text}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
          <span className="flex items-center gap-0.5"><Bed size={10} />{listing.bedrooms}</span>
          {listing.bathrooms != null && <span className="flex items-center gap-0.5"><Bath size={10} />{listing.bathrooms}</span>}
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