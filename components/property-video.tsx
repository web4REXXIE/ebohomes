'use client'

import { useState } from 'react'
import { Video, VideoOff, ExternalLink } from 'lucide-react'
import { safeMediaUrl } from '@/lib/property-media'
import { plainUrl } from '@/lib/watermark'

// The property walkthrough video. It plays the file already stored on the listing (video_url) and nothing else.
// If there is no valid link it shows nothing. If the browser cannot play the file it says so clearly.
// Use key={url} so the error state resets when the video changes.
export function PropertyVideo({
  url,
  title = 'Property',
  posterPhoto,
  className = '',
}: {
  url: unknown
  title?: string
  posterPhoto?: string | null
  className?: string
}) {
  const src = safeMediaUrl(url)
  const [failed, setFailed] = useState(false)

  if (!src) return null

  // The poster is one of this property's own photos, never a stock image
  const poster = safeMediaUrl(posterPhoto) ? plainUrl(posterPhoto as string, 900) : undefined

  return (
    <section
      aria-label="Property walkthrough video"
      className={`rounded-card border border-border bg-card p-card shadow-rest ${className}`}
    >
      <h2 className="mb-3 flex items-center gap-2 text-h3 font-semibold text-foreground">
        <Video size={18} className="text-primary" aria-hidden />
        Property walkthrough
      </h2>

      {failed ? (
        <div
          role="status"
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-control border border-border bg-cream px-4 text-center"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
            <VideoOff size={20} />
          </span>
          <p className="text-body font-semibold text-cream-foreground">This video can&apos;t be played on this device</p>
          <p className="max-w-sm text-caption text-muted-foreground">
            Some phone video formats are not supported by every browser. Try another browser or device.
          </p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-caption font-semibold text-primary hover:underline"
          >
            <ExternalLink size={13} aria-hidden />
            Open video in a new tab
          </a>
        </div>
      ) : (
        <div className="overflow-hidden rounded-control bg-black">
          <video
            src={src}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            aria-label={`${title} walkthrough video`}
            onError={() => setFailed(true)}
            className="aspect-video max-h-[70vh] w-full bg-black object-contain"
          />
        </div>
      )}
    </section>
  )
}
