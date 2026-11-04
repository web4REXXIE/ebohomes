import type { Metadata } from 'next'

// Metadata only. This page is a Client Component, so its metadata lives in
// this server-side sibling layout. It adds no markup and no logic.
export const metadata: Metadata = {
  title: 'Log in or sign up',
  description:
    'Log in or create your EboHomes account to save properties, request viewings, apply for rentals and manage your listings.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
