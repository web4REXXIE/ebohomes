'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  Sun, Moon, LogOut, LayoutDashboard, Menu, X,
  Info, HelpCircle, Mail, PlusCircle, ChevronRight,
  Bell, Search as SearchIcon, Home as HomeIcon, Heart,
  UserCircle, ChevronDown,
} from 'lucide-react'
import { Button, buttonVariants } from './ui/button'
import { ProfileMenu } from './profile-menu'
import { InstallButton } from '@/components/install-button'
import { NotificationBell } from '@/components/notification-bell'
import { supabase } from '@/lib/supabase'
import { dashboardLinks, isDashboardPath } from '@/lib/dashboard-links'
import { BRAND_LOGOS } from '@/lib/brand'
import { useDismissable } from '@/lib/use-dismissable'
import { cn } from '@/lib/utils'

// Stage 6: premium navigation. All state, auth, role and routing logic is unchanged.
// - Transparent brand logos (onLight / onDark) replace logo-header.png and the invert filter.
// - Desktop: Home link dropped (the logo goes home), Saved and Messages move to the account menu below
//   1024px, and a Dashboard drop-down gives tenants and landlords their role links on desktop.
// - Log in / Sign Up are real links styled as buttons (no button nested inside a link).
// - Safe-area padding on the bar and the mobile menu.
// - Mobile menu keeps its focus trap, Escape-to-close and focus return.

// Brand logo: green lockup on light, white lockup on dark. Two files, no filters or blend modes.
function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src={BRAND_LOGOS.onLight} alt="EboHomes" width={1280} height={392} className={cn('w-auto dark:hidden', className)} />
      <img src={BRAND_LOGOS.onDark} alt="" aria-hidden="true" width={799} height={210} className={cn('hidden w-auto dark:block', className)} />
    </>
  )
}

const desktopLink = (active: boolean, display = 'inline-flex') =>
  `${display} relative h-full items-center rounded-chip px-0.5 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full ${
    active
      ? 'text-foreground after:bg-primary'
      : 'text-foreground-secondary hover:text-foreground after:bg-transparent hover:after:bg-border-strong'
  }`

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openerRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const restoreFocusRef = useRef(false)

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

  const openDrawer = () => {
    openerRef.current = document.activeElement as HTMLElement | null
    setDrawerOpen(true)
  }

  // Used by the close button, the dark overlay and Escape. Focus goes back to the button that opened the menu.
  const closeDrawer = () => {
    restoreFocusRef.current = true
    setDrawerOpen(false)
  }

  // Focus moves into the menu when it opens and returns to the opener when it is dismissed
  useEffect(() => {
    if (drawerOpen) {
      wasOpenRef.current = true
      closeButtonRef.current?.focus()
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      if (restoreFocusRef.current) openerRef.current?.focus()
      restoreFocusRef.current = false
    }
  }, [drawerOpen])

  // Escape closes the mobile menu, and Tab stays inside it while it is open
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        restoreFocusRef.current = true
        setDrawerOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const panel = dialogRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!panel.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
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

  // Highlights the link for the page you are on
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  if (!mounted) {
    return (
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-card/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] shadow-nav backdrop-blur-sm">
        <div className="container-wide flex h-16 items-center justify-between lg:h-[72px]">
          <Link href="/" className="flex shrink-0 items-center" aria-label="EboHomes home">
            <Logo className="h-10 lg:h-11" />
          </Link>
          <div className="flex items-center gap-2" aria-hidden="true">
            <div className="h-9 w-20 rounded-button bg-muted" />
            <div className="h-9 w-24 rounded-button bg-muted" />
          </div>
        </div>
      </header>
    )
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-card/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] shadow-nav backdrop-blur-sm">
        <div className="container-wide">
          <div className="flex h-16 items-center justify-between gap-4 lg:h-[72px]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openDrawer}
                className="-ml-2 flex h-11 w-11 items-center justify-center rounded-button text-foreground hover:bg-muted focus-ring md:hidden"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                aria-controls="mobile-menu"
              >
                <Menu size={22} />
              </button>

              <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="EboHomes home">
                <Logo className="h-10 lg:h-11" />
              </Link>
            </div>

            <nav aria-label="Main" className="hidden h-full items-stretch gap-6 md:flex lg:gap-8">
              <Link href="/search" className={desktopLink(isActive('/search'))} aria-current={isActive('/search') ? 'page' : undefined}>
                Properties
              </Link>
              {loggedIn && <DesktopDashboardMenu role={role} pathname={pathname} />}
              {loggedIn && (
                <>
                  <Link href="/saved" className={desktopLink(isActive('/saved'), 'hidden lg:inline-flex')} aria-current={isActive('/saved') ? 'page' : undefined}>
                    Saved
                  </Link>
                  <Link href="/messages" className={desktopLink(isActive('/messages'), 'hidden lg:inline-flex')} aria-current={isActive('/messages') ? 'page' : undefined}>
                    Messages
                  </Link>
                </>
              )}
              <button type="button" onClick={() => scrollToSection('how-it-works')} className={desktopLink(false)}>
                How It Works
              </button>
              <Link href="/about" className={desktopLink(isActive('/about'), 'hidden lg:inline-flex')} aria-current={isActive('/about') ? 'page' : undefined}>
                About
              </Link>
              <Link href="/contact" className={desktopLink(isActive('/contact'), 'hidden lg:inline-flex')} aria-current={isActive('/contact') ? 'page' : undefined}>
                Contact
              </Link>
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <InstallButton variant="header" />
              <button
                type="button"
                onClick={toggleDarkMode}
                className="hidden h-10 w-10 items-center justify-center rounded-button text-foreground-secondary transition-colors hover:bg-muted hover:text-foreground focus-ring sm:inline-flex"
                aria-label="Toggle dark mode"
                aria-pressed={isDark}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {!loggedIn && (
                <>
                  {/* Below 380px only Sign Up shows here; Log in stays in the menu */}
                  <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-10 max-[380px]:hidden sm:h-9')}>
                    Log in
                  </Link>
                  <Link href="/login?mode=signup" className={cn(buttonVariants({ size: 'sm' }), 'h-10 sm:h-9')}>
                    Sign Up
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
                    onClick={openDrawer}
                    className="flex h-11 w-11 items-center justify-center rounded-full focus-ring sm:hidden"
                    aria-label="Open account menu"
                    aria-expanded={drawerOpen}
                    aria-controls="mobile-menu"
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
        id="mobile-menu"
        inert={!drawerOpen}
        aria-hidden={!drawerOpen}
        className={`fixed inset-0 z-50 transition-opacity duration-300 md:hidden ${
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className="absolute inset-0 bg-forest/60"
          aria-hidden="true"
          onClick={closeDrawer}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute left-0 top-0 flex h-full w-[85%] max-w-[330px] flex-col bg-surface-elevated pl-[env(safe-area-inset-left)] shadow-modal transition-transform duration-300 ease-out motion-reduce:transition-none ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div
            className="flex min-h-16 shrink-0 items-center justify-between border-b border-border-subtle px-5"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <Logo className="h-10" />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-button text-foreground hover:bg-muted focus-ring"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <div
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {loggedIn && <DrawerAccountCard onNavigate={() => setDrawerOpen(false)} />}

            {loggedIn && role === 'landlord' && (
              <button
                type="button"
                onClick={() => { setDrawerOpen(false); handleListClick() }}
                className="mb-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-primary py-3 text-label font-semibold text-primary-foreground focus-ring"
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
              <div className="mt-2 flex flex-col gap-2 px-2">
                <Link href="/login" onClick={() => setDrawerOpen(false)} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
                  Log in
                </Link>
                <Link href="/login?mode=signup" onClick={() => setDrawerOpen(false)} className={cn(buttonVariants(), 'w-full')}>
                  Sign Up
                </Link>
              </div>
            )}

            <p className="mt-6 px-3 text-caption text-muted-foreground">EboHomes. Real Estate You Can Trust.</p>
          </div>
        </div>
      </div>
    </>
  )
}

// Desktop "Dashboard" drop-down. Same role links as the mobile menu and bottom bar (lib/dashboard-links).
function DesktopDashboardMenu({ role, pathname }: { role: string | null; pathname: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismissable(open, close, wrapRef, triggerRef)

  const links = dashboardLinks(role)
  const active = isDashboardPath(pathname)

  return (
    <div ref={wrapRef} className="relative flex h-full items-stretch">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="desktop-dashboard-menu"
        className={`${desktopLink(active)} gap-1`}
      >
        Dashboard
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id="desktop-dashboard-menu"
          className="absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-card border border-border bg-surface-elevated py-1 shadow-dropdown"
        >
          {links.map((l) => {
            const current = pathname === l.href
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-10 items-center px-4 text-label font-medium transition-colors focus-visible:bg-muted focus-visible:outline-none ${
                  current ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
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
      className="flex items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
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
      className="mb-5 flex items-center gap-3 rounded-card border border-border bg-secondary/40 p-3 focus-ring"
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
      <p className="mb-1.5 px-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
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
  const pathname = usePathname()
  const active = as === 'link' && !!href && (href === '/' ? pathname === '/' : pathname.startsWith(href))

  const content = (
    <>
      <span className={`flex items-center gap-3 ${danger ? 'text-destructive' : 'text-foreground'}`}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </span>
      {as === 'link' && <ChevronRight size={15} className="text-muted-foreground/50" />}
    </>
  )

  const className = `flex min-h-[46px] items-center justify-between rounded-button px-3 py-3 transition-colors hover:bg-muted focus-ring ${
    active ? 'bg-accent' : ''
  }`

  if (as === 'button') {
    return <button type="button" onClick={onClick} className={`text-left ${className}`}>{content}</button>
  }
  return (
    <Link href={href!} onClick={onClick} className={className} aria-current={active ? 'page' : undefined}>
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
        className="flex min-h-[46px] w-full items-center justify-between rounded-button px-3 py-3 text-left transition-colors hover:bg-muted focus-ring"
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
              className="flex min-h-[42px] items-center rounded-button px-3 py-2 text-sm text-foreground hover:bg-muted focus-ring"
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
                 }
