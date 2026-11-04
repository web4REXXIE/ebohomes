'use client'

// Root error boundary. Next.js requires error.tsx to be a Client Component.
// The UI lives in components/error.tsx; this file only connects it to the
// App Router and forwards the `error` and `reset` props unchanged.
import ErrorPage from '@/components/error'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorPage error={error} reset={reset} />
}
