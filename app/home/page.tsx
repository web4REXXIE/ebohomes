'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Search,
  Home as HomeIcon,
  MessageCircle,
  Star,
  Eye,
  ChevronRight,
  Bed,
  Bath,
  ShieldCheck,
  Heart,
  Bell,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

  const [savedCount, setSavedCount] = useState(0)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [searchCount, setSearchCount] = useState(0)
  const [viewCount, setViewCount] = useState(0)

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

    const [
      { count: saved },
      { count: unreadMsgs },
      { count: searches },
      { count: views },
    ] = await Promise.all([
      supabase.from('saved_properties').select('*', { count: 'exact', head: true }).eq('tenant_id', user.id),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).is('read_at', null),
      supabase.from('search_history').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('property_views').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    setSavedCount(saved ?? 0)
    setUnreadMsgCount(unreadMsgs ?? 0)
    setSearchCount(searches ?? 0)
    setViewCount(views ?? 0)

    // Recommended For You
    const { data: recs } = await supabase
      .from('listings')
      .select('*')
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

    // Recent Messages (top 3 conversations)
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(30)
    if (msgs && msgs.length > 0) {
      const byPartner = new Map<string, any>()
      for (const m of msgs) {
        const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id
        if (!byPartner.has(partnerId)) byPartner.set(partnerId, m)
      }
      const partnerIds = Array.from(byPartner.keys()).slice(0, 3)
      const { data: partners } = await supabase.from('profiles').select('id, full_name').in('id', partnerIds)
      const nameMap: Record<string, string> = {}
      ;(partners ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'User' })
      setRecentMessages(
        partnerIds.map((pid) => {
          const m = byPartner.get(pid)
          return {
            partnerId: pid,
            partnerName: nameMap[pid] ?? 'User',
            lastMessage: m.message,
            lastTime: formatTime(m.created_at),
            unread: m.receiver_id === user.id && !m.read_at,
          }
        })
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
        <p className="text-sm text-muted-foreground">Good morning,</p>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">{fullName} 👋</h1>
        <p className="text-sm text-muted-foreground mb-3">Ready to find your next home?</p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-full"
        >
          <Search size={16} />
          Search Homes
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={HomeIcon} value={savedCount} label="Saved Homes" href="/saved" />
        <StatCard icon={MessageCircle} value={unreadMsgCount} label="Unread Messages" href="/messages" />
        <StatCard icon={Star} value={searchCount} label="Recent Searches" href="#recent-searches" />
        <StatCard icon={Eye} value={viewCount} label="Properties Viewed" href="#continue-browsing" />
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
                    src={l.photos?.[0] || '/placeholder-property.jpg'}
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
                  href={`/messages?to=${c.partnerId}`}
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

function StatCard({ icon: Icon, value, label, href }: { icon: any; value: number; label: string; href: string }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-4 hover:border-primary transition-colors">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
        <Icon size={17} className="text-primary" />
      </div>
      <p className="text-2xl font-extrabold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  )
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
        <img src={listing.photos?.[0] || '/placeholder-property.jpg'} alt="" className="w-full h-full object-cover" />
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