'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  SlidersHorizontal,
  Grid,
  List as ListIcon,
  X,
  Heart,
  Share2,
  MapPin,
  BedDouble,
  Bath,
  Star,
  ShieldCheck,
  BadgeCheck,
  Calendar,
  Copy,
  Send,
  MessageCircle,
  Building2,
  Camera,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { RecentSearches, saveRecentSearch } from '@/components/recent-searches'
import { SearchAlertBar } from '@/components/search-alert-bar'
import { useInspectedIds } from '@/lib/use-inspected-ids'
import { sizedPhoto, photoSrcSet } from '@/lib/image-url'
import { SmartImage } from '@/components/ui/smart-image'

/* Stage 7: search page redesign.
   Data loading, filtering, sorting, paging, saving and sharing logic is the same as before.
   New in this file: design tokens, accessible dialogs, and filters kept in sync with the URL.
   The map (components/search-map.tsx) is not wired in here. It is handled in a later step. */

// Values must match what is stored in listings.property_type (same list as /list-property)
const PROPERTY_TYPES = [
  { value: 'Flat / Apartment', label: 'Flat / Apartment' },
  { value: 'Bungalow', label: 'Bungalow' },
  { value: 'Duplex', label: 'Duplex' },
  { value: 'Self Contain', label: 'Self Contain' },
  { value: 'Penthouse', label: 'Penthouse' },
  { value: 'Hostel', label: 'Hostel' },
  { value: 'Office', label: 'Office' },
  { value: 'Shop / Mall', label: 'Shop / Mall' },
  { value: 'Warehouse', label: 'Warehouse' },
  { value: 'Land / Plot', label: 'Land / Plot' },
  { value: 'Event Center', label: 'Event Center' },
]

const AMENITIES = ['Parking Space', '24/7 Security', 'Water Supply', 'Generator', 'Furnished']

// Monthly rent slider. When it sits at the cap, there is no upper limit.
const PRICE_CAP = 2000000
const PAGE_SIZE = 12

const COUNT_OPTIONS = ['1', '2', '3', '4+']
const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
]

// '4+' means 4 or more; any other value is an exact match
const matchCount = (actual: number | null | undefined, wanted: string) =>
  wanted.endsWith('+') ? Number(actual) >= parseInt(wanted) : String(actual) === wanted

const naira = (value: unknown) => `₦${(Number(value) || 0).toLocaleString('en-NG')}`

function addedLabel(createdAt?: string) {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
  if (days <= 0) return 'Added today'
  if (days === 1) return 'Added yesterday'
  if (days < 7) return `Added ${days} days ago`
  if (days < 30) return `Added ${Math.floor(days / 7)}w ago`
  return ''
}

// Page numbers with ellipsis, e.g. 1 … 4 5 6 … 20
function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

/* ---------- Seeded shuffle: new order on every visit/reload, stable while filtering ---------- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: T[], seed: number) {
  const arr = [...items]
  const random = mulberry32(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* ---------- URL <-> filters ----------
   Parameters (same names the Home page already uses, plus the ones this page was missing):
   location, type, q, minPrice, maxPrice, bedrooms, bathrooms, amenity (repeatable), featured=1, sort */

type UrlFilters = {
  location: string
  type: string
  q: string
  minPrice: number
  maxPrice: number
  bedrooms: string
  bathrooms: string
  amenities: string[]
  featured: boolean
  sort: string
}

function readNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// A raw "4+" typed into an address bar arrives as "4 " (a plus sign decodes to a space)
function readCount(value: string | null): string {
  if (!value) return ''
  const v = value.trim().replace(/\s/g, '+')
  const normal = value.endsWith(' ') && value.trim() === '4' ? '4+' : v
  return COUNT_OPTIONS.includes(normal) ? normal : ''
}

function parseFilters(sp: URLSearchParams): UrlFilters {
  const min = readNumber(sp.get('minPrice'))
  const max = readNumber(sp.get('maxPrice'))
  const sort = sp.get('sort') || ''
  return {
    location: sp.get('location') || '',
    type: sp.get('type') || '',
    q: sp.get('q') || '',
    minPrice: min === null ? 0 : Math.min(Math.max(0, min), PRICE_CAP),
    maxPrice: max === null ? PRICE_CAP : Math.min(Math.max(0, max), PRICE_CAP),
    bedrooms: readCount(sp.get('bedrooms')),
    bathrooms: readCount(sp.get('bathrooms')),
    amenities: AMENITIES.filter((a) => sp.getAll('amenity').includes(a)),
    featured: sp.get('featured') === '1',
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : 'recommended',
  }
}

function buildQuery(f: UrlFilters): string {
  const p = new URLSearchParams()
  if (f.location) p.set('location', f.location)
  if (f.type) p.set('type', f.type)
  if (f.q) p.set('q', f.q)
  if (f.minPrice > 0) p.set('minPrice', String(f.minPrice))
  if (f.maxPrice < PRICE_CAP) p.set('maxPrice', String(f.maxPrice))
  if (f.bedrooms) p.set('bedrooms', f.bedrooms)
  if (f.bathrooms) p.set('bathrooms', f.bathrooms)
  for (const a of f.amenities) p.append('amenity', a)
  if (f.featured) p.set('featured', '1')
  if (f.sort !== 'recommended') p.set('sort', f.sort)
  return p.toString()
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/* ---------- Dialog behaviour: focus in, Tab kept inside, Escape closes, page scroll locked ---------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useDialog(open: boolean, onClose: () => void, panelRef: RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    ;(items()[0] ?? panel)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) {
        event.preventDefault()
        panel?.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      const outside = !panel?.contains(active)
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
  }, [open, panelRef])
}

/* ---------------- Share sheet ---------------- */

function ShareSheet({ listing, onClose }: { listing: any; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useDialog(true, onClose, panelRef)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const url = `${window.location.origin}/listing/${listing.id}`
  const text = `Check out this property on EboHomes: ${listing.title || listing.location_text || ''}`
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)

  const links = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
  }

  function open(platform: keyof typeof links) {
    window.open(links[platform], '_blank', 'noopener,noreferrer')
    onClose()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(onClose, 900)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: listing.title || 'Property on EboHomes', text, url })
      onClose()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Native share failed:', error)
    }
  }

  const buttonClass =
    'flex min-h-11 items-center gap-2 rounded-control border border-border px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  const mark = 'flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-background'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-heading"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-panel bg-card p-5 shadow-overlay outline-none sm:rounded-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="share-heading" className="text-base font-bold text-foreground">
            Share this property
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share menu"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X size={18} aria-hidden="true" />
          </button>
