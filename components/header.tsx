'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Sun, Moon, LogOut, LayoutDashboard, Menu, X,
  Info, HelpCircle, Mail, PlusCircle, ChevronRight,
  Bell, Search as SearchIcon, Home as HomeIcon, Heart, MessageCircle,
} from 'lucide-react'
import { Button } from './ui/button'
import { ProfileMenu } from './profile-menu'
import { supabase } from '@/lib/supabase'

export function Header() {
  const router = useRouter()
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains('dark'))

    const fetchRole = async (userId: string) => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      if (error) console.error('Failed to fetch profile role:', error)
      setRole(profile?.role ?? null)
    }

    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id
      if (userId) { setLoggedIn(true); fetchRole(userId) }
      else { setLoggedIn(false); setRole(null) }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) { setLoggedIn(true); fetchRole(session.user.id) }
      else { setLoggedIn(false); setRole(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const toggleDarkMode = () => {
    if (!mounted) return
    document.documentElement.classList.toggle('dark')
    setIsDark(!isDark)
  }

  const handleListClick = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) { router.push('/login'); return }
    router.push('/dashboard')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setRole(null)
    setLoggedIn(false)
    setDrawerOpen(false)
    router.push('/')
  }

  const scrollToSection = (sectionId: string) => {
    setDrawerOpen(false)
    const element = document.getElementById(sectionId)
    if (element) element.scrollIntoView({ behavior: 'smooth' })
  }

  const dashboardHref = role === 'landlord' ? '/dashboard' : '/home'

  if (!mounted) {
    return (
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="h-10 w-36 bg-muted rounded-lg animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 bg-muted rounded-xl" />
            <div className="h-9 w-24 bg-muted rounded-xl" />
          </div>
        </div>
      </header>
    )
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="md:hidden p-2 rounded-xl hover:bg-muted text-foreground -ml-2"
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>

              <Link href="/" className="flex items-center gap-2 shrink-0">
                <img src="/logo-horizontal-compact.png" alt="EboHomes" className="h-16 sm:h-20 w-auto" />
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-7">
              <Link href="/" className="flex flex-col items-center gap-0.5 text-sm font-medium text-primary">
                <HomeIcon size={18} />
                Home
              </Link>
              <Link href="/search" className="flex flex-col items-center gap-0.5 text-sm font-medium text-foreground/70 hover:text-primary transition-colors">
                <SearchIcon size={18} />
                Properties
              </Link>
              {loggedIn && (
                <>
                  <Link href="/saved" className="flex flex-col items-center gap-0.5 text-sm font-medium text-foreground/70 hover:text-primary transition-colors">
                    <Heart size={18} />
                    Saved
                  </Link>
                  <Link href="/messages" className="flex flex-col items-center gap-0.5 text-sm font-medium text-foreground/70 hover:text-primary transition-colors">
                    <MessageCircle size={18} />
                    Messages
                  </Link>
                </>
              )}
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="flex flex-col items-center gap-0.5 text-sm font-medium text-foreground/70 hover:text-primary transition-colors"
              >
                <HelpCircle size={18} />
                How It Works
              </button>
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={toggleDarkMode}
                className="p-2.5 rounded-xl hover:bg-muted transition-colors text-foreground/70 hidden sm:inline-flex"
                aria-label="Toggle dark mode"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {!loggedIn && (
                <>
                  <Link href="/login">
                    <Button variant="outline" size="sm">Log in</Button>
                  </Link>
                  <Link href="/login?mode=signup">
                    <Button size="sm">Sign Up</Button>
                  </Link>
                </>
              )}

              {loggedIn && (
                <>
                  {role === 'landlord' && (
                    <Button onClick={handleListClick} size="sm" className="hidden sm:inline-flex">
                      + List Property
                    </Button>
                  )}

                  <button
                    className="p-2.5 rounded-xl hover:bg-muted transition-colors text-foreground/70 inline-flex"
                    aria-label="Notifications"
                  >
                    <Bell size={18} />
                  </button>

                  {/* Desktop: full dropdown */}
                  <div className="hidden sm:block">
                    <ProfileMenuWrapper />
                  </div>

                  {/* Mobile: tappable avatar → profile page */}
                  <div className="sm:hidden">
                    <MobileAvatarLink />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute top-0 left-0 h-full w-[82%] max-w-[320px] bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between h-20 px-5 border-b border-border shrink-0">
            <img src="/logo-horizontal-compact.png" alt="EboHomes" className="h-12 w-auto" />
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 -mr-2 rounded-xl hover:bg-muted text-foreground"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3">
            {loggedIn && role === 'landlord' && (
              <button
                onClick={() => { setDrawerOpen(false); handleListClick() }}
                className="w-full flex items-center gap-2 justify-center bg-primary text-primary-foreground font-semibold rounded-xl py-3 mb-5 text-sm"
              >
                <PlusCircle size={16} />
                List a Property
              </button>
            )}

            <DrawerGroup label="Explore">
              <DrawerItem href="/" label="Home" onClick={() => setDrawerOpen(false)} />
              <DrawerItem href="/search" label="Properties" onClick={() => setDrawerOpen(false)} />
              <DrawerItem
                icon={<HelpCircle size={18} />}
                label="How It Works"
                onClick={() => scrollToSection('how-it-works')}
                as="button"
              />
              <DrawerItem icon={<Info size={18} />} href="/about" label="About Us" onClick={() => setDrawerOpen(false)} />
              <DrawerItem icon={<Mail size={18} />} href="/contact" label="Contact" onClick={() => setDrawerOpen(false)} />
            </DrawerGroup>

            {loggedIn && (
              <DrawerGroup label="Account">
                <DrawerItem
                  icon={<LayoutDashboard size={18} />}
                  href={dashboardHref}
                  label="Dashboard"
                  onClick={() => setDrawerOpen(false)}
                />
              </DrawerGroup>
            )}

            <DrawerGroup label="Preferences">
              <DrawerItem
                icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
                label={isDark ? 'Light mode' : 'Dark mode'}
                onClick={toggleDarkMode}
                as="button"
              />
              {loggedIn && (
                <DrawerItem
                  icon={<LogOut size={18} />}
                  label="Logout"
                  onClick={handleLogout}
                  as="button"
                  danger
                />
              )}
            </DrawerGroup>

            {!loggedIn && (
              <div className="flex flex-col gap-2 mt-2 px-2">
                <Link href="/login" onClick={() => setDrawerOpen(false)}>
                  <Button variant="outline" className="w-full">Log in</Button>
                </Link>
                <Link href="/login?mode=signup" onClick={() => setDrawerOpen(false)}>
                  <Button className="w-full">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ProfileMenuWrapper() {
  const [email, setEmail] = useState('')
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email ?? ''))
  }, [])
  if (!email) return null
  return <ProfileMenu email={email} />
}

function MobileAvatarLink() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [initial, setInitial] = useState('?')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      setAvatarUrl(profile?.avatar_url ?? null)
      setInitial((profile?.full_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase())
    })
  }, [])

  return (
    <Link href="/profile" className="block" aria-label="Your profile">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
          {initial}
        </div>
      )}
    </Link>
  )
}

function DrawerGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-medium text-muted-foreground px-3 mb-1.5">{label}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function DrawerItem({
  href, label, icon, onClick, as = 'link', danger,
}: {
  href?: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  as?: 'link' | 'button'
  danger?: boolean
}) {
  const content = (
    <>
      <span className={`flex items-center gap-3 ${danger ? 'text-destructive' : 'text-foreground'}`}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </span>
      {as === 'link' && <ChevronRight size={15} className="text-muted-foreground/50" />}
    </>
  )

  const className = 'flex items-center justify-between px-3 py-3 rounded-xl hover:bg-muted transition-colors'

  if (as === 'button') {
    return <button onClick={onClick} className={`text-left ${className}`}>{content}</button>
  }
  return (
    <Link href={href!} onClick={onClick} className={className}>
      {content}
    </Link>
  )
}