'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    const go = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user

      if (!user) {
        router.replace('/login')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const role = data?.role

      if (role === 'landlord') {
        router.replace('/dashboard/profile')
      } else if (role === 'admin') {
        router.replace('/admin')
      } else {
        router.replace('/profile')
      }
    }
    go()
  }, [router])

  return null
}