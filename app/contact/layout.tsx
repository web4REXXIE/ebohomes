import type { Metadata } from 'next'

// Metadata only. This page is a Client Component, so its metadata lives in
// this server-side sibling layout. It adds no markup and no logic.
export const metadata: Metadata = {
  title: 'Contact us',
  description:
    'Reach the EboHomes team by WhatsApp, phone, email or the contact form for help with listings, viewings, applications and payments.',
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
