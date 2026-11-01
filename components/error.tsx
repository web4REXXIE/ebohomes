'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-primary">Something went wrong</p>
      <h1 className="mt-3 text-3xl font-extrabold text-foreground sm:text-4xl">
        This page could not load
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
        This is a problem on our side, not yours. Try again. If it keeps happening, contact EboHomes and tell us which page you were on.
      </p>
      {error.digest && (
        <p className="mt-3 text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button onClick={() => reset()} className="h-11 gap-2 px-6">
          <RefreshCw size={16} />
          Try again
        </Button>
        <Link href="/">
          <Button variant="outline" className="h-11 w-full gap-2 px-6 sm:w-auto">
            <Home size={16} />
            Go to home
          </Button>
        </Link>
      </div>
    </div>
  )
}