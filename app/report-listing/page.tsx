'use client'

import { useState } from 'react'
import { Search, Flag, MapPin } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { ReportListingModal } from '@/components/report-listing-modal'

export default function ReportListingPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedListing, setSelectedListing] = useState<any>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    const { data } = await supabase
      .from('listings')
      .select('id, title, location_text, photos')
      .or(`title.ilike.%${query}%,location_text.ilike.%${query}%`)
      .limit(10)
    setResults(data ?? [])
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-2">Report a Listing</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Search for the property you want to report, then select it to file a report.
        </p>

        <div className="flex gap-2 mb-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by title or location..."
            className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
          />
          <button
            onClick={handleSearch}
            className="bg-primary text-primary-foreground font-semibold rounded-md px-4 py-2 text-sm flex items-center gap-2"
          >
            <Search size={14} /> Search
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Searching...</p>}

        {!loading && searched && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No listings found. Try a different search term.</p>
        )}

        <div className="space-y-3">
          {results.map((listing) => (
            <div
              key={listing.id}
              className="flex items-center justify-between gap-4 bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={listing.photos?.[0] ?? '/placeholder-property.jpg'}
                  alt={listing.title}
                  className="w-14 h-14 object-cover rounded-md shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{listing.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <MapPin size={12} /> {listing.location_text}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedListing(listing)}
                className="flex items-center gap-1.5 text-xs font-semibold text-destructive border border-destructive rounded-md px-3 py-2 hover:bg-destructive hover:text-white transition-colors shrink-0"
              >
                <Flag size={12} /> Report
              </button>
            </div>
          ))}
        </div>
      </main>

      {selectedListing && (
        <ReportListingModal
          listingId={selectedListing.id}
          onClose={() => setSelectedListing(null)}
        />
      )}

      <Footer />
    </div>
  )
}