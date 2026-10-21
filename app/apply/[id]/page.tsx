'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

// The application form now lives inside the rental journey (Stage 1).
// This page stays only so old links and bookmarks keep working.
export default function ApplyRedirectPage() {
  const { id } = useParams()
  const router = useRouter()
  useEffect(() => { if (id) router.replace(`/journey/apply/${id}`) }, [id, router])
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="animate-spin text-primary" size={26} aria-label="Opening your rental journey" />
    </div>
  )
}

