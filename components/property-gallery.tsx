'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { watermarkedUrl, plainUrl } from '@/lib/watermark'

export function PropertyGallery({
  images,
  title = 'Property photo',
}: {
  images: string[]
  title?: string
}) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [fsIndex, setFsIndex] = useState(0)
  const mainRef = useRef<HTMLDivElement>(null)
  const fsRef = useRef<HTMLDivElement>(null)
  const total = images.length

  const goTo = (i: number) => {
    const el = mainRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  const onMainScroll = () => {
    const el = mainRef.current
    if (!el) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  const onFsScroll = () => {
    const el = fsRef.current
    if (!el) return
    setFsIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  const openFullscreen = (i: number) => {
    setFsIndex(i)
    setOpen(true)
  }

  // Jump fullscreen scroller to the tapped photo, lock page scroll, Esc to close
  useEffect(() => {
    if (!open) return
    const el = fsRef.current
    if (el) el.scrollTo({ left: fsIndex * el.clientWidth, behavior: 'instant' as ScrollBehavior })
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
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

  if (!total) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-secondary text-sm text-muted-foreground">
        No photos yet
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Main swipe area */}
      <div className="relative overflow-hidden rounded-xl bg-secondary">
        <div
          ref={mainRef}
          onScroll={onMainScroll}
          className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:aspect-[16/10]"
        >
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => openFullscreen(i)}
              className="h-full w-full shrink-0 snap-center"
              aria-label={`Open photo ${i + 1} fullscreen`}
            >
              <img
                src={watermarkedUrl(src, 900)}
                alt={`${title} - photo ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>

        {/* Counter badge */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">
          <Images size={13} />
          {index + 1} / {total}
        </div>

        {/* Arrows (tablet/desktop) */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(Math.max(0, index - 1))}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-30 md:flex"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => goTo(Math.min(total - 1, index + 1))}
              disabled={index === total - 1}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-30 md:flex"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        {/* Dots (max 8 so they don't overflow) */}
        {total > 1 && total <= 8 && (
          <div className="pointer-events-none absolute bottom-3 right-3 flex gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/55'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail strip (no watermark, too small to read) */}
      {total > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${
                i === index ? 'border-primary' : 'border-transparent opacity-70'
              }`}
            >
              <img
                src={plainUrl(src, 200)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen preview */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-semibold">
              {fsIndex + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close preview"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <X size={22} />
            </button>
          </div>

          <div
            ref={fsRef}
            onScroll={onFsScroll}
            className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {images.map((src, i) => (
              <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
                <img
                  src={watermarkedUrl(src, 1600)}
                  alt={`${title} - photo ${i + 1}`}
                  loading={Math.abs(i - fsIndex) <= 1 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}