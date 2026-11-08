'use client'

import { useState, useEffect, useRef, useTransition, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, ShieldCheck, Home as HomeIcon, Tag, MapPin, ChevronDown, Building2, Home,
  DoorOpen, Building, Bed, Briefcase, Store, MapPinned, Warehouse, CalendarClock, Users, SearchCheck,
  Headphones, Crown, Loader2, Play, X, BadgeCheck, ArrowRight, Lock, Flag,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { InstallButton, InstallPromoSection } from '@/components/install-button'
import { ListingCard } from '@/components/listing-card'
import { SignedInHome } from '@/components/signed-in-home'
import { HowItWorks, FounderSection, LandlordCta, FinalCta } from '@/components/home/home-sections'
import { Button, buttonVariants } from '@/components/ui/button'
import { Section } from '@/components/ui/section'
import { cn } from '@/lib/utils'
import { sizedPhoto } from '@/lib/image-url'
import { SmartImage } from '@/components/ui/smart-image'
import { supabase } from '@/lib/supabase'
import useEmblaCarousel from 'embla-carousel-react'
import AutoScroll from 'embla-carousel-auto-scroll'
import { motion, animate, useInView, useReducedMotion } from 'motion/react'

/* PAGE PLAN (Stage 6): hero with search, trust bar, dashboard (signed in), empty state OR featured,
   browse by type, recently added, explore by area, video tours, how it works, founder, why trust,
   institutions, FAQ, EboHomes AI, app install, landlord CTA, final CTA.
   Every data section appears only when real data exists. Data loading, search and auth logic are
   unchanged from the previous homepage. The How it works, Founder, Landlord and Final CTA sections
   live in components/home/home-sections.tsx. */

const CATEGORIES = [
  { value: 'Flat / Apartment', label: 'Apartments', icon: Building2 },
  { value: 'Bungalow', label: 'Bungalows', icon: Home },
  { value: 'Self Contain', label: 'Self-Contain', icon: DoorOpen },
  { value: 'Duplex', label: 'Duplexes', icon: Building },
  { value: 'Penthouse', label: 'Penthouses', icon: Bed },
  { value: 'Hostel', label: 'Hostels', icon: Users },
  { value: 'Office', label: 'Offices', icon: Briefcase },
  { value: 'Shop / Mall', label: 'Shops & Malls', icon: Store },
  { value: 'Warehouse', label: 'Warehouses', icon: Warehouse },
  { value: 'Land / Plot', label: 'Lands & Plots', icon: MapPinned },
  { value: 'Event Center', label: 'Event Centers', icon: CalendarClock },
]

// Search links only. They never claim listings exist there.
const SEARCH_AREAS = ['Abakaliki', 'Abakaliki GRA', 'Ikwo', 'Afikpo', 'Onueke', 'Edda']
const SEARCH_AREA_LABELS: Record<string, string> = { Ikwo: 'Ikwo (FUNAI area)' }
const BEDROOM_OPTIONS = ['1', '2', '3', '4+']
const RECENT_KEY = 'ebo_recent_searches'


const WHY_CHOOSE = [
  { title: 'Landlord checks', desc: 'Landlords submit their details and documents for review before their listings go live.', icon: ShieldCheck },
  { title: 'Reviewed listings', desc: 'EboHomes reviews every listing before it appears on the site.', icon: BadgeCheck },
  { title: 'One channel', desc: 'Viewings, applications and payments are handled through EboHomes. Never pay anyone who contacts you outside it.', icon: Lock },
  { title: 'Easy search', desc: 'Filters for area, type, bedrooms and budget help you find the right home fast.', icon: SearchCheck },
  { title: 'Report anything wrong', desc: 'See a fake or misleading listing? Report it and our team will review it.', icon: Flag },
  { title: 'Support when you need it', desc: 'Message the EboHomes team if you are unsure about anything.', icon: Headphones },
]

const FAQS = [
  { q: 'How do I find a property?', a: 'Use the search at the top of this page. Pick an area, a property type, the number of bedrooms and your budget, then open any listing to see its photos, price and details.' },
  { q: 'How do I see a property in person?', a: 'Open the listing and tap "Request a viewing". EboHomes arranges the inspection with the owner for you. You never have to chase anyone.' },
  { q: 'How do I apply for a property?', a: 'Tap "Apply now" on the listing and fill in the form. EboHomes handles the paperwork between you and the owner.' },
  { q: 'Who do I pay, and how?', a: 'Pay only to the official EboHomes payment details shown on your tenancy page after you sign in. EboHomes checks each payment before it counts. Never pay an individual who says they represent EboHomes. We cannot track or protect payments made anywhere else.' },
  { q: 'What are the fees, and what if I cancel?', a: 'Searching is free. The rent, deposit and any fees are written in the rental terms you review before you accept, so check the amounts first. At the end of a tenancy, any deposit refund is paid by the landlord directly and EboHomes records the agreed figures. A full cancellation and refund policy has not been published yet, so please ask the EboHomes team on WhatsApp before you pay.' },
  { q: 'How are properties verified?', a: 'Landlords submit their details and documents, and EboHomes reviews each listing before it goes live. If you ever see something wrong, you can report it from the listing.' },
  { q: 'What if I see a fake or wrong listing?', a: 'Tap "Report" on the listing or use the report page. Our team reviews every report.' },
  { q: 'Is it free to search?', a: 'Yes. Searching and browsing are free for tenants.' },
  { q: 'How do I list my property?', a: 'Tap "List your property", create a landlord account and submit your property details and documents. Your listing goes live after EboHomes reviews it.' },
  { q: 'I still have a question. Who can I ask?', a: 'Open the Contact page or chat with the EboHomes support team on WhatsApp.' },
]

const INSTITUTIONS = [
  { short: 'EBSU', name: 'Ebonyi State University', logo: '/ebsu-logo.png' },
  { short: 'FUNAI', name: 'Alex Ekwueme Federal University', logo: '/funai-logo.png' },
]

const HERO_IMAGES = ['/hero-home.jpg', '/hero-2.jpg', '/hero-3.jpg']
const HERO_FALLBACK = '/hero.jpg'
const HERO_FADE_MS = 1400
const HERO_HOLD_MS = 6500

type Listing = {
  id: string
  landlord_id?: string
  title?: string
  photos?: string[]
  price_monthly: number
  price_yearly?: number
  location_text: string
  property_type: string
  bedrooms?: number
  bathrooms?: number
  featured?: boolean
  video_url?: string
  created_at?: string
}
type RecentSearch = { label: string; query: string }

const naira = (v: unknown) => `₦${(Number(v) || 0).toLocaleString('en-NG')}`

// Photo sized for the given width. The listing card sizes its own photo, so cards get the raw URL.
function img(url: string | undefined, width: number) {
  if (!url) return '/placeholder.jpg'
  return sizedPhoto(url, width)
}

function cardProps(l: Listing) {
  return {
    id: l.id, landlord_id: l.landlord_id, title: l.title, image: l.photos?.[0] ?? '',
    photoCount: Array.isArray(l.photos) ? l.photos.length : undefined, bathrooms: l.bathrooms,
    price_monthly: l.price_monthly, price_yearly: l.price_yearly, location: l.location_text,
    property_type: l.property_type, bedrooms: l.bedrooms, created_at: l.created_at, featured: l.featured,
  }
}

const fieldClass =
  'h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

/* ---------------- motion ---------------- */

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0.25, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!inView) return
    if (reduce) {
      if (ref.current) ref.current.textContent = to.toLocaleString()
      return
    }
    const c = animate(0, to, {
      duration: 1.2,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
      },
    })
    return () => c.stop()
  }, [inView, to, reduce])
  return <span ref={ref}>{to.toLocaleString()}</span>
}

/* ---------------- layout helpers ---------------- */

function SectionHead({ title, sub, href, cta = 'See all', tone = 'light', badge }: {
  title: string; sub?: string; href?: string; cta?: string; tone?: 'light' | 'dark'; badge?: React.ReactNode
}) {
  const dark = tone === 'dark'
  return (
    <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={`text-h2 font-bold ${dark ? 'text-white' : 'text-foreground'}`}>{title}</h2>
          {badge}
        </div>
        {sub && <p className={`mt-1.5 text-body ${dark ? 'text-white/75' : 'text-muted-foreground'}`}>{sub}</p>}
      </div>
      {href && (
        <Link href={href} className={`group inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${dark ? 'text-featured' : 'text-primary'}`}>
          {cta}
          <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

/* ---------------- sliders ---------------- */

function Marquee({ slides, speed = 0.6 }: { slides: React.ReactNode[]; speed?: number }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: true, align: 'start' }, [
    AutoScroll({ speed, startDelay: 0, stopOnInteraction: false, stopOnMouseEnter: true }),
  ])
  useEffect(() => {
    if (!emblaApi) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) emblaApi.plugins().autoScroll?.stop()
  }, [emblaApi])
  return (
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="-ml-4 flex touch-pan-y items-start">
        {slides.map((s, i) => (
          <div key={i} className="min-w-0 shrink-0 grow-0 pl-4">{s}</div>
        ))}
      </div>
    </div>
  )
}

// A rolling slider needs enough cards to loop. With only a few, show a plain scrollable row instead.
function ListingRow({ items, speed }: { items: Listing[]; speed: number }) {
  const cards = items.map((l) => (
    <div key={l.id} className="w-64 shrink-0 sm:w-72">
      <ListingCard {...cardProps(l)} />
    </div>
  ))
  if (items.length >= 4) return <Marquee speed={speed} slides={cards} />
  return <div className="flex items-start gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{cards}</div>
}

/* ---------------- hero background ---------------- */

function HeroSlide({ src, state, reduce }: { src: string; state: 'current' | 'previous' | 'hidden'; reduce: boolean }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const shown = entered && state !== 'hidden'
  return (
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: `url('${src}')`,
        opacity: shown ? 1 : 0,
        zIndex: state === 'current' ? 2 : state === 'previous' ? 1 : 0,
        transform: shown && !reduce ? 'scale(1.06)' : 'scale(1)',
        transition: reduce ? 'none' : state === 'hidden' ? `opacity ${HERO_FADE_MS}ms ease-in-out` : `opacity ${HERO_FADE_MS}ms ease-in-out, transform 9000ms linear`,
      }}
    />
  )
}

function HeroBackground() {
  const reduce = Boolean(useReducedMotion())
  const [images, setImages] = useState<string[]>([])
  const [pos, setPos] = useState({ current: 0, previous: -1 })

  useEffect(() => {
    let cancelled = false
    let settled = 0
    let loadedAny = false
    const settle = () => {
      settled += 1
      if (!cancelled && settled === HERO_IMAGES.length && !loadedAny) setImages([HERO_FALLBACK])
    }
    HERO_IMAGES.forEach((src) => {
      const image = new window.Image()
      image.onload = () => {
        if (!cancelled) {
          loadedAny = true
          setImages((prev) => (prev.includes(src) ? prev : [...prev, src]))
        }
        settle()
      }
      image.onerror = () => settle()
      image.src = src
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (reduce || images.length < 2) return
    const t = setInterval(() => setPos((p) => ({ current: (p.current + 1) % images.length, previous: p.current })), HERO_HOLD_MS)
    return () => clearInterval(t)
  }, [reduce, images.length])

  return (
    <div className="absolute inset-0 overflow-hidden bg-emerald-950" aria-hidden="true">
      {images.map((src, i) => (
        <HeroSlide key={src} src={src} reduce={reduce} state={i === pos.current ? 'current' : i === pos.previous ? 'previous' : 'hidden'} />
      ))}
    </div>
  )
}

/* ---------------- sections ---------------- */

function EmptyInventory() {
  return (
    <Section width="wide" spacing="sm">
      <Reveal>
        <div className="rounded-panel border border-border bg-card px-6 py-12 text-center shadow-rest md:px-12 md:py-16">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-accent text-primary">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <h2 className="mx-auto mt-5 max-w-xl text-balance text-h2 font-bold text-foreground">
            We are building Ebonyi&apos;s property network
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-body text-muted-foreground">
            Every home on EboHomes is reviewed before it goes live. New properties are being added, so check back soon.
          </p>
          <p className="mt-8 text-body-lg font-semibold text-foreground">Own a property in Ebonyi? Help someone find their next home.</p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/list-property" className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
              <Home aria-hidden="true" /> List Your Property
            </Link>
            <Link href="/contact" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full sm:w-auto')}>
              Talk to our team
            </Link>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

function InstitutionsStrip() {
  return (
    <div className="rounded-card border border-border/60 bg-card px-6 py-8 text-center shadow-rest md:py-10">
      <h3 className="text-xl font-bold text-foreground md:text-2xl">Built with Ebonyi&apos;s students and professionals in mind</h3>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
        {INSTITUTIONS.map((i) => (
          <div key={i.short} className="flex items-center gap-3.5 text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-secondary/40 p-1.5">
              <img src={i.logo} alt="" loading="lazy" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-base font-bold text-primary">{i.short}</p>
              <p className="text-xs text-muted-foreground">{i.name}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-md text-xs text-muted-foreground">EBSU and FUNAI are not official partners of EboHomes. They are communities we aim to serve.</p>
    </div>
  )
}

function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
  const base = useId()
  return (
    <div className="space-y-2.5">
      {FAQS.map((f, i) => {
        const isOpen = open === i
        const btnId = `${base}-b${i}`
        const panelId = `${base}-p${i}`
        return (
          <div key={f.q} className={`rounded-2xl border bg-card transition-colors ${isOpen ? 'border-primary/40' : 'border-border'}`}>
            <h3>
              <button
                type="button" id={btnId} aria-expanded={isOpen} aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:text-base"
              >
                {f.q}
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={btnId} inert={!isOpen} className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
function AiComingSoon() {
  return (
    <Section width="content" spacing="sm" aria-labelledby="ebohomes-ai-heading">
      <Reveal>
        <div className="rounded-card border border-border bg-card px-6 py-8 shadow-rest sm:px-10 md:px-12">
          <span className="inline-flex items-center rounded-full border border-featured/50 bg-featured/10 px-3 py-1 text-caption font-bold tracking-widest text-foreground">COMING SOON</span>
          <h2 id="ebohomes-ai-heading" className="mt-3 text-h2 font-bold text-foreground">EboHomes AI</h2>
          <p className="mt-2 text-body-lg font-semibold text-primary">Intelligence for Nigerian Real Estate.</p>
          <p className="mt-2 max-w-md text-body text-muted-foreground">We&apos;re building a smarter way to navigate real estate in Nigeria. It is not available yet.</p>
        </div>
      </Reveal>
    </Section>
  )
}

/* ---------------- page ---------------- */

export default function HomeClient() {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const [featured, setFeatured] = useState<Listing[]>([])
  const [recent, setRecent] = useState<Listing[]>([])
  const [videos, setVideos] = useState<Listing[]>([])
  const [areas, setAreas] = useState<{ name: string; count: number }[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [categoryPhotos, setCategoryPhotos] = useState<Record<string, string>>({})
  const [verifiedLandlords, setVerifiedLandlords] = useState(0)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const [isSearching, startSearch] = useTransition()

  useEffect(() => {
    const fetchHome = async () => {
      setLoading(true)
      setLoadError(false)
      const { data, error } = await supabase
        .from('listings')
        .select('id, landlord_id, title, photos, price_monthly, price_yearly, location_text, property_type, bedrooms, bathrooms, featured, video_url, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) {
        console.error('Failed to load home listings:', error.message)
        setLoadError(true)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as Listing[]
      const shuffled = rows.filter((l) => l.featured)
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setFeatured(shuffled)
      setRecent(rows.slice(0, 6))
      setVideos(rows.filter((l) => l.video_url).slice(0, 6))

      const types: Record<string, number> = {}
      const typePhotos: Record<string, string> = {}
      const places: Record<string, { name: string; count: number }> = {}
      for (const r of rows) {
        if (r.property_type) {
          types[r.property_type] = (types[r.property_type] ?? 0) + 1
          // rows are newest first, so the first photo seen is the newest listing's photo
          if (!typePhotos[r.property_type] && r.photos?.[0]) typePhotos[r.property_type] = r.photos[0]
        }
        const name = (r.location_text ?? '').trim()
        if (name) {
          const key = name.toLowerCase()
          places[key] = { name: places[key]?.name ?? name, count: (places[key]?.count ?? 0) + 1 }
        }
      }
      setCategoryCounts(types)
      setCategoryPhotos(typePhotos)
      setAreas(Object.values(places).sort((a, b) => b.count - a.count))
      setTotal(rows.length)
      setLoading(false)
    }
    fetchHome()

    const fetchLandlords = async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'landlord')
        .eq('verification_status', 'verified')
      setVerifiedLandlords(count ?? 0)
    }
    fetchLandlords()

    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
      if (Array.isArray(saved)) setRecentSearches(saved.slice(0, 4))
    } catch {}
  }, [])

  const persistRecent = (next: RecentSearch[]) => {
    setRecentSearches(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location.trim()) params.set('location', location.trim())
    if (propertyType) params.set('type', propertyType)
    if (bedrooms) params.set('bedrooms', bedrooms)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    const query = params.toString()
    if (query) {
      const label = [
        location.trim(), propertyType, bedrooms ? `${bedrooms} bed` : '',
        minPrice ? `from ${naira(minPrice)}` : '', maxPrice ? `up to ${naira(maxPrice)}` : '',
      ].filter(Boolean).join(' · ')
      persistRecent([{ label, query }, ...recentSearches.filter((r) => r.query !== query)].slice(0, 4))
    }
    startSearch(() => router.push('/search' + (query ? '?' + query : '')))
  }

  const locationSuggestions = Array.from(new Set([...areas.map((a) => a.name), ...SEARCH_AREAS]))
  const activeCats = CATEGORIES.filter((c) => (categoryCounts[c.value] ?? 0) > 0).sort(
    (a, b) => (categoryCounts[b.value] ?? 0) - (categoryCounts[a.value] ?? 0),
  )
  const shownAreaKeys = new Set(areas.slice(0, 8).map((a) => a.name.toLowerCase()))
  const extraAreas = SEARCH_AREAS.filter((a) => !shownAreaKeys.has(a.toLowerCase()))

  const chips = [
    { label: 'Under ₦100k', href: '/search?maxPrice=100000' },
    { label: '₦100k – ₦300k', href: '/search?minPrice=100000&maxPrice=300000' },
    { label: '2 Bedroom', href: '/search?bedrooms=2' },
    ...activeCats.slice(0, 4).map((c) => ({ label: c.label, href: '/search?type=' + encodeURIComponent(c.value) })),
  ]

  const trustItems = [
    total > 0 ? <><CountUp to={total} /> live {total === 1 ? 'listing' : 'listings'}</> : null,
    verifiedLandlords > 0 ? <><CountUp to={verifiedLandlords} /> verified {verifiedLandlords === 1 ? 'landlord' : 'landlords'}</> : null,
    <>Every listing reviewed</>,
    <>Pay only through EboHomes</>,
  ].filter(Boolean) as React.ReactNode[]

  const hasListings = total > 0
  const showEmpty = !loading && !loadError && !hasListings
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* 1. HERO */}
        <section aria-labelledby="home-hero-heading">
          <div className="relative isolate overflow-hidden bg-forest">
            <HeroBackground />
            <div className="absolute inset-0 z-[3] bg-forest/70" aria-hidden="true" />
            <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/30 via-transparent to-forest" aria-hidden="true" />
            <div className="container-content relative z-10 pb-32 pt-14 text-center md:pb-44 md:pt-24">
              <motion.p
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mb-4 text-caption font-semibold uppercase tracking-widest text-featured"
              >
                Real Estate You Can Trust.
              </motion.p>
              <motion.h1
                id="home-hero-heading"
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto max-w-3xl text-balance text-display font-bold text-white"
              >
                Find a place that feels like home.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto mt-4 max-w-xl text-pretty text-body-lg text-white/85"
              >
                Discover reviewed rental homes across Ebonyi State with a simpler, more transparent way to find your next home.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto mt-7 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center"
              >
                <Link href="/search" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }))}>
                  Explore Properties <ArrowRight aria-hidden="true" />
                </Link>
                <Link
                  href="/list-property"
                  className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white dark:border-white/40 dark:bg-transparent dark:hover:bg-white/10')}
                >
                  List Your Property
                </Link>
              </motion.div>
              <InstallButton variant="hero" />
            </div>
          </div>

          <div className="container-content relative z-20 -mt-28 md:-mt-32">
            <motion.form
              onSubmit={handleSearch} aria-label="Search homes"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-overlay sm:grid-cols-2 md:p-5 lg:grid-cols-[1.3fr_1fr_0.8fr_1.4fr_auto] lg:items-end lg:gap-4"
            >
              <div>
                <label htmlFor="home-location" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <MapPin size={14} aria-hidden="true" className="text-primary" /> Location
                </label>
                <input id="home-location" type="text" list="home-location-options" placeholder="Where are you looking?" value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} />
                <datalist id="home-location-options">
                  {locationSuggestions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div>
                <label htmlFor="home-type" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <HomeIcon size={14} aria-hidden="true" className="text-primary" /> Property type
                </label>
                <div className="relative">
                  <select id="home-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={`${fieldClass} appearance-none pr-9`}>
                    <option value="">Any type</option>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div>
                <label htmlFor="home-beds" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Bed size={14} aria-hidden="true" className="text-primary" /> Bedrooms
                </label>
                <div className="relative">
                  <select id="home-beds" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={`${fieldClass} appearance-none pr-9`}>
                    <option value="">Any</option>
                    {BEDROOM_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Tag size={14} aria-hidden="true" className="text-primary" /> Budget
                </span>
                <div className="flex items-center gap-2">
                  <input type="number" inputMode="numeric" min={0} aria-label="Minimum price" placeholder="Min price" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className={`${fieldClass} min-w-0`} />
                  <span className="text-sm text-muted-foreground" aria-hidden="true">–</span>
                  <input type="number" inputMode="numeric" min={0} aria-label="Maximum price" placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className={`${fieldClass} min-w-0`} />
                </div>
              </div>

              <Button type="submit" size="lg" disabled={isSearching} className="sm:col-span-2 lg:col-span-1">
                {isSearching ? <><Loader2 className="animate-spin" aria-hidden="true" /> Searching</> : <><Search aria-hidden="true" /> Search homes</>}
              </Button>
            </motion.form>

            <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map((chip) => (
                <Link key={chip.label} href={chip.href} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-rest transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  {chip.label}
                </Link>
              ))}
            </div>

            {recentSearches.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Recent:</span>
                {recentSearches.map((r) => (
                  <span key={r.query} className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/60 pl-3">
                    <Link href={`/search?${r.query}`} className="py-1.5 font-medium text-primary">{r.label}</Link>
                    <button type="button" onClick={() => persistRecent(recentSearches.filter((x) => x.query !== r.query))} aria-label={`Remove ${r.label}`} className="flex min-h-9 min-w-9 items-center justify-center text-muted-foreground hover:text-foreground">
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 2. TRUST BAR */}
        <div className="mt-8 border-y border-border bg-card">
          <div className="container-wide grid grid-cols-2 gap-x-6 gap-y-3 py-4 md:flex md:items-center md:justify-between">
            {trustItems.map((node, i) => (
              <p key={i} className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{node}</span>
              </p>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="container-wide mt-6">
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
              We could not load properties right now. Check your connection and{' '}
              <button type="button" onClick={() => window.location.reload()} className="font-semibold text-primary underline">try again</button>.
            </div>
          </div>
        )}

        {/* 3. DASHBOARD (signed in only) */}
        <SignedInHome />

        {/* 3b. EMPTY INVENTORY */}
        {showEmpty && <EmptyInventory />}

        {/* 4. FEATURED (only when featured listings exist) */}
        {loading ? (
          <Section width="wide" spacing="sm" aria-busy="true" aria-label="Loading properties">
            <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-64 animate-pulse rounded-card border border-border bg-card" />)}
            </div>
          </Section>
        ) : featured.length > 0 ? (
          <Section width="wide" spacing="sm" aria-labelledby="featured-heading">
            <SectionHead
              title="Featured homes" sub="Properties their landlords have chosen to promote." href="/search?featured=1" cta="See all"
              badge={<span className="inline-flex items-center gap-1 rounded-full bg-featured px-2.5 py-1 text-xs font-semibold text-featured-foreground"><Crown size={12} aria-hidden="true" /> Featured</span>}
            />
            <ListingRow items={featured} speed={0.6} />
          </Section>
        ) : null}

        {/* 5. BROWSE BY TYPE (only types with listings) */}
        {activeCats.length > 0 && (
          <Section width="wide" spacing="sm">
            <SectionHead title="Browse by property type" sub="Most listings first." href="/search" cta="View all" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {activeCats.map((cat) => {
                const count = categoryCounts[cat.value] ?? 0
                const photo = categoryPhotos[cat.value]
                return (
                  <Link
                    key={cat.value}
                    href={'/search?type=' + encodeURIComponent(cat.value)}
                    className="group relative aspect-[4/3] overflow-hidden rounded-card border border-border bg-forest text-left shadow-rest transition-all hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {photo ? (
                      <SmartImage src={img(photo, 500)} alt="" dark className="transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <cat.icon size={44} aria-hidden="true" className="absolute right-4 top-4 text-white/25" />
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 p-3.5">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-white md:text-base">
                        <cat.icon size={15} aria-hidden="true" className="shrink-0 text-featured" />
                        {cat.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/80">{count} {count === 1 ? 'listing' : 'listings'}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </Section>
        )}

        {/* 6. RECENTLY ADDED */}
        {!loading && recent.length > 0 && (
          <Section width="wide" spacing="sm">
            <div className="rounded-panel bg-forest py-6 text-forest-foreground shadow-raised dark:border dark:border-border md:py-9">
              <div className="px-5 md:px-8">
                <SectionHead title="Recently added" sub="The newest homes on EboHomes." href="/search?sort=newest" tone="dark" />
              </div>
              <div className="pl-5 md:pl-8">
                <ListingRow items={recent} speed={0.5} />
              </div>
            </div>
          </Section>
        )}

        {/* 7. EXPLORE BY AREA */}
        {(areas.length > 0 || !showEmpty) && (
          <Section width="wide" spacing="sm">
            <SectionHead title="Explore by area" sub={areas.length > 0 ? 'Real listing counts. Tap an area to see its properties.' : 'Search the areas around Ebonyi State.'} href="/search" cta="All areas" />
            {areas.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {areas.slice(0, 8).map((a) => (
                  <Link key={a.name} href={`/search?location=${encodeURIComponent(a.name)}`} className="group flex flex-col justify-between rounded-card border border-border bg-card p-4 shadow-rest transition hover:-translate-y-0.5 hover:border-primary hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:p-5">
                    <p className="text-4xl font-bold leading-none text-foreground sm:text-5xl">{a.count}</p>
                    <div className="mt-6">
                      <p className="line-clamp-1 text-base font-bold capitalize text-foreground">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.count === 1 ? 'property' : 'properties'} available</p>
                      <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">Explore <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {extraAreas.length > 0 && (
              <div className={areas.length > 0 ? 'mt-6' : ''}>
                <p className="mb-3 text-sm font-medium text-foreground">Search another area</p>
                <div className="flex flex-wrap gap-2">
                  {extraAreas.map((a) => (
                    <Link key={a} href={`/search?location=${encodeURIComponent(a)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <MapPin size={14} aria-hidden="true" className="text-primary" /> {SEARCH_AREA_LABELS[a] ?? a}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 8. VIDEO TOURS (only when real videos exist) */}
        {videos.length > 0 && (
          <Section width="wide" spacing="sm">
            <SectionHead title="Video tours" sub="Walk through the real property before you request a viewing." />
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {videos.map((l) => (
                <Link key={l.id} href={`/listing/${l.id}`} className="group w-[72%] shrink-0 snap-start overflow-hidden rounded-card border border-border bg-card shadow-rest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-[46%] md:w-[31%]">
                  <div className="relative overflow-hidden bg-black">
                    <video src={`${l.video_url}#t=0.5`} preload="none" muted playsInline className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-black shadow-lg"><Play size={22} aria-hidden="true" className="ml-0.5 fill-current" /></span>
                    </span>
                  </div>
                  <div className="p-3.5">
                    <p className="font-bold text-primary">{naira(l.price_monthly)}<span className="text-[11px] font-medium text-muted-foreground"> /month</span></p>
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{l.title ?? l.property_type}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{l.location_text}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* 9. HOW IT WORKS */}
        <HowItWorks />

        {/* 10. FOUNDER */}
        <FounderSection />

        {/* 11. WHY TRUST */}
        <Section tone="cream" aria-labelledby="why-trust-heading">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div className="relative h-60 w-full overflow-hidden rounded-card bg-secondary md:h-[420px]">
                <SmartImage src="/hero.jpg" alt="A home in Ebonyi State" />
              </div>
            </Reveal>
            <div>
              <Reveal>
                <p className="text-caption font-semibold uppercase tracking-wide text-primary">Our promise</p>
                <h2 id="why-trust-heading" className="mb-3 mt-2 text-h2 font-bold text-foreground">Why trust EboHomes?</h2>
                <p className="mb-8 max-w-md text-body text-muted-foreground">Finding a home in Ebonyi State shouldn&apos;t mean risking a scam. Here is what we do about it.</p>
              </Reveal>
              <ul className="grid gap-5 sm:grid-cols-2">
                {WHY_CHOOSE.map((item, i) => (
                  <li key={item.title}>
                    <Reveal delay={i * 0.05} className="flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><item.icon size={18} aria-hidden="true" /></span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* 12. INSTITUTIONS */}
        <Section spacing="sm">
          <Reveal><InstitutionsStrip /></Reveal>
        </Section>

        {/* 13. FAQ */}
        <Section id="faq" width="reading" className="scroll-mt-24" aria-labelledby="faq-heading">
          <div className="mb-6 md:mb-8">
            <h2 id="faq-heading" className="text-h2 font-bold text-foreground">Frequently asked questions</h2>
          </div>
          <FaqList />
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Still stuck? <Link href="/contact" className="font-semibold text-primary hover:underline">Contact EboHomes support</Link>
          </p>
        </Section>

        {/* 14. AI */}
        <AiComingSoon />

        {/* 15. APP INSTALL */}
        <InstallPromoSection />

        {/* 16. LANDLORDS */}
        <LandlordCta />

        {/* 17. FINAL CTA */}
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
            }
