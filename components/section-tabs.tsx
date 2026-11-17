'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { sectionForPath, tabIsActive } from '@/lib/landlord-sections'

// The row of tabs at the top of a landlord page, for example Applications, Viewings and Tenancies under Rentals.
// It shows nothing on pages that are not part of a section. It only links to pages that already exist.
export function SectionTabs() {
  const pathname = usePathname()
  const section = sectionForPath(pathname)
  if (!section) return null

  return (
    <nav aria-label={section.label} className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {section.tabs.map((tab) => {
          const active = tabIsActive(pathname, tab)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`focus-ring flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
