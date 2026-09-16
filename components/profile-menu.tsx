'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User, Calendar, Heart, MessageCircle, Settings, LogOut, ChevronDown, Building2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Profile = {
  full_name: string | null
  role: string | null
  avatar_url: string | null
}

export function ProfileMenu({ email }: { email: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data?.user?.id
      if (!userId) return
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', userId)
        .maybeSingle()
      setProfile(p)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    setOpen(false)
    router.push('/')
  }

  const isLandlord = profile?.role === 'landlord'
  const initial = profile?.full_name?.[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? '?'

  const menuItems = isLandlord
    ? [
        { href: '/profile', label: 'My Profile', desc: 'View and edit your details', icon: User },
        { href: '/dashboard', label: 'My Listings', desc: 'Manage your properties', icon: Building2 },
        { href: '/messages', label: 'Messages', desc: 'Chat with tenants', icon: MessageCircle },
        { href: '/settings', label: 'Settings', desc: 'App preferences', icon: Settings },
      ]
    : [
        { href: '/profile', label: 'My Profile', desc: 'View and edit your details', icon: User },
        { href: '/bookings', label: 'My Bookings', desc: 'Upcoming & past rentals', icon: Calendar },
        { href: '/saved', label: 'Saved Properties', desc: 'Your favourite homes', icon: Heart },
        { href: '/messages', label: 'Messages', desc: 'Chat with landlords', icon: MessageCircle },
        { href: '/settings', label: 'Settings', desc: 'App preferences', icon: Settings },
      ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-muted transition-colors"
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            {initial}
          </div>
        )}
        <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {profile?.full_name ?? 'Your Account'}
              </p>
              <span className="inline-block text-[10px] font-medium bg-secondary text-muted-foreground px-2 py-0.5 rounded-full capitalize mt-0.5">
                {profile?.role ?? 'user'}
              </span>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
            </div>
          </div>

          <div className="py-1">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors"
              >
                <item.icon size={17} className="text-muted-foreground shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.desc}</span>
                </span>
              </Link>
            ))}
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-border text-destructive hover:bg-destructive/5 transition-colors text-left"
          >
            <LogOut size={17} />
            <span className="text-sm font-medium">Log Out</span>
          </button>
        </div>
      )}
    </div>
  )
}