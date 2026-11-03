'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  ShieldCheck,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Key,
  Building2,
  Home,
  DoorOpen,
  Building,
  Bed,
  Briefcase,
  Store,
  MapPinned,
  Warehouse,
  CalendarClock,
  Users,
  BadgeCheck,
  Lock,
  Flag,
  Play,
  Loader2,
  X,
  ArrowRight,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { ListingCard } from '@/components/listing-card'
import { SignedInHome } from '@/components/signed-in-home'
import { supabase } from '@/lib/supabase'
import { motion, animate, useInView, useReducedMotion } from 'motion/react'

/* =====================================================================
   CONTENT (edit copy here, not in the layout below)
   ===================================================================== */

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

const RECENT_KEY = 'ebo_recent_searches'

const STEPS = [
  { icon: Search, title: 'Search', desc: 'Filter by area, type and budget until something fits.' },
  { icon: ClipboardCheck, title: 'Request a viewing', desc: 'EboHomes arranges the inspection. You never chase an owner or agent.' },
  { icon: BadgeCheck, title: 'Apply', desc: 'Apply online. EboHomes handles the paperwork with the owner.' },
  { icon: Key, title: 'Move in', desc: 'Sign the agreement and collect your keys. Pay only through EboHomes.' },
]

const PROMISES = [
  { icon: BadgeCheck, title: 'Landlord checks', text: 'Landlords submit their details and documents for review before listing.' },
  { icon: ShieldCheck, title: 'Reviewed listings', text: 'Every listing is checked by EboHomes before it goes live.' },
  { icon: Lock, title: 'One safe channel', text: 'Viewings, applications and payments all go through EboHomes.' },
  { icon: Flag, title: 'Report anything wrong', text: 'See a fake or misleading listing? Report it and we will review it.' },
]

const INSTITUTIONS = [
  { short: 'EBSU', name: 'Ebonyi State University', logo: '/ebsu-logo.png' },
  { short: 'FUNAI', name: 'Alex Ekwueme Federal University', logo: '/funai-logo.png' },
]

const FAQS = [
  { q: 'How do I see a property in person?', a: 'Open the listing and tap "Request a viewing". EboHomes arranges the inspection with the owner for you. You never have to chase anyone.' },
  { q: 'How do I apply for a property?', a: 'Tap "Apply now" on the listing and fill in the form. EboHomes handles the paperwork between you and the owner.' },
  { q: 'Who do I pay?', a: 'Only EboHomes. Never pay anyone outside EboHomes, because we cannot protect payments made elsewhere.' },
  { q: 'What if I see a fake or wrong listing?', a: 'Tap "Report" on the listing or use the report page. Our team reviews every report.' },
  { q: 'Is it free to search?', a: 'Yes. Searching and browsing are free for tenants.' },
  { q: 'I still have a question. Who can I ask?', a: 'Open the Contact page or chat with the EboHomes support team on WhatsApp.' },
]

// Founder photo: the current /founder.jpg is an AI-art avatar, which weakens trust.
// Set FOUNDER.photo to '/founder.jpg' once you replace that file with a real portrait (4:5 works best).
// Until then the section shows a clean monogram instead.
const FOUNDER = {
  name: 'Onwe Rex',
  role: 'Founder, EboHomes',
  sub: 'Medical Laboratory Science student, EBSU',
  photo: '' as string,
  social: 'https://www.tiktok.com/@web4rexxie',
  headline: 'I built EboHomes because I lived the problem.',
  paragraphs: [
    "I'm Onwe Rex, a 200 level Medical Laboratory Science student at EBSU.",
    "When I got to uni, finding a house turned into a struggle. Agents' fees, inspection fees, and still nothing that matched what I needed. Prices kept jumping, and with no direct access to the owner, that extra money was simply wasted.",
    'So I started building a better way: real, reviewed properties, one trusted platform, and no wasted inspection money.',
  ],
  highlight: 'Built by a student who needed it first, for everyone who still does.',
  cta: 'Follow the journey',
}

/* =====================================================================
   TYPES + HELPERS
   ===================================================================== */

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

// Cloudinary: auto format + quality + width. Other URLs are left alone.
function img(url: string | undefined, width: number) {
  if (!url) return '/placeholder.jpg'
  if (!url.includes('/upload/') || url.includes('/upload/f_auto')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}

function cardProps(l: Listing) {
  return {
    id: l.id,
    landlord_id: l.landlord_id,
    title: l.title,
    image: img(l.photos?.[0], 700),
    photoCount: Array.isArray(l.photos) ? l.photos.length : undefined,
    bathrooms: l.bathrooms,
    price_monthly: l.price_monthly,
    price_yearly: l.price_yearly,
    location: l.location_text,
    property_type: l.property_type,
    bedrooms: l.bedrooms,
    created_at: l.created_at,
    featured: l.featured,
  }
}

const inputClass =
  'h-12 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'

/* =====================================================================
   SMALL BUILDING BLOCKS
   ===================================================================== */

// The only entrance animation on the page: the hero text and search panel arrive in sequence on load.
function HeroIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// Simple fade for below-the-fold blocks. Starts at 30% opacity so a fast scroll never shows a blank gap.
function Fade({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0.3 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
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
  return <span ref={ref}>0</span>
}

function Section({ children, id, className = '' }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-20 lg:px-8 ${className}`}>
      {children}
    </section>
  )
}

function SectionHead({ title, sub, href, cta = 'View all' }: { title: string; sub?: string; href?: string; cta?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 md:mb-10">
      <div className="max-w-xl">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h2>
        {sub && <p className="mt-2 text-sm text-muted-foreground md:text-base">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-primary sm:inline-flex">
          {cta}
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

// Hero photo: one image, a single slow settle on load. No slideshow.
function HeroImage() {
  const reduce = useReducedMotion()
  const [src, setSrc] = useState('/hero-home.jpg')
  return (
    <div className="absolute inset-0 overflow-hidden bg-emerald-950" aria-hidden="true">
      <motion.img
        src={src}
        alt=""
        onError={() => setSrc('/hero.jpg')}
        className="h-full w-full object-cover"
        initial={reduce ? false : { scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/90 via-emerald-950/60 to-emerald-950/30" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  )
}

// Horizontal scroller: swipe on phones, arrow buttons on desktop. Nothing moves on its own.
function Scroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const by = (dir: number) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  const arrow =
    'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition hover:scale-105 md:flex'
  return (
    <div className="relative">
      <div
        ref={ref}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button type="button" aria-label="Previous" onClick={() => by(-1)} className={`${arrow} -left-5`}>
        <ChevronLeft size={20} />
      </button>
      <button type="button" aria-label="Next" onClick={() => by(1)} className={`${arrow} -right-5`}>
        <ChevronRight size={20} />
      </button>
    </div>
  )
}

function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y divide-border border-y border-border">
      {FAQS.map((f, i) => {
        const isOpen = open === i
        return (
          <div key={f.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-medium text-foreground"
            >
              {f.q}
              <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <p className="pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FounderSection() {
  const [photoOk, setPhotoOk] = useState(true)
  const initials = FOUNDER.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const hasPhoto = Boolean(FOUNDER.photo) && photoOk

  return (
    <Section>
      <div className="grid items-start gap-10 md:grid-cols-[2fr_3fr] md:gap-16">
        <Fade className="mx-auto w-full max-w-xs md:max-w-none">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-emerald-950">
            {hasPhoto ? (
              <img
                src={FOUNDER.photo}
                alt={`${FOUNDER.name}, ${FOUNDER.role}`}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setPhotoOk(false)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-7xl font-semibold tracking-tight text-white/90">{initials}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-20">
              <p className="text-base font-semibold text-white">{FOUNDER.name}</p>
              <p className="text-xs text-white/75">{FOUNDER.sub}</p>
            </div>
          </div>
        </Fade>

        <Fade>
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">{FOUNDER.headline}</h2>
          <div className="mt-6 max-w-xl space-y-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {FOUNDER.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-8 max-w-xl border-l-2 border-primary pl-4 text-lg font-medium text-foreground">{FOUNDER.highlight}</p>
          <a
            href={FOUNDER.social}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
          >
            {FOUNDER.cta}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </a>
        </Fade>
      </div>
    </Section>
  )
}

/* =====================================================================
   PAGE
   ===================================================================== */

export default function HomePage() {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const [featured, setFeatured] = useState<Listing[]>([])
  const [recent, setRecent] = useState<Listing[]>([])
  const [videos, setVideos] = useState<Listing[]>([])
  const [areas, setAreas] = useState<{ name: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState({ properties: 0, landlords: 0 })
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])
  const [isSearching, startSearch] = useTransition()

  useEffect(() => {
    const fetchHome = async () => {
      setLoading(true)
      setLoadError(false)

      // One query; everything else on the page is derived from it
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

      // Featured order is shuffled per visit so no listing is always first
      const shuffled = rows.filter((l) => l.featured)
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setFeatured(shuffled)
      setRecent(rows.slice(0, 6))
      setVideos(rows.filter((l) => l.video_url).slice(0, 6))

      const types: Record<string, number> = {}
      const places: Record<string, { name: string; count: number }> = {}
      for (const r of rows) {
        if (r.property_type) types[r.property_type] = (types[r.property_type] ?? 0) + 1
        const name = (r.location_text ?? '').trim()
        if (name) {
          const key = name.toLowerCase()
          places[key] = { name: places[key]?.name ?? name, count: (places[key]?.count ?? 0) + 1 }
        }
      }
      setCategoryCounts(types)
      setAreas(Object.values(places).sort((a, b) => b.count - a.count))
      setStats((s) => ({ ...s, properties: rows.length }))
      setLoading(false)
    }
    fetchHome()

    // Only landlords who were actually verified are counted
    const fetchLandlords = async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'landlord')
        .eq('verification_status', 'verified')
      setStats((s) => ({ ...s, landlords: count ?? 0 }))
    }
    fetchLandlords()

    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
      if (Array.isArray(saved)) setRecentSearches(saved.slice(0, 3))
    } catch {}
  }, [])

  const persistRecent = (next: RecentSearch[]) => {
    setRecentSearches(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {}
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location) params.set('location', location)
    if (propertyType) params.set('type', propertyType)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    const query = params.toString()
    if (query) {
      const label = [
        location.trim(),
        propertyType,
        minPrice ? `from ${naira(minPrice)}` : '',
        maxPrice ? `up to ${naira(maxPrice)}` : '',
      ]
        .filter(Boolean)
        .join(', ')
      persistRecent([{ label, query }, ...recentSearches.filter((r) => r.query !== query)].slice(0, 3))
    }
    // isSearching stays true until the search page has loaded, so the button keeps its spinner
    startSearch(() => {
      router.push('/search' + (query ? '?' + query : ''))
    })
  }

  const locationSuggestions = Array.from(new Set(areas.map((a) => a.name)))
  const sortedCats = [...CATEGORIES].sort((a, b) => (categoryCounts[b.value] ?? 0) - (categoryCounts[a.value] ?? 0))
  const activeCats = sortedCats.filter((c) => (categoryCounts[c.value] ?? 0) > 0)
  const shownCats = (activeCats.length > 0 ? activeCats : sortedCats).slice(0, 8)

  const chips = [
    { label: 'Under ₦100k', href: '/search?maxPrice=100000' },
    { label: '2 bedroom', href: '/search?bedrooms=2' },
    ...activeCats.slice(0, 4).map((c) => ({ label: c.label, href: '/search?type=' + encodeURIComponent(c.value) })),
  ]

  const trustItems = [
    stats.properties > 0 ? (
      <>
        <CountUp to={stats.properties} /> live listings
      </>
    ) : null,
    stats.landlords > 0 ? (
      <>
        <CountUp to={stats.landlords} /> verified landlords
      </>
    ) : null,
    <>Every listing reviewed</>,
    <>Pay only through EboHomes</>,
  ].filter(Boolean) as React.ReactNode[]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="relative isolate overflow-hidden">
          <HeroImage />
          <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 md:pb-14 md:pt-28 lg:px-8">
            <div className="max-w-2xl">
              <HeroIn>
                <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Find a home in Ebonyi State you can trust.
                </h1>
              </HeroIn>
              <HeroIn delay={0.1}>
                <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/80 md:text-lg">
                  Every listing is reviewed. Viewings, applications and payments all go through EboHomes, so you never deal with strangers.
                </p>
              </HeroIn>
            </div>

            <HeroIn delay={0.25} className="mt-8 md:mt-12">
              <form
                onSubmit={handleSearch}
                className="grid gap-3 rounded-2xl bg-card p-3 shadow-2xl ring-1 ring-black/5 sm:grid-cols-2 md:p-4 lg:grid-cols-[1.5fr_1fr_1.2fr_auto] lg:items-end lg:gap-3"
              >
                <div>
                  <label htmlFor="home-location" className="mb-1.5 block px-0.5 text-xs font-medium text-muted-foreground">
                    Location
                  </label>
                  <input
                    id="home-location"
                    type="text"
                    list="home-location-options"
                    placeholder="Where are you looking?"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={inputClass}
                  />
                  <datalist id="home-location-options">
                    {locationSuggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="home-type" className="mb-1.5 block px-0.5 text-xs font-medium text-muted-foreground">
                    Property type
                  </label>
                  <div className="relative">
                    <select
                      id="home-type"
                      value={propertyType}
                      onChange={(e) => setPropertyType(e.target.value)}
                      className={`${inputClass} appearance-none pr-9`}
                    >
                      <option value="">Any type</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-1">
                  <span className="mb-1.5 block px-0.5 text-xs font-medium text-muted-foreground">Budget per month (₦)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label="Minimum price"
                      placeholder="Min"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      className={`${inputClass} min-w-0`}
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label="Maximum price"
                      placeholder="Max"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className={`${inputClass} min-w-0`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSearching}
                  className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70 sm:col-span-2 lg:col-span-1"
                >
                  {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                  {isSearching ? 'Searching' : 'Search homes'}
                </button>
              </form>

              <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {chips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => router.push(chip.href)}
                    className="shrink-0 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {recentSearches.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
                  <span>Recent:</span>
                  {recentSearches.map((r) => (
                    <span key={r.query} className="inline-flex items-center gap-1">
                      <Link href={`/search?${r.query}`} className="underline-offset-4 hover:text-white hover:underline">
                        {r.label}
                      </Link>
                      <button
                        type="button"
                        onClick={() => persistRecent(recentSearches.filter((x) => x.query !== r.query))}
                        aria-label={`Remove ${r.label}`}
                        className="hover:text-white"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </HeroIn>
          </div>
        </section>

        {/* ---------- Trust bar: the one place trust is stated as facts ---------- */}
        <div className="border-b border-border bg-card">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:px-6 md:flex md:items-center md:justify-between lg:px-8">
            {trustItems.map((node, i) => (
              <p key={i} className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{node}</span>
              </p>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
              We could not load properties right now. Check your connection and{' '}
              <button type="button" onClick={() => window.location.reload()} className="font-semibold text-primary underline">
                try again
              </button>
              .
            </div>
          </div>
        )}

        {/* Signed-in dashboard (renders nothing for visitors) */}
        <SignedInHome />

        {/* ---------- Featured ---------- */}
        <Section>
          <SectionHead title="Featured homes" sub="Hand-picked listings, reviewed before they went live." href="/search" />
          {loading ? (
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-80 w-64 shrink-0 animate-pulse rounded-2xl bg-muted sm:w-72" />
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No featured homes right now.{' '}
              <Link href="/search" className="font-semibold text-primary">
                Browse all listings
              </Link>
            </div>
          ) : (
            <Scroller>
              {featured.map((l) => (
                <div key={l.id} className="w-[78%] shrink-0 snap-start sm:w-72">
                  <ListingCard {...cardProps(l)} />
                </div>
              ))}
            </Scroller>
          )}
        </Section>

        {/* ---------- Browse by type ---------- */}
        <Section className="pt-0 md:pt-0">
          <SectionHead title="Browse by property type" href="/search" cta="All types" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {shownCats.map((cat) => {
              const n = categoryCounts[cat.value] ?? 0
              return (
                <Link
                  key={cat.value}
                  href={'/search?type=' + encodeURIComponent(cat.value)}
                  className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-4 transition duration-300 hover:border-primary/40 hover:shadow-lg md:p-5"
                >
                  <cat.icon size={22} className="text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground md:text-base">{cat.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {n} {n === 1 ? 'listing' : 'listings'}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </Section>

        {/* ---------- Newest ---------- */}
        {(loading || recent.length > 0) && (
          <Section className="pt-0 md:pt-0">
            <SectionHead title="Recently added" sub="The newest homes on EboHomes." href="/search" />
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {recent.map((l) => (
                  <ListingCard key={l.id} {...cardProps(l)} />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ---------- Areas ---------- */}
        {areas.length > 0 && (
          <Section className="pt-0 md:pt-0">
            <SectionHead title="Explore by area" sub="Counts come from approved listings." href="/search" cta="All areas" />
            <div className="grid gap-x-12 md:grid-cols-2">
              {areas.slice(0, 8).map((a) => (
                <Link
                  key={a.name}
                  href={`/search?location=${encodeURIComponent(a.name)}`}
                  className="group flex items-center justify-between border-b border-border py-4 transition-colors hover:border-primary/50"
                >
                  <span className="flex items-center gap-3 text-base font-medium text-foreground">
                    <MapPin size={16} className="text-primary" />
                    <span className="line-clamp-1 capitalize">{a.name}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {a.count} {a.count === 1 ? 'property' : 'properties'}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* ---------- Video tours (only when real videos exist) ---------- */}
        {videos.length > 0 && (
          <Section className="pt-0 md:pt-0">
            <SectionHead title="Video tours" sub="See the real property before you request a viewing." />
            <Scroller>
              {videos.map((l) => (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group w-[80%] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card sm:w-80"
                >
                  <div className="relative overflow-hidden bg-black">
                    <video
                      src={`${l.video_url}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-black shadow-lg">
                        <Play size={20} className="ml-0.5 fill-current" />
                      </span>
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-primary">
                      {naira(l.price_monthly)}
                      <span className="text-xs font-normal text-muted-foreground"> /month</span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-sm font-medium text-foreground">{l.title ?? l.property_type}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{l.location_text}</p>
                  </div>
                </Link>
              ))}
            </Scroller>
          </Section>
        )}

        {/* ---------- How it works (a real sequence, so numbered) ---------- */}
        <Section id="how-it-works" className="border-t border-border">
          <SectionHead title="From search to move-in in four steps" />
          <ol className="grid gap-10 md:grid-cols-4 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="list-none">
                <div className="mb-5 flex items-center gap-4">
                  <span className="text-sm font-semibold tabular-nums text-primary">0{i + 1}</span>
                  <span className="h-px flex-1 bg-border" />
                  <s.icon size={20} className="text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ---------- Why EboHomes (the one dark block on the page) ---------- */}
        <section className="bg-emerald-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1fr_1.4fr] lg:gap-20 lg:px-8">
            <div>
              <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
                Renting shouldn&apos;t feel like a risk.
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
                Finding a home in Ebonyi State shouldn&apos;t mean risking a scam. This is what we do about it.
              </p>
              <Link href="/about" className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
                About EboHomes
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {PROMISES.map((p) => (
                <div key={p.title}>
                  <p.icon size={22} className="text-emerald-300" />
                  <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Institutions (static, quiet) ---------- */}
        <Section className="py-10 md:py-14">
          <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
            <p className="max-w-xs text-sm text-muted-foreground">Used by students and staff from leading institutions in Ebonyi State.</p>
            <div className="flex items-center gap-8 md:gap-12">
              {INSTITUTIONS.map((i) => (
                <div key={i.short} className="flex items-center gap-3 opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0">
                  <img src={i.logo} alt="" className="h-10 w-10 object-contain" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">{i.short}</p>
                    <p className="hidden text-xs text-muted-foreground sm:block">{i.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ---------- Founder ---------- */}
        <FounderSection />

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-12 sm:px-6 md:py-20">
          <SectionHead title="Questions, answered" />
          <FaqList />
          <p className="mt-6 text-sm text-muted-foreground">
            Still stuck?{' '}
            <Link href="/contact" className="font-semibold text-primary hover:underline">
              Contact EboHomes support
            </Link>
          </p>
        </section>

        {/* ---------- Two-audience CTA ---------- */}
        <Section className="pt-0 md:pt-0">
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <div className="flex h-full flex-col justify-between gap-10 rounded-2xl border border-border bg-card p-8 md:p-10">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Looking for a home?</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Browse reviewed properties across Ebonyi State and let EboHomes handle viewings, applications and payments.
                </p>
              </div>
              <Link
                href="/search"
                className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
              >
                <Search size={16} /> Browse homes
              </Link>
            </div>

            <div className="flex h-full flex-col justify-between gap-10 rounded-2xl bg-emerald-950 p-8 text-white md:p-10">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">Own a property?</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Reach tenants across Ebonyi State. Every listing is reviewed before it goes live, and EboHomes manages the viewings.
                </p>
              </div>
              <Link
                href="/list-property"
                className="inline-flex w-fit items-center gap-2 rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-amber-300 active:scale-[0.98]"
              >
                <Home size={16} /> List your property
              </Link>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </div>
  )
}
