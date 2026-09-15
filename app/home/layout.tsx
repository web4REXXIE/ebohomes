'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Search,
  Heart,
  MessageCircle,
  FileText,
  User,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAV = [
  { label: 'Dashboard', href: '/home', icon: LayoutDashboard },
  { label: 'Search Homes', href: '/search', icon: Search },
  { label: 'Saved Homes', href: '/saved', icon: Heart },
  { label: 'Messages', href: '/messages', icon: MessageCircle, badgeKey: 'messages' },
  { label: 'Applications', href: '/applications', icon: FileText },
  { label: 'Profile', href: '/profile', icon: User },
  { label: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'notifications' },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
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

      if (!profileData || profileData.role === 'landlord') {
        router.push('/dashboard')
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

      setUnreadMessages(msgCount ?? 0)
      setUnreadNotifs(notifCount ?? 0)
      setLoading(false)
    }

    checkAccess()
  }, [router])

  // ---- keep badges live ----
  useEffect(() => {
    if (!profile?.id) return

    const refreshMessages = async () => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', profile.id)
        .is('read_at', null)
      setUnreadMessages(count ?? 0)
    }

    const refreshNotifs = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('read', false)
      setUnreadNotifs(count ?? 0)
    }

    const channel = supabase
      .channel(`home-live-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refreshMessages)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, refreshNotifs)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

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
              <LayoutDashboard size={18} className="text-primary-foreground" />
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
            const badge = item.badgeKey === 'messages' ? unreadMessages : item.badgeKey === 'notifications' ? unreadNotifs : 0
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
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          >
            <LogOut size={17} />
            Logout
          </button>
        </nav>

        <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-emerald-950 to-primary text-white">
          <p className="font-bold text-sm mb-1">List Your Property</p>
          <p className="text-xs text-white/70 mb-3 leading-relaxed">
            Reach thousands of verified tenants.
          </p>
          <Link
            href="/list-property"
            className="block text-center bg-white text-foreground text-xs font-bold rounded-full py-2"
          >
            Get Started
          </Link>
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() ?? 'T'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name ?? 'Tenant'}</p>
            <p className="text-xs text-muted-foreground">Tenant</p>
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
          <Link href="/notifications" className="relative w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
            <Bell size={16} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadNotifs}
              </span>
            )}
          </Link>
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
                  const badge = item.badgeKey === 'messages' ? unreadMessages : item.badgeKey === 'notifications' ? unreadNotifs : 0
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
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground"
                >
                  <LogOut size={17} />
                  Logout
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-center justify-around py-2 lg:hidden">
          {[
            { label: 'Home', href: '/home', icon: LayoutDashboard },
            { label: 'Search', href: '/search', icon: Search },
            { label: 'Saved', href: '/saved', icon: Heart },
            { label: 'Messages', href: '/messages', icon: MessageCircle, badge: unreadMessages },
            { label: 'Profile', href: '/profile', icon: User },
          ].map((item) => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 relative px-2">
                <item.icon size={19} className={active ? 'text-primary' : 'text-muted-foreground'} />
                <span className={`text-[10px] ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{item.label}</span>
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -top-0.5 right-0 bg-primary text-primary-foreground text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="pb-16 lg:pb-0">{children}</div>
      </div>
    </div>
  )
}