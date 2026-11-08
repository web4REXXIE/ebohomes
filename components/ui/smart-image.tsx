'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'

type Status = 'loading' | 'loaded' | 'error'

export type SmartImageProps = {
  src: string
  alt: string
  /** cover fills the frame; contain shows the whole photo (use for galleries and viewers) */
  fit?: 'cover' | 'contain'
  /** Load right away (above the fold). Default is lazy. */
  eager?: boolean
  /** Hint the browser to fetch this first. Use for the one main image on screen. */
  priority?: boolean
  /** Tiny frames (thumbnails): icon only, no text */
  compact?: boolean
  /** Dark surface (forest) colours for the skeleton and fallback */
  dark?: boolean
  /** Lets the browser pick a smaller file. Only has an effect together with srcSet. */
  sizes?: string
  srcSet?: string
  /** Shown if src fails (for example /placeholder.jpg). If this fails too, the icon panel appears. */
  fallbackSrc?: string
  /** Where to crop when fit is cover, for example "center 40%" */
  position?: string
  className?: string
}

/**
 * One photo with a loading skeleton and a clear fallback if it cannot load.
 * The parent must be `relative` and have a size (an aspect ratio or a height).
 * The photo never stretches: cover crops evenly, contain shows everything.
 *
 * It renders a plain <img>. The site runs with images.unoptimized, and Cloudinary already
 * resizes photos, so next/image would add no optimisation here and could break signed URLs.
 */
function SmartImageInner({
  src,
  alt,
  fit = 'cover',
  eager = false,
  priority = false,
  compact = false,
  dark = false,
  sizes,
  srcSet,
  fallbackSrc,
  position,
  className = '',
}: SmartImageProps) {
  const ref = useRef<HTMLImageElement>(null)
  const [current, setCurrent] = useState(src)
  const [status, setStatus] = useState<Status>('loading')

  // A cached photo can finish loading before React attaches onLoad
  useEffect(() => {
    const el = ref.current
    if (el && el.complete) setStatus(el.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])

  const handleError = () => {
    if (fallbackSrc && current !== fallbackSrc) {
      setCurrent(fallbackSrc)
      setStatus('loading')
      return
    }
    setStatus('error')
  }

  if (status === 'error' || !current) {
    return (
      <span
        role="img"
        aria-label="Photo unavailable"
        className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center ${
          dark ? 'bg-white/5 text-forest-foreground/70' : 'bg-cream text-muted-foreground'
        }`}
      >
        <ImageOff size={compact ? 16 : 28} aria-hidden />
        {!compact && <span className="text-caption">Photo unavailable</span>}
      </span>
    )
  }

  const usingFallback = current !== src

  return (
    <>
      {status === 'loading' && (
        <span aria-hidden className={`absolute inset-0 animate-pulse ${dark ? 'bg-white/10' : 'bg-secondary'}`} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={current}
        srcSet={usingFallback ? undefined : srcSet}
        sizes={usingFallback ? undefined : sizes}
        alt={alt}
        loading={eager || priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        onLoad={() => setStatus('loaded')}
        onError={handleError}
        style={position && fit === 'cover' ? { objectPosition: position } : undefined}
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
          fit === 'cover' ? 'object-cover' : 'object-contain'
        } ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </>
  )
}

// Keyed by src so the loading and error state resets whenever the photo changes
export function SmartImage(props: SmartImageProps) {
  return <SmartImageInner key={props.src} {...props} />
}
