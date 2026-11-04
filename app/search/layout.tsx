import type { Metadata } from 'next'

// Metadata only. This page is a Client Component, so its metadata lives in
// this server-side sibling layout. It adds no markup and no logic.
export const metadata: Metadata = {
  title: 'Search rental properties in Ebonyi State',
  description:
    'Search reviewed rental homes in Abakaliki and across Ebonyi State. Filter by area, type, bedrooms and budget, then request a viewing or apply online.',
  alternates: { canonical: '/search' },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
