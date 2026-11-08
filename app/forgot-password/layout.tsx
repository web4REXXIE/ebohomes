import type { Metadata } from 'next'

// Metadata only. The page is a Client Component, so its title lives in this server-side layout.
export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Reset your EboHomes password with a 6-digit code sent to your email.',
  robots: { index: false, follow: true },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
