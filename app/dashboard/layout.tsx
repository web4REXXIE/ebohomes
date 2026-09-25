'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  List,
  Plus,
  MessageCircle,
  BarChart3,
  CreditCard,
  Heart,
  User,
  HelpCircle,
  Star,
  Bell,
  Menu,
  X,
  ShieldCheck,
  FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Listings', href: '/dashboard/listings', icon: List },
  { label: 'Applications', href: '/dashboard/applications', icon: FileText, badgeKey: 'applications' },
  { label: 'Get Verified', href: '/dashboard/verify', icon: ShieldCheck },
  { label: 'Add New Listing', href: '/list-property', icon: Plus },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageCircle, badgeKey: 'messages' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { label: 'Saved', href: '/dashboard/saved', icon: Heart },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Help & Support', href: '/dashboard/support', icon: HelpCircle },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [pendingApplications, setPendingApplications] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profileData || profileData.role !== 'landlord') {
        router.push('/')
        return
      }

      setProfile(profileData)

      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .is('read_at', null)

      const { count: notifCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)

      const { count: pendingAppCount } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('landlord_id', user.id)
        .eq('status', 'pending')

      setUnreadMessages(msgCount ?? 0)
      setUnreadNotifs(notifCount ?? 0)
      setPendingApplications(pendingAppCount ?? 0)
      setLoading(false)
    }

    checkAccess()
  }, [router])

  // ---- keep the unread messages badge live without needing a page reload ----
  useEffect(() => {
    if (!profile?.id) return

    const refreshUnread = async () => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', profile.id)
        .is('read_at', null)
      setUnreadMessages(count ?? 0)
    }

    const channel = supabase
      .channel(`sidebar-unread-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refreshUnread)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card shrink-0 h-screen sticky top-0">
        <div className="p-5 border-b border-border">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <List size={18} className="text-primary-foreground" />
            </div>
            <div>
              <p className="font-extrabold text-foreground text-sm leading-none">EboHomes</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Find Homes. Skip the Stress.</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href
            const badge = item.badgeKey === 'messages' ? unreadMessages : item.badgeKey === 'applications' ? pendingApplications : 0
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon size={17} />
                  {item.label}
                </span>
                {badge > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-emerald-950 to-primary text-white">
          <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center mb-3">
            <Star size={16} className="text-amber-400" />
          </div>
          <p className="font-bold text-sm mb-1">Feature Your Property</p>
          <p className="text-xs text-white/70 mb-3 leading-relaxed">
            Get more visibility and attract serious tenants.
          </p>
          <Link
            href="/dashboard/listings"
            className="block text-center bg-white text-foreground text-xs font-bold rounded-full py-2"
          >
            Upgrade Now
          </Link>
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {profile?.name?.[0]?.toUpperCase() ?? 'L'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.name ?? 'Landlord'}</p>
            <p className="text-xs text-muted-foreground">Landlord</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 sm:px-6 py-3 flex items-center justify-between lg:hidden">
          <button onClick={() => setMobileNavOpen(true)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <Menu size={18} />
          </button>
          <span className="font-extrabold text-primary">EboHomes</span>
          <button className="relative w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <Bell size={16} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadNotifs}
              </span>
            )}
          </button>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 bg-card shadow-xl flex flex-col">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <span className="font-extrabold text-primary">EboHomes</span>
                <button onClick={() => setMobileNavOpen(false)}><X size={20} /></button>
              </div>
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV.map((item) => {
                  const active = pathname === item.href
                  const badge = item.badgeKey === 'messages' ? unreadMessages : item.badgeKey === 'applications' ? pendingApplications : 0
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      <span className="flex items-center gap-3"><item.icon size={17} />{item.label}</span>
                      {badge > 0 && <span className="bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{badge}</span>}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}