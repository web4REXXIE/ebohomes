'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Only landlords can list a property. Same rule as the dashboard layout:
// signed-out people go to login, everyone else who is not a landlord goes home.
// This keeps tenants off the form. The database must still refuse their insert (see the check below).
export default function ListPropertyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login?redirect=/list-property')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (!active) return
      if (profile?.role !== 'landlord') {
        router.replace('/')
        return
      }
      setAllowed(true)
    }
    check()
    return () => { active = false }
  }, [router])

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Checking access">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  }

  return <>{children}</>
}
