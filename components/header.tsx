'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  Sun, Moon, LogOut, LayoutDashboard, Menu, X,
  Info, HelpCircle, Mail, PlusCircle, ChevronRight,
  Bell, Search as SearchIcon, Home as HomeIcon, Heart, MessageCircle,
  UserCircle, ChevronDown,
} from 'lucide-react'
import { Button } from './ui/button'
import { ProfileMenu } from './profile-menu'
import { InstallButton } from '@/components/install-button'
import { NotificationBell } from '@/components/notification-bell'
import { supabase } from '@/lib/supabase'
import { dashboardLinks } from '@/lib/dashboard-links'

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains('dark'))

    const fetchRole = async (userId: string) => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()
        if (error) {
          // Network or database problem: keep the last known role
          console.error('Failed to fetch profile role:', error.message)
          return
        }
        setRole(profile?.role ?? null)
      } catch (err) {
        console.error('Unexpected profile role error:', err)
      }
    }

    supabase.auth
      .getUser()
      .then(({ data }) => {
        const userId = data?.user?.id
        if (userId) { setLoggedIn(true); fetchRole(userId) }
        else { setLoggedIn(false); setRole(null) }
      })
      .catch((err) => console.error('Failed to check user:', err))

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

  // Escape closes the mobile menu
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Close the menu whenever the page changes
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

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
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    } else {
      router.push(`/#${sectionId}`)
    }
  }

  const dashboardHref = role === 'landlord' ? '/dashboard' : '/home'

  // Highlights the link for the page you are on
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))
  const navLink = (href: string) =>
    `flex flex-col items-center gap-0.5 text-sm font-medium transition-colors ${
      isActive(href) ? 'text-primary' : 'text-foreground/70 hover:text-primary'
    }`

  if (!mounted) {
    return (
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between">
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
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="md:hidden flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted text-foreground -ml-2"
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>

              <Link href="/" className="flex items-center gap-2 shrink-0">
                <img
                  src="/logo-horizontal-compact.png"
                  alt="EboHomes"
                  className="h-11 w-auto sm:h-12 lg:h-14 mix-blend-multiply dark:mix-blend-normal"
                />
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-7">
              <Link href="/" className={navLink('/')} aria-current={isActive('/') ? 'page' : undefined}>
                <HomeIcon size={18} />
                Home
              </Link>
              <Link href="/search" className={navLink('/search')} aria-current={isActive('/search') ? 'page' : undefined}>
                <SearchIcon size={18} />
                Properties
              </Link>
              {loggedIn && (
                <>
                  <Link href="/saved" className={navLink('/saved')} aria-current={isActive('/saved') ? 'page' : undefined}>
                    <Heart size={18} />
                    Saved
                  </Link>
                  <Link href="/messages" className={navLink('/messages')} aria-current={isActive('/messages') ? 'page' : undefined}>
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
              <InstallButton variant="header" />
              <button
                onClick={toggleDarkMode}
                className="p-2.5 rounded-xl hover:bg-muted transition-colors text-foreground/70 hidden sm:inline-flex"
                aria-label="Toggle dark mode"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {!loggedIn && (
                <>
                  {/* Below 380px only Sign Up shows here; Log in stays in the menu */}
                  <Link href="/login" className="max-[380px]:hidden">
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

                <NotificationBell />

                  {/* Desktop: full dropdown */}
                  <div className="hidden sm:block">
                    <ProfileMenuWrapper />
                  </div>

                  {/* Mobile: tappable avatar opens the menu */}
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="flex h-11 w-11 items-center justify-center sm:hidden"
                    aria-label="Open account menu"
                  >
                    <Avatar size={36} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        inert={!drawerOpen}
        aria-hidden={!drawerOpen}
        className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setDrawerOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute top-0 left-0 h-full w-[85%] max-w-[330px] bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between h-16 px-5 border-b border-border shrink-0">
            <img src="/logo-horizontal-compact.png" alt="EboHomes" className="h-10 w-auto mix-blend-multiply dark:mix-blend-normal" />
            <button
              onClick={() => setDrawerOpen(false)}
              className="flex h-11 w-11 items-center justify-center -mr-2 rounded-xl hover:bg-muted text-foreground"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <div
            className="flex-1 overflow-y-auto py-4 px-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {loggedIn && <DrawerAccountCard onNavigate={() => setDrawerOpen(false)} />}

            {loggedIn && role === 'landlord' && (
              <button
                onClick={() => { setDrawerOpen(false); handleListClick() }}
                className="w-full flex items-center gap-2 justify-center bg-primary text-primary-foreground font-semibold rounded-xl py-3 mb-5 text-sm"
              >
                <PlusCircle size={16} />
                Post a Listing
              </button>
            )}

            <DrawerGroup label="Explore">
              <DrawerItem icon={<HomeIcon size={18} />} href="/" label="Home" onClick={() => setDrawerOpen(false)} />
              <DrawerItem icon={<SearchIcon size={18} />} href="/search" label="Properties" onClick={() => setDrawerOpen(false)} />
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
                <DrawerDropdown
                  icon={<LayoutDashboard size={18} />}
                  label="Dashboard"
                  items={dashboardLinks(role)}
                  onNavigate={() => setDrawerOpen(false)}
                />
                <DrawerItem
                  icon={<Heart size={18} />}
                  href="/saved"
                  label="Favourites"
                  onClick={() => setDrawerOpen(false)}
                />
                <DrawerItem
                  icon={<Bell size={18} />}
                  href="/notifications"
                  label="Notifications"
                  onClick={() => setDrawerOpen(false)}
                />
                <DrawerItem
                  icon={<UserCircle size={18} />}
                  href="/profile"
                  label="Settings"
                  onClick={() => setDrawerOpen(false)}
                />
                <DrawerItem
                  icon={<LogOut size={18} />}
                  label="Sign out"
                  onClick={handleLogout}
                  as="button"
                  danger
                />
              </DrawerGroup>
            )}
             <InstallButton variant="drawer" />
            <DrawerGroup label="Preferences">
              <DrawerItem
                icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
                label={isDark ? 'Light mode' : 'Dark mode'}
                onClick={toggleDarkMode}
                as="button"
              />
            </DrawerGroup>

            {!loggedIn && (
              <div className="flex flex-col gap-2 mt-2 px-2">
                <Link href="/login" onClick={() => setDrawerOpen(false)}>
                  <Button variant="outline" className="w-full h-11">Log in</Button>
                </Link>
                <Link href="/login?mode=signup" onClick={() => setDrawerOpen(false)}>
                  <Button className="w-full h-11">Sign Up</Button>
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
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data?.user?.email ?? ''))
      .catch((err) => console.error('Failed to load email:', err))
  }, [])
  if (!email) return null
  return <ProfileMenu email={email} />
}

// Small hook-like helper: loads the signed-in person's name, email and photo
function useAccountInfo() {
  const [info, setInfo] = useState<{ name: string; email: string; avatarUrl: string | null }>({
    name: '',
    email: '',
    avatarUrl: null,
  })

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        const user = data?.user
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle()
        setInfo({
          name: profile?.full_name ?? '',
          email: user.email ?? '',
          avatarUrl: profile?.avatar_url ?? null,
        })
      })
      .catch((err) => console.error('Failed to load account info:', err))
  }, [])

  return info
}

function Avatar({ size = 36 }: { size?: number }) {
  const { name, email, avatarUrl } = useAccountInfo()
  const initial = (name?.[0] ?? email?.[0] ?? '?').toUpperCase()
  const style = { width: size, height: size }

  return avatarUrl ? (
    <img src={avatarUrl} alt="" style={style} className="rounded-full object-cover" />
  ) : (
    <div
      style={style}
      className="rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm"
    >
      {initial}
    </div>
  )
}

function DrawerAccountCard({ onNavigate }: { onNavigate: () => void }) {
  const { name, email } = useAccountInfo()

  return (
    <Link
      href="/profile"
      onClick={onNavigate}
      className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3"
    >
      <Avatar size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{name || 'My account'}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground/60" />
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

  const className =
    'flex min-h-[46px] items-center justify-between px-3 py-3 rounded-xl hover:bg-muted transition-colors'

  if (as === 'button') {
    return <button onClick={onClick} className={`text-left ${className}`}>{content}</button>
  }
  return (
    <Link href={href!} onClick={onClick} className={className}>
      {content}
    </Link>
  )
}

// "Dashboard" row that opens a drop-down with the tools inside the dashboard
function DrawerDropdown({
  icon, label, items, onNavigate,
}: {
  icon: React.ReactNode
  label: string
  items: { label: string; href: string }[]
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[46px] w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-3 text-foreground">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </span>
        <ChevronDown size={15} className={`text-muted-foreground/60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mb-1 ml-6 mt-1 flex flex-col border-l border-border pl-3">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={onNavigate}
              className="flex min-h-[42px] items-center rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}