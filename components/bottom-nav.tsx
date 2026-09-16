'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Heart, LayoutDashboard, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchRole = async (userId: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      setRole(profile?.role ?? null)
    }

    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id
      if (userId) { setLoggedIn(true); fetchRole(userId) }
      else { setLoggedIn(false); setRole(null) }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setLoggedIn(true); fetchRole(session.user.id) }
      else { setLoggedIn(false); setRole(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const dashboardHref = role === 'landlord' ? '/dashboard' : '/home'

  const guard = (href: string) => (e: React.MouseEvent) => {
    if (!loggedIn) {
      e.preventDefault()
      router.push('/login')
    }
  }

  const tabs = [
    { href: '/', label: 'Home', icon: Home, protect: false },
    { href: '/search', label: 'Search', icon: Search, protect: false },
    { href: '/saved', label: 'Saved', icon: Heart, protect: true },
    { href: dashboardHref, label: 'Dashboard', icon: LayoutDashboard, protect: true },
    { href: loggedIn ? '/profile' : '/login', label: loggedIn ? 'Profile' : 'Log in', icon: User, protect: false },
  ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href
        const Icon = tab.icon
        return (
          <Link
            key={tab.label}
            href={tab.href}
            onClick={tab.protect ? guard(tab.href) : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5"
          >
            <Icon
              size={22}
              className={active ? 'text-primary' : 'text-muted-foreground'}
              strokeWidth={active ? 2.4 : 2}
            />
            <span className={`text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}