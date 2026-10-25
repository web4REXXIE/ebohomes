'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

// My Applications now lives inside My Rental Journey, so there is one place to follow an application.
// This page stays only so old links, bookmarks and notifications keep working.
export default function ApplicationsRedirectPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/journey') }, [router])
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="animate-spin text-primary" size={26} aria-label="Opening your rental journey" />
    </div>
  )
}