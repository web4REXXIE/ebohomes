'use client'

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { X, ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { SmartImage } from '@/components/ui/smart-image'
import { watermarkedUrl, plainUrl } from '@/lib/watermark'
import { cleanMediaUrls } from '@/lib/property-media'

const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

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
