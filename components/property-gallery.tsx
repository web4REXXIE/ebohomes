'use client'

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { X, ChevronLeft, ChevronRight, Images, ImageOff } from 'lucide-react'
import { watermarkedUrl, plainUrl } from '@/lib/watermark'
import { cleanMediaUrls } from '@/lib/property-media'

type Status = 'loading' | 'loaded' | 'error'

const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

// One image with a loading skeleton and a branded fallback if it cannot load.
// The parent must be `relative` and have a size. Use key={src} so it resets when the photo changes.
function SmartImage({
  src,
  alt,
  fit = 'cover',
  eager = false,
  priority = false,
  compact = false,
  dark = false,
}: {
  src: string
  alt: string
  fit?: 'cover' | 'contain'
  eager?: boolean
  priority?: boolean
  compact?: boolean
  dark?: boolean
}) {
  const ref = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState<Status>('loading')

  // A cached photo can finish loading before React attaches onLoad
  useEffect(() => {
    const el = ref.current
    if (el && el.complete) setStatus(el.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])

  if (status === 'error') {
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

  return (
    <>
      {status === 'loading' && (
        <span aria-hidden className={`absolute inset-0 animate-pulse ${dark ? 'bg-white/10' : 'bg-secondary'}`} />
      )}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
          fit === 'cover' ? 'object-cover' : 'object-contain'
        } ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  )
}

// Keeps a swipe scroller on the same slide when its width changes (phone rotation, window resize)
function useRealign(
  ref: RefObject<HTMLDivElement | null>,
  indexRef: MutableRefObject<number>,
  active: boolean
) {
  useEffect(() => {
    const el = ref.current
    if (!active || !el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth
      if (width > 0 && width !== lastWidth) {
        lastWidth = width
        el.scrollTo({ left: indexRef.current * width, behavior: 'instant' as ScrollBehavior })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, indexRef, active])
}

// Moves a thumbnail strip sideways so the active thumbnail is centred. Never scrolls the page.
function centreThumb(strip: HTMLDivElement | null, thumb: HTMLElement | null | undefined) {
  if (!strip || !thumb) return
  strip.scrollTo({
    left: thumb.offsetLeft - strip.clientWidth / 2 + thumb.clientWidth / 2,
    behavior: 'smooth',
  })
}

export function PropertyGallery({
  images,
  title = 'Property photo',
}: {
  images: string[]
  title?: string
}) {
  const photos = useMemo(() => cleanMediaUrls(images), [images])
  const total = photos.length

  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [fsIndex, setFsIndex] = useState(0)

  const mainRef = useRef<HTMLDivElement>(null)
  const fsRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const fsStripRef = useRef<HTMLDivElement>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const fsThumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const indexRef = useRef(0)
  const fsIndexRef = useRef(0)

  useEffect(() => {
    indexRef.current = index
  }, [index])
  useEffect(() => {
    fsIndexRef.current = fsIndex
  }, [fsIndex])

  useRealign(mainRef, indexRef, total > 0)
  useRealign(fsRef, fsIndexRef, open)

  const slideAt = (el: HTMLDivElement) => {
    if (!el.clientWidth) return 0
    return Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), Math.max(total - 1, 0))
  }

  const goTo = (i: number) => {
    const el = mainRef.current
    if (!el) return
    const next = Math.min(Math.max(i, 0), total - 1)
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  const fsGoTo = (i: number) => {
    const el = fsRef.current
    if (!el) return
    const next = Math.min(Math.max(i, 0), total - 1)
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  const onMainScroll = () => {
    const el = mainRef.current
    if (el) setIndex(slideAt(el))
  }

  const onFsScroll = () => {
    const el = fsRef.current
    if (el) setFsIndex(slideAt(el))
  }

  const openFullscreen = (i: number) => {
    triggerRef.current = document.activeElement as HTMLElement | null
    setFsIndex(i)
    setOpen(true)
  }

  // Keep the active thumbnail in view
  useEffect(() => {
    centreThumb(stripRef.current, thumbRefs.current[index])
  }, [index])

  useEffect(() => {
    if (open) centreThumb(fsStripRef.current, fsThumbRefs.current[fsIndex])
  }, [fsIndex, open])

  // Fullscreen: jump to the tapped photo, lock page scroll, keys, focus
  useEffect(() => {
    if (!open) return
    const scroller = fsRef.current
    if (scroller) scroller.scrollTo({ left: fsIndexRef.current * scroller.clientWidth, behavior: 'instant' as ScrollBehavior })

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        fsGoTo(fsIndexRef.current - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        fsGoTo(fsIndexRef.current + 1)
      } else if (e.key === 'Tab') {
        // Keep keyboard focus inside the viewer
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      triggerRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // When fullscreen closes, put the main gallery on the photo you ended on
  useEffect(() => {
    if (open) return
    const el = mainRef.current
    if (el && fsIndex !== index) {
      el.scrollTo({ left: fsIndex * el.clientWidth, behavior: 'instant' as ScrollBehavior })
      setIndex(fsIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ---------------- No usable photos ---------------- */

  if (!total) {
    return (
      <div
        role="status"
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-card border border-border bg-cream px-6 text-center sm:aspect-[16/10]"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
          <Images size={22} />
        </span>
        <p className="text-body font-semibold text-cream-foreground">No photos yet</p>
        <p className="text-caption text-muted-foreground">Photos for this property are not available right now.</p>
      </div>
    )
  }

  /* ---------------- Gallery ---------------- */

  return (
    <div className="w-full">
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`${title} photos`}
        className="relative overflow-hidden rounded-card border border-border bg-cream shadow-rest"
      >
        <div
          ref={mainRef}
          onScroll={onMainScroll}
          tabIndex={total > 1 ? 0 : -1}
          onKeyDown={(e) => {
            if (total < 2) return
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              goTo(index - 1)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              goTo(index + 1)
            }
          }}
          className={`flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:aspect-[16/10] ${NO_SCROLLBAR}`}
        >
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => openFullscreen(i)}
              role="group"
              aria-roledescription="slide"
              aria-label={`Photo ${i + 1} of ${total}, open fullscreen`}
              className="relative h-full w-full shrink-0 snap-center"
            >
              <SmartImage
                src={watermarkedUrl(src, 900)}
                alt={`${title} - photo ${i + 1}`}
                eager={i === 0}
                priority={i === 0}
              />
            </button>
          ))}
        </div>

        {total > 1 && (
          <>
            {/* Counter */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-forest/80 px-3 py-1 text-caption font-semibold text-forest-foreground backdrop-blur-sm">
              <Images size={13} aria-hidden />
              {index + 1} / {total}
            </div>

            {/* Arrows (tablet and desktop) */}
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-forest/70 text-forest-foreground transition hover:bg-forest disabled:opacity-30 md:flex"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index === total - 1}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-forest/70 text-forest-foreground transition hover:bg-forest disabled:opacity-30 md:flex"
            >
              <ChevronRight size={22} />
            </button>

            {/* Dots (up to 8) */}
            {total <= 8 && (
              <div aria-hidden className="pointer-events-none absolute bottom-4 right-3 flex gap-1.5">
                {photos.map((src, i) => (
                  <span
                    key={src}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? 'w-4 bg-featured' : 'w-1.5 bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Thumbnails (no watermark, too small to read) */}
      {total > 1 && (
        <div ref={stripRef} className={`relative mt-2 flex gap-2 overflow-x-auto pb-1 ${NO_SCROLLBAR}`}>
          {photos.map((src, i) => (
            <button
              key={src}
              ref={(el) => {
                thumbRefs.current[i] = el
              }}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === index}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 bg-cream transition ${
                i === index ? 'border-featured' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <SmartImage src={plainUrl(src, 200)} alt="" compact />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen viewer */}
      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[60] flex flex-col bg-forest text-forest-foreground"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-body font-semibold">{title}</p>
              <p className="text-caption text-forest-foreground/70">
                {fsIndex + 1} / {total}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close photo viewer"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            >
              <X size={22} />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={fsRef}
              onScroll={onFsScroll}
              className={`flex h-full w-full snap-x snap-mandatory overflow-x-auto ${NO_SCROLLBAR}`}
            >
              {photos.map((src, i) => (
                <div key={src} className="relative h-full w-full shrink-0 snap-center">
                  <SmartImage
                    src={watermarkedUrl(src, 1600)}
                    alt={`${title} - photo ${i + 1} of ${total}`}
                    fit="contain"
                    eager={Math.abs(i - fsIndex) <= 1}
                    dark
                  />
                </div>
              ))}
            </div>

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => fsGoTo(fsIndex - 1)}
                  disabled={fsIndex === 0}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-30 md:flex"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={() => fsGoTo(fsIndex + 1)}
                  disabled={fsIndex === total - 1}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-30 md:flex"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}
          </div>

          {total > 1 && (
            <div
              ref={fsStripRef}
              className={`relative flex gap-2 overflow-x-auto px-4 py-3 ${NO_SCROLLBAR}`}
            >
              {photos.map((src, i) => (
                <button
                  key={src}
                  ref={(el) => {
                    fsThumbRefs.current[i] = el
                  }}
                  type="button"
                  onClick={() => fsGoTo(i)}
                  aria-label={`Go to photo ${i + 1}`}
                  aria-current={i === fsIndex}
                  className={`relative h-11 w-14 shrink-0 overflow-hidden rounded-md border-2 transition ${
                    i === fsIndex ? 'border-featured' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <SmartImage src={plainUrl(src, 200)} alt="" compact dark />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
