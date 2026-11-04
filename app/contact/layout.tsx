import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'

// Metadata lives here because the page is a Client Component.
// The layout also adds the standard Header and Footer.
export const metadata: Metadata = {
  title: 'Contact us',
  description:
    'Reach the EboHomes team by WhatsApp, phone, email or the contact form for help with listings, viewings, applications and payments.',
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>
}
