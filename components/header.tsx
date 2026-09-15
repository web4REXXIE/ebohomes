'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sun, Moon, LogOut, LayoutDashboard, Menu, X } from 'lucide-react'
import { Button } from './ui/button'
import { supabase } from '@/lib/supabase'

export function Header() {
  const router = useRouter()
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isDarkMode = document.documentElement.classList.contains('dark')
    setIsDark(isDarkMode)

    const fetchRole = async (userId: string) => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch profile role:', error)
      }
      setRole(profile?.role ?? null)
    }

    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id
      if (userId) {
        setLoggedIn(true)
        fetchRole(userId)
      } else {
        setLoggedIn(false)
        setRole(null)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setLoggedIn(true)
        fetchRole(session.user.id)
      } else {
        setLoggedIn(false)
        setRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const toggleDarkMode = () => {
    if (!mounted) return
    document.documentElement.classList.toggle('dark')
    setIsDark(!isDark)
  }

  const handleListClick = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      router.push('/login')
      return
    }
    router.push('/dashboard')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setRole(null)
    setLoggedIn(false)
    router.push('/')
  }

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) element.scrollIntoView({ behavior: 'smooth' })
  }

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
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-xl hover:bg-muted text-foreground -ml-2"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <Link href="/" className="flex items-center gap-2 shrink-0">
              <img src="/logo-horizontal-compact.png" alt="EboHomes" className="h-16 sm:h-20 w-auto" />
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
            >
              About
            </button>

            {loggedIn && role === 'tenant' && (
              <>
                <Link href="/home" className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
                  <LayoutDashboard size={16} />
                  Dashboard
                </Link>
                <Link href="/search" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
                  Search Properties
                </Link>
              </>
            )}

            {loggedIn && role === 'landlord' && (
              <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
                <LayoutDashboard size={16} />
                Dashboard
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
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
                  <Button variant="outline" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link href="/login?mode=signup">
                  <Button size="sm">
                    Sign Up
                  </Button>
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
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 sm:px-3 py-2"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </div>
        </div>

        {mobileOpen && (
          <nav className="md:hidden flex flex-col gap-1 pb-4 pt-2 border-t border-border">
            <Link href="/" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              Home
            </Link>
            <Link href="/search" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              Properties
            </Link>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-left text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
            >
              How It Works
            </button>
            <Link href="/about" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              About Us
            </Link>
            <Link href="/contact" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              Contact
            </Link>

            {loggedIn && role === 'tenant' && (
              <>
                <Link href="/home" className="text-sm font-medium text-foreground py-2.5 px-2 rounded-lg hover:bg-muted flex items-center gap-2">
                  <LayoutDashboard size={16} />
                  Dashboard
                </Link>
                <Link href="/search" className="text-sm font-medium text-foreground py-2.5 px-2 rounded-lg hover:bg-muted">
                  Search Properties
                </Link>
              </>
            )}
            {loggedIn && role === 'landlord' && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-foreground py-2.5 px-2 rounded-lg hover:bg-muted">
                  Dashboard
                </Link>
                <button
                  onClick={handleListClick}
                  className="text-left text-sm font-medium text-primary py-2.5 px-2 rounded-lg hover:bg-muted"
                >
                  + List Property
                </button>
              </>
            )}
            {loggedIn && (
              <button
                onClick={() => { handleLogout(); setMobileOpen(false) }}
                className="text-left text-sm font-medium text-foreground py-2.5 px-2 rounded-lg hover:bg-muted flex items-center gap-2"
              >
                <LogOut size={16} />
                Logout
              </button>
            )}
            <button
              onClick={toggleDarkMode}
              className="text-left text-sm font-medium text-foreground py-2.5 px-2 rounded-lg hover:bg-muted flex items-center gap-2"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
          </nav>
        )}
      </div>
    </header>
  )
}