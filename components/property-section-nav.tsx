'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Sticky "jump to" pills for the property page (About, Amenities, Verification, Location).
// Presentation only. It links to sections that already exist on the page and reads no data.
// The caller passes only the sections that really have content, so a pill never leads nowhere.

export type SectionNavItem = { id: string; label: string }

export function PropertySectionNav({
  items,
  className = '',
}: {
  items: SectionNavItem[]
  className?: string
}) {
  const [active, setActive] = useState<string>(items[0]?.id ?? '')
  // A string key, so the effect only re-runs when the list of sections really changes.
  const key = items.map((i) => i.id).join(',')

  // Highlight the section that is currently near the top of the screen.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const targets = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 },
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [key])

  if (items.length < 2) return null

  return (
    <nav
      aria-label="Jump to a section of this property"
      className={cn(
        'sticky top-16 z-30 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-[72px] lg:mx-0 lg:rounded-card lg:border lg:px-3',
        className,
      )}
    >
      <ul className="flex gap-2 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = active === item.id
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => setActive(item.id)}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-secondary',
                )}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
