'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  ShieldCheck,
  Home as HomeIcon,
  Tag,
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
  SearchCheck,
  Headphones,
  Crown,
  Camera,
  Loader2,
  Play,
  X,
  BadgeCheck,
  ArrowRight,
  Lock,
  Flag,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { InstallButton, InstallPromoSection } from '@/components/install-button'
import { ListingCard } from '@/components/listing-card'
import { SignedInHome } from '@/components/signed-in-home'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import useEmblaCarousel from 'embla-carousel-react'
import AutoScroll from 'embla-carousel-auto-scroll'
import { motion, animate, useInView, useReducedMotion } from 'motion/react'

/* =====================================================================
   PAGE PLAN (top to bottom, each section has ONE job)
   1  Hero ............ photos crossfade + search (the first impression)
   2  Trust bar ....... live numbers, said once
   3  Your dashboard .. signed-in only
   4  Featured ........ rolling slider
   5  Browse by type ..
   6  Recently added .. rolling slider in a dark panel
   7  Explore by area .
   8  Video tours ..... only when real videos exist
   9  How it works ....
   10 Why EboHomes .... the ONE trust section (promises + image + stats)
   11 Institutions .... EBSU / FUNAI ticker
   12 Founder ......... the story
   13 FAQ
   14 EboHomes AI ..... coming soon
   15 App install
   16 For landlords ... featured upgrade (carousel)
   17 Final call to action
   ===================================================================== */

/* ---------------------------------------------------------------------
   CONTENT
   --------------------------------------------------------------------- */

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

const WHY_CHOOSE = [
  { title: 'Landlord checks', desc: 'Landlords submit their details and documents for review before their listings go live.', icon: ShieldCheck },
  { title: 'Reviewed listings', desc: 'EboHomes checks every listing before it appears, so what you see is a real property.', icon: BadgeCheck },
  { title: 'One safe channel', desc: 'Viewings, applications and payments all go through EboHomes. Never pay anyone outside it.', icon: Lock },
  { title: 'Easy search', desc: 'Filters for area, type and budget help you find the right home fast.', icon: SearchCheck },
  { title: 'Report anything wrong', desc: 'See a fake or misleading listing? Report it and our team will review it.', icon: Flag },
  { title: 'Support when you need it', desc: 'Message the EboHomes team if you are unsure about anything.', icon: Headphones },
]

const FAQS = [
  { q: 'How do I see a property in person?', a: 'Open the listing and tap "Request a viewing". EboHomes arranges the inspection with the owner for you. You never have to chase anyone.' },
  { q: 'How do I apply for a property?', a: 'Tap "Apply now" on the listing and fill in the form. EboHomes handles the paperwork between you and the owner.' },
  { q: 'Who do I pay?', a: 'Only EboHomes. Never pay anyone outside EboHomes, because we cannot protect payments made elsewhere.' },
  { q: 'What if I see a fake or wrong listing?', a: 'Tap "Report" on the listing or use the report page. Our team reviews every report.' },
  { q: 'Is it free to search?', a: 'Yes. Searching and browsing are free for tenants.' },
  { q: 'I still have a question. Who can I ask?', a: 'Open the Contact page or chat with the EboHomes support team on WhatsApp.' },
]

const INSTITUTIONS = [
  { short: 'EBSU', name: 'Ebonyi State University', logo: '/ebsu-logo.png' },
  { short: 'FUNAI', name: 'Alex Ekwueme Federal University', logo: '/funai-logo.png' },
]

// EDIT THIS: founder story. Photo lives at /public/founder.jpg
const FOUNDER = {
  name: 'Onwe Rex',
  role: 'Founder, EboHomes',
  sub: 'Medical Laboratory Science student, EBSU',
  photo: '/founder.jpg',
  social: 'https://www.tiktok.com/@web4rexxie',
  eyebrow: 'The person building EboHomes',
  headline: 'I built EboHomes because I lived the problem.',
  paragraphs: [
    "I'm Onwe Rex, a 200 level Medical Laboratory Science student at EBSU.",
    "When I got to uni, finding a house turned into a struggle. Agents' fees, inspection fees, and still nothing that matched what I needed. Prices kept jumping, and with no direct access to the owner, that extra money was simply wasted.",
    'So I started building a better way: real, reviewed properties, one trusted platform, and no wasted inspection money.',
  ],
  skillsLine: 'Beyond EboHomes, I build solutions to real problems with:',
  skills: ['AI Agents', 'Automation', 'Web3 & Crypto', 'Web Building'],
  highlight: 'Built by a student who needed it first, for everyone who still does.',
  cta: 'Follow the EboHomes journey',
}

// Hero photos: put them in /public. Missing files are skipped; if none load, /hero.jpg is used.
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

/* ---------------------------------------------------------------------
   HELPERS
   --------------------------------------------------------------------- */

const naira = (v: unknown) => `₦${(Number(v) || 0).toLocaleString('en-NG')}`

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
    image: img(l.photos?.[0], 600),
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

const fieldClass =
  'h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

/* ---------------------------------------------------------------------
   MOTION
   --------------------------------------------------------------------- */

// Never fully blank (starts at 25%) so a quick scroll cannot leave an empty gap.
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
  return <span ref={ref}>0</span>
}

/* ---------------------------------------------------------------------
   LAYOUT HELPERS
   --------------------------------------------------------------------- */

function Section({ children, id, className = '' }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-14 lg:px-8 ${className}`}>
      {children}
    </section>
  )
}

function SectionHead({
  title,
  sub,
  href,
  cta = 'See all',
  tone = 'light',
}: {
  title: string
  sub?: string
  href?: string
  cta?: string
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'
  return (
    <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
      <div>
        <h2 className={`text-2xl font-bold tracking-tight md:text-4xl ${dark ? 'text-white' : 'text-foreground'}`}>{title}</h2>
        {sub && <p className={`mt-1.5 text-sm md:text-base ${dark ? 'text-white/70' : 'text-muted-foreground'}`}>{sub}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className={`group inline-flex shrink-0 items-center gap-1 text-sm font-semibold ${dark ? 'text-amber-300' : 'text-primary'}`}
        >
          {cta}
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------
   ROLLING SLIDER (Embla + AutoScroll): drag works, pauses on hover/touch, resumes after
   --------------------------------------------------------------------- */

function Marquee({ slides, speed = 0.6 }: { slides: React.ReactNode[]; speed?: number }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: true, align: 'start' }, [
    AutoScroll({ speed, startDelay: 0, stopOnInteraction: false, stopOnMouseEnter: true }),
  ])

  useEffect(() => {
    if (!emblaApi) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      emblaApi.plugins().autoScroll?.stop()
    }
  }, [emblaApi])

  return (
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="-ml-4 flex touch-pan-y items-start">
        {slides.map((s, i) => (
          <div key={i} className="min-w-0 shrink-0 grow-0 pl-4">
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

function ListingMarquee({ items, speed }: { items: Listing[]; speed: number }) {
  return (
    <Marquee
      speed={speed}
      slides={items.map((l) => (
        <div key={l.id} className="w-64 sm:w-72">
          <ListingCard {...cardProps(l)} />
        </div>
      ))}
    />
  )
}

/* ---------------------------------------------------------------------
   HERO BACKGROUND: slow crossfade between your photos
   --------------------------------------------------------------------- */

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
        transition: reduce
          ? 'none'
          : state === 'hidden'
            ? `opacity ${HERO_FADE_MS}ms ease-in-out`
            : `opacity ${HERO_FADE_MS}ms ease-in-out, transform 9000ms linear`,
      }}
    />
  )
}

function HeroBackground() {
  const reduceMotion = useReducedMotion()
  const reduce = Boolean(reduceMotion)
  const [images, setImages] = useState<string[]>([])
  const [pos, setPos] = useState({ current: 0, previous: -1 })

  // Each photo joins the moment it finishes loading, so the hero never waits for all of them
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

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (reduce || images.length < 2) return
    const t = setInterval(() => {
      setPos((p) => ({ current: (p.current + 1) % images.length, previous: p.current }))
    }, HERO_HOLD_MS)
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

/* ---------------------------------------------------------------------
   HOW IT WORKS: timeline that draws itself
   --------------------------------------------------------------------- */

function HowItWorks() {
  const reduce = useReducedMotion()
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16 lg:px-8">
      <Reveal className="mb-10 max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">Getting started</span>
        <h2 className="mt-2 text-2xl font-bold text-foreground md:text-4xl">
          From search to move in, <span className="text-primary">four steps</span>
        </h2>
      </Reveal>

      <div className="relative">
        <motion.div
          className="absolute bottom-6 left-6 top-6 w-0.5 origin-top bg-primary/30 md:hidden"
          initial={reduce ? false : { scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-0.5 origin-left bg-primary/30 md:block"
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />

        <ol className="relative grid gap-8 md:grid-cols-4 md:gap-4">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              className="flex gap-4 md:flex-col md:items-center md:text-center"
              initial={reduce ? false : { opacity: 0.25, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                <s.icon size={20} />
              </span>
              <div className="pt-1 md:pt-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-primary/70">Step 0{i + 1}</p>
                <p className="text-lg font-semibold text-foreground">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------
   INSTITUTIONS TICKER
   --------------------------------------------------------------------- */

function InstitutionsTicker() {
  const group = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {Array.from({ length: 4 }).flatMap((_, r) =>
        INSTITUTIONS.map((i) => (
          <div key={`${r}-${i.short}`} className="flex shrink-0 items-center gap-3.5 pl-8 sm:pl-12">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-secondary/40 p-1.5">
              <img src={i.logo} alt={hidden ? '' : i.short} className="h-full w-full object-contain" />
            </div>
            <div className="text-left">
              <p className="text-base font-bold text-primary">{i.short}</p>
              <p className="whitespace-nowrap text-xs text-muted-foreground">{i.name}</p>
            </div>
            <span className="ml-8 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30 sm:ml-12" />
          </div>
        )),
      )}
    </div>
  )

  return (
    <div className="rounded-3xl border border-border/60 bg-card py-8 shadow-sm md:py-10">
      <style>{`
        @keyframes eh-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .eh-ticker-track { animation: eh-ticker 32s linear infinite }
        .eh-ticker:hover .eh-ticker-track { animation-play-state: paused }
        @media (prefers-reduced-motion: reduce) { .eh-ticker-track { animation: none } }
      `}</style>
      <div className="px-6 text-center">
        <h3 className="mb-2 text-xl font-bold text-foreground md:text-2xl">Used by students and professionals</h3>
        <p className="mx-auto mb-7 max-w-md text-sm text-muted-foreground">
          Students and staff from leading institutions in Ebonyi State find their homes here.
        </p>
      </div>
      <div className="eh-ticker overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="eh-ticker-track flex w-max">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   FOUNDER
   --------------------------------------------------------------------- */

function FounderSection() {
  const reduce = useReducedMotion()
  const [imgOk, setImgOk] = useState(true)
  const initials = FOUNDER.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16 lg:px-8">
      <div className="grid items-center gap-10 md:grid-cols-[2fr_3fr] md:gap-14">
        <Reveal className="mx-auto w-full max-w-xs md:max-w-none">
          <div className="relative">
            <div className="absolute -inset-2 rotate-3 rounded-[2rem] bg-gradient-to-br from-primary/30 via-amber-300/30 to-emerald-300/20" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 shadow-2xl ring-1 ring-black/5">
              {imgOk ? (
                <img
                  src={FOUNDER.photo}
                  alt={`${FOUNDER.name}, ${FOUNDER.role}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setImgOk(false)}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl font-extrabold">{initials}</span>
                  <Camera size={20} className="opacity-70" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 pt-16">
                <p className="text-base font-bold text-white">{FOUNDER.name}</p>
                <p className="text-xs text-white/80">{FOUNDER.sub}</p>
              </div>
            </div>

            <motion.div
              className="absolute -right-2 top-6 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-lg md:-right-4"
              animate={reduce ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <BadgeCheck size={14} className="text-primary" />
              Founder
            </motion.div>
          </div>
        </Reveal>

        <div>
          <Reveal>
            <span className="text-xs font-bold uppercase tracking-widest text-primary md:text-sm">{FOUNDER.eyebrow}</span>
            <h2 className="mt-2 text-balance text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {FOUNDER.headline}
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="mt-4 space-y-3 text-base leading-relaxed text-muted-foreground md:text-lg">
            {FOUNDER.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </Reveal>

          <Reveal delay={0.15} className="mt-5">
            <p className="text-sm font-medium text-foreground">{FOUNDER.skillsLine}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOUNDER.skills.map((s) => (
                <span key={s} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary md:text-sm">
                  {s}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <blockquote className="mt-6 border-l-4 border-primary pl-4 text-lg font-bold text-foreground md:text-xl">{FOUNDER.highlight}</blockquote>
            <motion.a
              href={FOUNDER.social}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={reduce ? undefined : { scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90 sm:w-auto"
            >
              {FOUNDER.cta}
              <ArrowRight size={18} />
            </motion.a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------
   FAQ
   --------------------------------------------------------------------- */

function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="space-y-2.5">
      {FAQS.map((f, i) => {
        const isOpen = open === i
        return (
          <div key={f.q} className={`rounded-2xl border bg-card transition-colors ${isOpen ? 'border-primary/40' : 'border-border'}`}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground md:text-base"
            >
              {f.q}
              <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
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

/* ---------------------------------------------------------------------
   EBOHOMES AI: coming soon (static)
   --------------------------------------------------------------------- */

function AiComingSoon() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8" aria-labelledby="ebohomes-ai-heading">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-secondary/60 via-background to-secondary/30 px-6 py-10 sm:px-10 md:px-14 md:py-12">
          <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12">
            <div>
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-700 dark:text-amber-300">
                COMING SOON
              </span>
              <h2 id="ebohomes-ai-heading" className="mt-4 text-4xl font-extrabold tracking-tight text-emerald-950 dark:text-white sm:text-5xl">
                EboHomes AI
              </h2>
              <p className="mt-3 text-lg font-semibold text-primary md:text-xl">Intelligence for Nigerian Real Estate.</p>
              <p className="mt-3 max-w-md text-sm text-muted-foreground md:text-base">We&apos;re building a smarter way to navigate real estate in Nigeria.</p>
            </div>

            <svg viewBox="0 0 240 180" className="mx-auto h-auto w-full max-w-[240px] text-primary md:max-w-[280px]" fill="none" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                <path d="M30 95 L120 28 L210 95" />
                <path d="M48 84 V150 H192 V84" />
                <path d="M48 118 H192" opacity="0.5" />
                <path d="M120 28 V118" opacity="0.5" />
              </g>
              <g fill="currentColor" opacity="0.8">
                <circle cx="30" cy="95" r="3.5" />
                <circle cx="120" cy="28" r="3.5" />
                <circle cx="210" cy="95" r="3.5" />
                <circle cx="48" cy="150" r="3" />
                <circle cx="192" cy="150" r="3" />
                <circle cx="48" cy="118" r="2.5" />
                <circle cx="192" cy="118" r="2.5" />
              </g>
              <circle cx="120" cy="118" r="5" className="fill-amber-400" />
            </svg>
          </div>
        </div>
      </Reveal>
    </section>
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
  const [featuredIndex, setFeaturedIndex] = useState(0)
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

      // Featured order is shuffled on each visit so none is always first
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

    // Only landlords EboHomes actually verified
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
      if (Array.isArray(saved)) setRecentSearches(saved.slice(0, 4))
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
      const label = [location.trim(), propertyType, minPrice ? `from ${naira(minPrice)}` : '', maxPrice ? `up to ${naira(maxPrice)}` : '']
        .filter(Boolean)
        .join(' · ')
      persistRecent([{ label, query }, ...recentSearches.filter((r) => r.query !== query)].slice(0, 4))
    }
    startSearch(() => {
      router.push('/search' + (query ? '?' + query : ''))
    })
  }

  const locationSuggestions = Array.from(new Set(areas.map((a) => a.name)))
  const sortedCats = [...CATEGORIES].sort((a, b) => (categoryCounts[b.value] ?? 0) - (categoryCounts[a.value] ?? 0))

  const chips = [
    { label: 'Under ₦100k', href: '/search?maxPrice=100000' },
    { label: '₦100k – ₦300k', href: '/search?minPrice=100000&maxPrice=300000' },
    { label: '2 Bedroom', href: '/search?bedrooms=2' },
    ...CATEGORIES.filter((c) => (categoryCounts[c.value] ?? 0) > 0)
      .slice(0, 5)
      .map((c) => ({ label: c.label, href: '/search?type=' + encodeURIComponent(c.value) })),
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

  const current = featured[featuredIndex]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* ============ 1. HERO ============ */}
        <section>
          <div className="relative isolate overflow-hidden">
            <HeroBackground />
            <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/60 via-black/45 to-black/75" />

            <div className="relative z-10 mx-auto max-w-3xl px-4 pb-32 pt-14 text-center sm:px-6 md:pb-40 md:pt-24 lg:px-8">
              <motion.span
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm"
              >
                <ShieldCheck size={16} className="text-emerald-300" />
                Reviewed rentals. Real people.
              </motion.span>
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl"
              >
                Find verified homes in <span className="text-emerald-300">Ebonyi State</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto mt-4 max-w-xl text-pretty text-base text-white/90 md:text-lg"
              >
                A safer way to find and rent properties, with every listing reviewed before it goes live.
              </motion.p>
              <InstallButton variant="hero" />
            </div>
          </div>

          {/* Search overlaps the bottom of the hero */}
          <div className="relative z-20 mx-auto -mt-24 max-w-5xl px-4 sm:px-6 md:-mt-28 lg:px-8">
            <motion.form
              onSubmit={handleSearch}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl sm:grid-cols-2 md:p-5 lg:grid-cols-[1.4fr_1fr_1.3fr_auto] lg:items-end lg:gap-4"
            >
              <div>
                <label htmlFor="home-location" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <MapPin size={14} className="text-primary" />
                  Location
                </label>
                <input
                  id="home-location"
                  type="text"
                  list="home-location-options"
                  placeholder="Where are you looking?"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={fieldClass}
                />
                <datalist id="home-location-options">
                  {locationSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="home-type" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <HomeIcon size={14} className="text-primary" />
                  Property type
                </label>
                <div className="relative">
                  <select id="home-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={`${fieldClass} appearance-none pr-9`}>
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
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Tag size={14} className="text-primary" />
                  Budget
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Minimum price"
                    placeholder="Min price"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className={`${fieldClass} min-w-0`}
                  />
                  <span className="text-sm text-muted-foreground">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Maximum price"
                    placeholder="Max price"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className={`${fieldClass} min-w-0`}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSearching}
                className="h-12 rounded-xl bg-primary px-8 font-semibold text-primary-foreground hover:bg-primary/90 sm:col-span-2 lg:col-span-1"
              >
                {isSearching ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Searching
                  </>
                ) : (
                  <>
                    <Search size={18} className="mr-2" />
                    Search homes
                  </>
                )}
              </Button>
            </motion.form>

            <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => router.push(chip.href)}
                  className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {recentSearches.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Recent:</span>
                {recentSearches.map((r) => (
                  <span key={r.query} className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/60 pl-3">
                    <Link href={`/search?${r.query}`} className="py-1.5 font-medium text-primary">
                      {r.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => persistRecent(recentSearches.filter((x) => x.query !== r.query))}
                      aria-label={`Remove ${r.label}`}
                      className="px-2 py-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ============ 2. TRUST BAR ============ */}
        <div className="mt-8 border-y border-border bg-card">
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

        {/* ============ 3. YOUR DASHBOARD (signed-in only) ============ */}
        <SignedInHome />

        {/* ============ 4. FEATURED ============ */}
        <Section>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">Featured homes</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <Crown size={12} /> Hand-picked
            </span>
          </div>
          <p className="mb-6 text-sm text-muted-foreground md:text-base">Reviewed before they went live.</p>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-64 animate-pulse overflow-hidden rounded-2xl border border-border bg-card" />
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No featured properties yet.{' '}
              <Link href="/search" className="font-semibold text-primary">
                Browse all listings
              </Link>
            </div>
          ) : (
            <ListingMarquee items={featured} speed={0.6} />
          )}
        </Section>

        {/* ============ 5. BROWSE BY TYPE ============ */}
        <Section className="pt-0 md:pt-0">
          <SectionHead title="Browse by property type" sub="Most popular first." href="/search" cta="View all" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {sortedCats.slice(0, 4).map((cat) => (
              <button
                key={cat.value}
                onClick={() => router.push('/search?type=' + encodeURIComponent(cat.value))}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <cat.icon size={22} className="text-primary" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{cat.label}</span>
                  <span className="block text-xs text-muted-foreground">{categoryCounts[cat.value] ?? 0} listings</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {sortedCats.slice(4).map((cat) => (
              <button
                key={cat.value}
                onClick={() => router.push('/search?type=' + encodeURIComponent(cat.value))}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <cat.icon size={15} className="text-primary" />
                {cat.label}
                <span className="text-xs text-muted-foreground">{categoryCounts[cat.value] ?? 0}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ============ 6. RECENTLY ADDED ============ */}
        {(loading || recent.length > 0) && (
          <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
            {loading ? (
              <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
            ) : (
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 shadow-xl">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.07]"
                  style={{ backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                />
                <div className="relative z-10 py-6 md:py-9">
                  <div className="px-5 md:px-8">
                    <SectionHead title="Recently added" sub="The newest homes on EboHomes." href="/search" tone="dark" />
                  </div>
                  <div className="pl-5 md:pl-8">
                    <ListingMarquee items={recent} speed={0.5} />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============ 7. EXPLORE BY AREA ============ */}
        {areas.length > 0 && (
          <Section>
            <SectionHead title="Explore by area" sub="Real listing counts. Tap an area to see its properties." href="/search" cta="All areas" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {areas.slice(0, 8).map((a) => (
                <Link
                  key={a.name}
                  href={`/search?location=${encodeURIComponent(a.name)}`}
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md sm:p-5"
                >
                  <p className="text-4xl font-extrabold leading-none text-foreground sm:text-5xl">{a.count}</p>
                  <div className="mt-6">
                    <p className="line-clamp-1 text-base font-bold capitalize text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.count === 1 ? 'property' : 'properties'} available</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      Explore <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* ============ 8. VIDEO TOURS (only when real videos exist) ============ */}
        {videos.length > 0 && (
          <Section className="pt-0 md:pt-0">
            <SectionHead title="Video tours" sub="Walk through the real property before you request a viewing." />
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {videos.map((l) => (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group w-[72%] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card sm:w-[46%] md:w-[31%]"
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
                        <Play size={22} className="ml-0.5 fill-current" />
                      </span>
                    </span>
                  </div>
                  <div className="p-3.5">
                    <p className="font-extrabold text-primary">
                      {naira(l.price_monthly)}
                      <span className="text-[11px] font-medium text-muted-foreground"> /month</span>
                    </p>
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{l.title ?? l.property_type}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{l.location_text}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* ============ 9. HOW IT WORKS ============ */}
        <HowItWorks />

        {/* ============ 10. WHY EBOHOMES (the one trust section) ============ */}
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal className="relative">
              <img src="/hero.jpg" alt="A reviewed home in Ebonyi State" className="h-60 w-full rounded-3xl object-cover md:h-[460px]" />
              {stats.landlords > 0 && (
                <div className="absolute -bottom-6 -right-2 rounded-2xl border border-border bg-card px-5 py-4 shadow-xl sm:-right-6">
                  <p className="text-3xl font-extrabold text-foreground">
                    <CountUp to={stats.landlords} />
                  </p>
                  <p className="max-w-[150px] text-xs text-muted-foreground">Verified landlords ready to rent to you</p>
                </div>
              )}
            </Reveal>

            <div>
              <Reveal>
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">Our promise</span>
                <h2 className="mb-3 mt-2 text-2xl font-bold text-foreground md:text-4xl">
                  Why trust <span className="text-primary">EboHomes?</span>
                </h2>
                <p className="mb-8 max-w-md text-sm text-muted-foreground md:text-base">
                  Finding a home in Ebonyi State shouldn&apos;t mean risking a scam. Here is what we do about it.
                </p>
              </Reveal>
              <ul className="grid gap-5 sm:grid-cols-2">
                {WHY_CHOOSE.map((item, i) => (
                  <Reveal key={item.title} delay={i * 0.05}>
                    <li className="flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <item.icon size={18} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                      </div>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ 11. INSTITUTIONS ============ */}
        <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
          <Reveal>
            <InstitutionsTicker />
          </Reveal>
        </section>

        {/* ============ 12. FOUNDER ============ */}
        <FounderSection />

        {/* ============ 13. FAQ ============ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-10 sm:px-6 md:py-16">
          <SectionHead title="Frequently asked questions" />
          <FaqList />
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Still stuck?{' '}
            <Link href="/contact" className="font-semibold text-primary hover:underline">
              Contact EboHomes support
            </Link>
          </p>
        </section>

        {/* ============ 14. EBOHOMES AI (coming soon) ============ */}
        <AiComingSoon />

        {/* ============ 15. APP INSTALL ============ */}
        <InstallPromoSection />

        {/* ============ 16. FOR LANDLORDS: featured upgrade ============ */}
        <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 shadow-2xl">
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />

            <div className="relative z-10 grid items-center gap-10 p-8 md:grid-cols-2 md:gap-12 md:p-14">
              <div>
                <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-white/10 px-4 py-1.5 text-xs font-bold tracking-wide text-amber-300 backdrop-blur-md">
                  <Crown size={13} className="text-amber-400" />
                  FOR LANDLORDS
                </span>

                <h3 className="mb-4 text-3xl font-extrabold leading-tight text-white md:text-5xl">
                  Get your property{' '}
                  <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">featured</span>
                </h3>

                <p className="mb-7 max-w-sm text-sm leading-relaxed text-white/75 md:text-base">
                  Featured listings are shown on the EboHomes home page, in front of every visitor. Upgrade a listing to put it there.
                </p>

                <Button
                  onClick={() => router.push(current ? `/listing/${current.id}/feature` : '/dashboard/listings')}
                  className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-7 py-6 font-bold text-amber-950 shadow-lg shadow-amber-500/20 transition-all duration-300 hover:scale-[1.03] hover:from-amber-300 hover:to-amber-400"
                >
                  Upgrade to Featured
                  <ChevronRight size={18} className="ml-1" />
                </Button>
              </div>

              <div className="relative">
                {current && (
                  <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/10">
                    <div className="relative h-52 md:h-60">
                      <img src={img(current.photos?.[0], 800)} alt={current.property_type ?? 'Featured property'} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                      <span className="absolute left-3.5 top-3.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-1.5 text-xs font-bold text-amber-950 shadow">
                        Featured
                      </span>
                    </div>

                    <div className="p-5">
                      <p className="mb-1.5 text-xl font-extrabold text-primary">
                        {naira(current.price_monthly)}
                        <span className="text-sm font-medium text-muted-foreground">/month</span>
                      </p>
                      <p className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin size={13} />
                        {current.location_text}
                      </p>
                      <div className="flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <HomeIcon size={13} /> {current.property_type}
                        </span>
                        {current.bedrooms ? (
                          <span className="flex items-center gap-1.5">
                            <Bed size={13} /> {current.bedrooms} Beds
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {featured.length > 1 && (
                  <>
                    <button
                      aria-label="Previous featured property"
                      onClick={() => setFeaturedIndex((i) => (i - 1 + featured.length) % featured.length)}
                      className="absolute -left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-white md:-left-5"
                    >
                      <ChevronLeft size={18} className="text-foreground" />
                    </button>
                    <button
                      aria-label="Next featured property"
                      onClick={() => setFeaturedIndex((i) => (i + 1) % featured.length)}
                      className="absolute -right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-white md:-right-5"
                    >
                      <ChevronRight size={18} className="text-foreground" />
                    </button>

                    <div className="mt-5 flex justify-center gap-1.5">
                      {featured.map((_, i) => (
                        <button
                          key={i}
                          aria-label={`Go to featured property ${i + 1}`}
                          onClick={() => setFeaturedIndex(i)}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            i === featuredIndex ? 'w-7 bg-gradient-to-r from-amber-300 to-amber-500' : 'w-1.5 bg-white/30 hover:bg-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============ 17. FINAL CALL TO ACTION ============ */}
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 rounded-3xl border border-border/60 bg-gradient-to-br from-secondary/60 to-secondary/20 p-8 md:flex-row md:p-12">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-700 shadow-lg shadow-primary/20">
              <Home size={28} className="text-white" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="mb-1.5 text-xl font-bold text-foreground md:text-2xl">Ready to get started?</h3>
              <p className="text-sm text-muted-foreground md:text-base">List your property or explore reviewed properties across Ebonyi State.</p>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row md:w-auto">
              <Button
                onClick={() => router.push('/list-property')}
                className="rounded-full bg-primary px-7 py-6 font-semibold text-primary-foreground shadow-md transition-all duration-300 hover:scale-[1.02] hover:bg-primary/90 hover:shadow-lg"
              >
                <Home size={16} className="mr-2" />
                List your property
              </Button>
              <Button
                onClick={() => router.push('/search')}
                variant="outline"
                className="rounded-full border-primary/40 px-7 py-6 font-semibold text-primary transition-all duration-300 hover:scale-[1.02] hover:border-primary hover:bg-primary/5"
              >
                <Search size={16} className="mr-2" />
                Browse properties
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
