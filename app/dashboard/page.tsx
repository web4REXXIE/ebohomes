'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Home,
  CheckCircle2,
  Clock,
  Star,
  Eye,
  MessageCircle,
  Plus,
  List,
  CreditCard,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function DashboardOverview() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState({ total: 0, published: 0, pending: 0, featured: 0, totalViews: 0, newEnquiries: 0 })
  const [attention, setAttention] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)

      const { data: listings } = await supabase
        .from('listings')
        .select('*')
        .eq('landlord_id', user.id)
        .order('created_at', { ascending: false })

      const total = listings?.length ?? 0
      const published = listings?.filter((l) => l.status === 'approved').length ?? 0
      const pending = listings?.filter((l) => l.status === 'pending').length ?? 0
      const featured = listings?.filter((l) => l.featured).length ?? 0
      const totalViews = listings?.reduce((sum, l) => sum + (l.views ?? 0), 0) ?? 0

      setStats({ total, published, pending, featured, totalViews, newEnquiries: 0 })
      setAttention(listings?.filter((l) => l.status === 'pending' || l.status === 'rejected').slice(0, 3) ?? [])

      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      setActivity(notifs ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-24 bg-card rounded-2xl border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  const STAT_CARDS = [
    { label: 'Total Listings', sub: 'All your properties', value: stats.total, icon: Home, color: 'bg-primary/10 text-primary' },
    { label: 'Published', sub: 'Live on EboHomes', value: stats.published, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pending Review', sub: 'Awaiting approval', value: stats.pending, icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Featured', sub: 'Currently featured', value: stats.featured, icon: Star, color: 'bg-amber-50 text-amber-500' },
    { label: 'Total Views', sub: 'All time views', value: stats.totalViews, icon: Eye, color: 'bg-blue-50 text-blue-600' },
    { label: 'New Enquiries', sub: 'This week', value: stats.newEnquiries, icon: MessageCircle, color: 'bg-purple-50 text-purple-600' },
  ]

  const QUICK_ACTIONS = [
    { label: 'Add New Property', sub: 'List a new property', icon: Plus, href: '/list-property', color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Feature a Property', sub: 'Get more visibility', icon: Star, href: '/dashboard/listings', color: 'bg-amber-50 text-amber-500' },
    { label: 'View My Listings', sub: 'Manage properties', icon: List, href: '/dashboard/listings', color: 'bg-blue-50 text-blue-600' },
    { label: 'Messages', sub: 'View messages', icon: MessageCircle, href: '/dashboard/messages', color: 'bg-purple-50 text-purple-600' },
    { label: 'Payments', sub: 'View transactions', icon: CreditCard, href: '/dashboard/payments', color: 'bg-primary/10 text-primary' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Good morning, {profile?.name?.split(' ')[0] ?? 'Landlord'} 👋</h1>
          <p className="text-sm text-muted-foreground">Welcome back! Here's what's happening with your properties.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-xs font-semibold text-foreground">{s.label}</p>
            <p className="text-[11px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground">Recent Activity</h2>
            <button onClick={() => router.push('/dashboard/notifications')} className="text-xs font-semibold text-primary">
              View All
            </button>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recent activity yet.</p>
          ) : (
            <div className="space-y-4">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={14} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Promote card */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl p-5 flex flex-col">
          <h3 className="font-bold text-foreground mb-1.5">Promote Your Listings</h3>
          <p className="text-xs text-muted-foreground mb-4 flex-1">
            Feature your properties to get up to 5× more views and receive more enquiries from serious tenants.
          </p>
          <button
            onClick={() => router.push('/dashboard/listings')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-full py-2.5"
          >
            Upgrade to Featured
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="font-bold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

      {/* Listings Requiring Attention */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-foreground">Listings Requiring Attention</h2>
          <button onClick={() => router.push('/dashboard/listings')} className="text-xs font-semibold text-primary flex items-center gap-1">
            View All <ArrowRight size={12} />
          </button>
        </div>
        {attention.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm">
            Nothing needs your attention right now 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {attention.map((l) => (
              <div key={l.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                <img src={l.photos?.[0] ?? '/placeholder.jpg'} alt={l.property_type} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{l.property_type}</p>
                  <p className="text-xs text-muted-foreground truncate">{l.location_text}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full shrink-0 ${
                  l.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                }`}>
                  {l.status === 'pending' ? 'Pending Review' : 'Rejected'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}