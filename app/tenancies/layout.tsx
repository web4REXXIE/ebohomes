'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { TenantAccountShell } from '@/components/tenant-account-shell'

// Stage 18b: tenants see these pages inside their dashboard shell (sidebar, phone menu).
// These routes are also opened by landlords and staff (for example the handover page that the
// landlord payouts page links to), so everyone who is not signed in as a tenant keeps the public
// header and footer exactly as before. This layout only picks the frame. Each page still does its
// own access check, and nothing here redirects or grants access.
type Mode = 'checking' | 'tenant' | 'public'

export default function TenanciesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<Mode>('checking')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (alive) setMode('public')
          return
        }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (alive) setMode(profile?.role === 'tenant' ? 'tenant' : 'public')
      } catch {
        // If the role cannot be read, fall back to the frame these pages always had.
        if (alive) setMode('public')
      }
    })()
    return () => { alive = false }
  }, [])

  if (mode === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  }

  if (mode === 'tenant') {
    return <TenantAccountShell>{children}</TenantAccountShell>
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
