'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

// Stage 18g: search box and pagination for admin lists. Presentation only.
// Paging here is on the client: every record is already loaded, so nothing is hidden, only split over pages.

export function SearchBox({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="focus-ring h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-base md:text-sm"
      />
    </div>
  )
}

export function usePaged<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, pageCount)
  const slice = items.slice((current - 1) * pageSize, current * pageSize)
  return { page: current, setPage, pageCount, pageSize, total: items.length, slice }
}

export function Pagination({ page, pageCount, total, pageSize, onPage, noun = 'items' }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (p: number) => void; noun?: string }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const btn = 'focus-ring min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-40'
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>Showing {from} to {to} of {total} {noun}</p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1}>Previous</button>
          <span aria-current="page" className="px-2">{page} / {pageCount}</span>
          <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pageCount}>Next</button>
        </div>
      )}
    </nav>
  )
}
