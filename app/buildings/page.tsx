'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { BuildingCard } from '@/components/buildings-strip'
import { usePublicBuildings } from '@/lib/use-public-buildings'

// Stage B4: every building, compound and estate that has a home to let. Tap one to see its flats.
export default function BuildingsPage() {
  const { items, loading, failed } = usePublicBuildings()
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term === '') return items
    return items.filter((b) => `${b.name} ${b.address ?? ''}`.toLowerCase().includes(term))
  }, [items, q])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="container-wide py-6 md:py-8">
          <h1 className="text-h2 font-bold text-foreground md:text-h1">Browse buildings and estates</h1>
          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Pick a building, compound or estate, then choose the flat you want. Only places with a home to let are shown.
          </p>

          <label htmlFor="buildings-q" className="mt-4 block text-sm font-semibold text-foreground">Search by name or area</label>
          <input
            id="buildings-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="For example: Maker Man's Lodge or Abakaliki"
            className="focus-ring mt-1 min-h-11 w-full max-w-md rounded-button border border-border bg-card px-3 text-sm"
          />

          {loading && <p className="mt-6 text-sm text-muted-foreground" role="status">Loading...</p>}
          {!loading && failed && <p className="mt-6 text-sm text-danger">Could not load the buildings. Refresh the page.</p>}
          {!loading && !failed && items.length === 0 && (
            <div className="mt-6 rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
              No building has a home to let right now. <Link href="/search" className="font-semibold text-primary underline">Search all homes</Link>.
            </div>
          )}
          {!loading && !failed && items.length > 0 && shown.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">Nothing matches that search.</p>
          )}

          {shown.length > 0 && (
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((b) => (
                <li key={b.id}>
                  <BuildingCard b={b} wide />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
