'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, X } from 'lucide-react'

const KEY = 'ebohomes_recent_searches'
type Recent = { label: string; href: string }

export function saveRecentSearch(label: string, href: string) {
  try {
    const list: Recent[] = JSON.parse(localStorage.getItem(KEY) || '[]')
    const next = [{ label, href }, ...list.filter((r) => r.href !== href)].slice(0, 5)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
}

export function RecentSearches() {
  const [items, setItems] = useState<Recent[]>([])

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem(KEY) || '[]'))
    } catch {}
  }, [])

  const remove = (href: string) => {
    const next = items.filter((r) => r.href !== href)
    setItems(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
  }

  if (!items.length) return null

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-base font-bold text-foreground">Your recent searches</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((r) => (
          <div
            key={r.href}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card py-2 pl-3 pr-2"
          >
            <Clock size={14} className="text-muted-foreground" />
            <Link href={r.href} className="text-sm font-medium text-primary">
              {r.label}
            </Link>
            <button
              type="button"
              onClick={() => remove(r.href)}
              aria-label="Remove search"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}