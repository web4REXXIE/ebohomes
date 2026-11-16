'use client'

import Link from 'next/link'
import { TrendingUp, Check } from 'lucide-react'
import { rankBreakdown, type RankInput } from '@/lib/listing-rank'

type Props = {
  listing: {
    availability_confirmed_at?: string | null
    photos?: unknown
    video_url?: string | null
    description?: string | null
    created_at?: string | null
  }
  inspected: boolean
}

// "How to rank higher": shows a landlord the same points the Search "Recommended" order uses.
// It only reads facts about the listing. It changes nothing and never blocks the page.
export function RankTipsCard({ listing, inspected }: Props) {
  const input: RankInput = {
    inspected,
    confirmedAt: listing.availability_confirmed_at,
    photoCount: Array.isArray(listing.photos) ? listing.photos.length : 0,
    hasVideo: !!listing.video_url,
    hasDescription: typeof listing.description === 'string' && listing.description.trim().length > 0,
    createdAt: listing.created_at,
  }
  const { total, lines } = rankBreakdown(input)
  const tips = lines.filter((l) => l.tip)

  return (
    <details className="mt-3 rounded-lg border border-border bg-secondary/50 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-semibold text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp size={14} aria-hidden className="text-primary" /> How to rank higher
        </span>
        <span className="text-xs font-bold text-primary">{total} / 100</span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li key={l.key} className="flex items-start justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  {l.earned === l.max && <Check size={12} aria-hidden className="text-success" />}
                  {l.label}
                </span>
                <span className="block text-muted-foreground">{l.detail}</span>
              </span>
              <span className={`shrink-0 font-bold ${l.earned === l.max ? 'text-success' : 'text-foreground'}`}>
                {l.earned}/{l.max}
              </span>
            </li>
          ))}
        </ul>

        {tips.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground">What you can do</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {tips.map((l) => (
                <li key={l.key}>
                  {l.tip}
                  {l.key === 'inspected' && (
                    <>
                      {' '}
                      <Link href="/dashboard/inspection-requests" className="font-semibold text-primary underline">Request an inspection</Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Featured listings are shown first and labelled. For all others, only these facts count. Money cannot buy a higher place, and refreshing a listing does not help.
        </p>
      </div>
    </details>
  )
}
