'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  ShieldCheck,
  Home as HomeIcon,
  MessageCircle,
  Tag,
  MapPin,
  ChevronDown,
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
  ScanFace,
  BadgeCheck,
  SearchCheck,
  Headphones,
  CheckCircle2,
  Crown,
  Eye,
  Heart,
  ChevronLeft,
  ChevronRight,
  Camera,
  Loader2,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { ListingCard } from '@/components/listing-card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import useEmblaCarousel from 'embla-carousel-react'
import AutoScroll from 'embla-carousel-auto-scroll'
import { motion, animate, useInView, useReducedMotion } from 'motion/react'


const CATEGORIES = [
  { value: 'Flat / Apartment', label: 'Apartments', desc: 'Modern apartments for comfortable living', icon: Building2 },
  { value: 'Bungalow', label: 'Bungalows', desc: 'Spacious bungalows for families', icon: Home },
  { value: 'Self Contain', label: 'Self-Contain', desc: 'Private self-contained apartments', icon: DoorOpen },
  { value: 'Duplex', label: 'Duplexes', desc: 'Luxury duplexes with premium features', icon: Building },
  { value: 'Penthouse', label: 'Penthouses', desc: 'Premium top-floor living', icon: Bed },
  { value: 'Hostel', label: 'Hostels', desc: 'Shared spaces for students & professionals', icon: Users },
  { value: 'Office', label: 'Offices', desc: 'Professional spaces for your business', icon: Briefcase },
  { value: 'Shop / Mall', label: 'Shops & Malls', desc: 'Shops and commercial spaces', icon: Store },
  { value: 'Warehouse', label: 'Warehouses', desc: 'Warehouse and storage facilities', icon: Warehouse },
  { value: 'Land / Plot', label: 'Lands & Plots', desc: 'Residential and commercial lands', icon: MapPinned },
  { value: 'Event Center', label: 'Event Centers', desc: 'Spaces for events and gatherings', icon: CalendarClock },
]

const WHY_CHOOSE = [
  { title: 'Landlord Checks', desc: 'Landlords submit their details and documents for review before their listings go live.', icon: ShieldCheck },,
  { title: 'Secure & Safe', desc: 'Your safety is our priority with secure messaging.', icon: ScanFace },
  { title: 'Quality Listings', desc: 'We approve every listing to ensure genuine properties.', icon: BadgeCheck },
  { title: 'Easy Search', desc: 'Advanced filters help you find the perfect home fast.', icon: SearchCheck },
  { title: 'Always Here', desc: 'Our support team is ready to help whenever you need us.', icon: Headphones },
]

// Continuous rolling row (Embla + AutoScroll): smooth, swipe/drag works, resumes after you let go.
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

function FeaturedMarquee({ items }: { items: any[] }) {
  return (
    <Marquee
      speed={0.6}
      slides={items.map((listing) => (
        <div key={listing.id} className="w-64 sm:w-72">
          <ListingCard
            id={listing.id}
            landlord_id={listing.landlord_id}
            image={listing.photos?.[0] ?? ''}
            price_monthly={listing.price_monthly}
            price_yearly={listing.price_yearly}
            location={listing.location_text}
            property_type={listing.property_type}
            bedrooms={listing.bedrooms}
            verified={listing.verified}
            featured={listing.featured}
          />
        </div>
      ))}
    />
  )
}

function addedText(createdAt?: string) {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
  if (Number.isNaN(days) || days < 0) return ''
  if (days === 0) return 'Added today'
  if (days === 1) return 'Added yesterday'
  if (days <= 7) return `Added ${days} days ago`
  return ''
}

// Recently added: green box, fixed-size cards, same rolling motion as Featured.
function RecentMarquee({ items }: { items: any[] }) {
  const router = useRouter()
  if (items.length === 0) return null

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 shadow-xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div className="relative z-10 py-6 md:py-8">
        <div className="mb-5 flex items-end justify-between gap-4 px-5 md:px-8">
          <div>
            <h2 className="text-xl font-extrabold text-white md:text-3xl">Recently Added</h2>
            <p className="mt-1 text-sm text-white/70">The newest homes on EboHomes.</p>
          </div>
          <button
            onClick={() => router.push('/search?mode=rent')}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-300 hover:text-amber-200"
          >
            See all <ChevronRight size={16} />
          </button>
        </div>

        <div className="pl-5 md:pl-8">
          <Marquee
            speed={0.5}
            slides={items.map((l) => {
              const added = addedText(l.created_at)
              return (
                <a
                  key={l.id}
                  href={`/listing/${l.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    router.push(`/listing/${l.id}`)
                  }}
                  draggable={false}
                  className="block w-64 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-white/10 sm:w-72"
                >
                  <div className="relative h-40 w-full overflow-hidden">
                    <img
                      src={l.photos?.[0] || '/placeholder.jpg'}
                      alt={`${l.property_type} in ${l.location_text}`}
                      draggable={false}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/placeholder.jpg'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                    {added && (
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-primary shadow">
                        {added}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-lg font-extrabold text-primary">
                      ₦{l.price_monthly?.toLocaleString()}
                      <span className="text-sm font-medium text-muted-foreground">/month</span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin size={13} className="shrink-0" />
                      <span className="truncate">{l.location_text}</span>
                    </p>
                    <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <HomeIcon size={13} /> {l.property_type}
                      </span>
                      {l.bedrooms ? (
                        <span className="flex items-center gap-1.5">
                          <Bed size={13} /> {l.bedrooms} Beds
                        </span>
                      ) : null}
                    </div>
                  </div>
                </a>
              )
            })}
          />
        </div>
      </div>
    </div>
  )
}

// ---------- EBSU / FUNAI news-ticker ----------
const INSTITUTIONS = [
  { short: 'EBSU', name: 'Ebonyi State University', logo: '/ebsu-logo.png' },
  { short: 'FUNAI', name: 'Alex Ekwueme Federal University', logo: '/funai-logo.png' },
]

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
    <div className="rounded-3xl border border-border/60 bg-card py-8 shadow-lg md:py-10">
      <style>{`
        @keyframes eh-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .eh-ticker-track { animation: eh-ticker 28s linear infinite }
        .eh-ticker:hover .eh-ticker-track { animation-play-state: paused }
        @media (prefers-reduced-motion: reduce) { .eh-ticker-track { animation: none } }
      `}</style>
      <div className="px-6 text-center">
        <h3 className="mb-2 text-xl font-bold text-foreground md:text-2xl">Trusted by Students &amp; Professionals</h3>
        <p className="mx-auto mb-7 max-w-md text-sm text-muted-foreground">
          We are proud to serve students and staff from leading institutions in Ebonyi State.
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

// ---------- Shared motion helpers ----------
// Starts at 25% opacity (never fully blank) so a slow scroll can't leave an empty gap.
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0.25, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView) return
    const c = animate(0, to, {
      duration: 1.2,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
      },
    })
    return () => c.stop()
  }, [inView, to])
  return <span ref={ref}>0</span>
}

// ---------- How it works: timeline (vertical on phone, horizontal on desktop) ----------
const STEPS = [
  { icon: Search, title: 'Search', desc: 'Find properties that fit your needs.' },
  { icon: MessageCircle, title: 'Contact', desc: 'Chat with EboHomes to arrange viewings.' },
  { icon: ClipboardCheck, title: 'Inspect', desc: 'Schedule a viewing and see it yourself.' },
  { icon: Key, title: 'Move in', desc: 'Sign the agreement and get your keys.' },
]

function HowItWorks() {
  const reduce = useReducedMotion()
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
      <Reveal className="mb-8 max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">Getting started</span>
        <h2 className="mt-2 text-2xl font-bold text-foreground md:text-4xl">
          From search to move in, <span className="text-primary">four steps</span>
        </h2>
      </Reveal>

      <div className="relative">
        {/* connector line draws itself */}
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

        <ol className="relative grid gap-6 md:grid-cols-4 md:gap-4">
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
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>

      <Reveal className="mt-8">
        <div className="flex items-center gap-4 rounded-2xl bg-secondary/40 p-5">
          <ShieldCheck size={28} className="shrink-0 text-primary" />
          <div>
            <p className="font-bold text-foreground">Safe. Simple. Stress-free.</p>
            <p className="text-sm text-muted-foreground">
              We verify landlords and protect your info, so your search stays smooth from start to finish.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

// ---------- Founder section ----------
// EDIT THIS: name, photo, link, copy. Put your photo at /public/founder.jpg (portrait, 4:5 works best).
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
    'So I started thinking about a better way: connect tenants directly with real landlords, no middlemen, no wasted inspection money.',
  ],
  skillsLine: 'Beyond EboHomes, I build solutions to real problems with:',
  skills: ['AI Agents', 'Automation', 'Web3 & Crypto', 'Web Building'],
  highlight: 'Built by a student who needed it first, for everyone who still does.',
  cta: 'Follow the EboHomes journey →',
}

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
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8">
      <div className="grid items-center gap-10 md:grid-cols-[2fr_3fr] md:gap-14">
        {/* Portrait */}
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl font-extrabold">
                    {initials}
                  </span>
                  <Camera size={20} className="opacity-70" />
                  <p className="text-xs opacity-70">Add your photo at public/founder.jpg</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16">
                <p className="text-base font-bold text-white">{FOUNDER.name}</p>
                <p className="text-xs text-white/80">{FOUNDER.sub}</p>
              </div>
            </div>

            {/* floating badge */}
            <motion.div
              className="absolute -right-2 top-6 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-lg md:-right-4"
              animate={reduce ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <BadgeCheck size={14} className="text-primary" />
              Founder
            </motion.div>
          </div>
        </Reveal>

        {/* Story */}
        <div>
          <Reveal>
            <span className="text-xs font-bold uppercase tracking-widest text-primary md:text-sm">{FOUNDER.eyebrow}</span>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-foreground text-balance sm:text-4xl lg:text-5xl">
              {FOUNDER.headline}
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="mt-4 space-y-3 text-base leading-relaxed text-muted-foreground md:text-lg">
            {FOUNDER.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </Reveal>

          <Reveal delay={0.15} className="mt-4">
            <p className="text-sm font-medium text-foreground">{FOUNDER.skillsLine}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOUNDER.skills.map((s, i) => (
                <motion.span
                  key={s}
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary md:text-sm"
                  initial={reduce ? false : { opacity: 0.25, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                >
                  {s}
                </motion.span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <blockquote className="mt-5 border-l-4 border-primary pl-4 text-lg font-bold text-foreground md:text-xl">
              {FOUNDER.highlight}
            </blockquote>
            <motion.a
              href={FOUNDER.social}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={reduce ? undefined : { scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90 sm:w-auto"
            >
              {FOUNDER.cta}
            </motion.a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ---------- EboHomes AI: coming-soon announcement (static, no AI functionality) ----------
function AiComingSoon() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-8" aria-labelledby="ebohomes-ai-heading">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-secondary/60 via-background to-secondary/30 px-6 py-10 sm:px-10 md:px-14 md:py-14">
          <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12">
            <div>
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-700 dark:text-amber-300">
                COMING SOON
              </span>
              <h2
                id="ebohomes-ai-heading"
                className="mt-4 text-4xl font-extrabold tracking-tight text-emerald-950 dark:text-white sm:text-5xl"
              >
                EboHomes AI
              </h2>
              <p className="mt-3 text-lg font-semibold text-primary md:text-xl">
                Intelligence for Nigerian Real Estate.
              </p>
              <p className="mt-3 max-w-md text-sm text-muted-foreground md:text-base">
                We&apos;re building a smarter way to navigate real estate in Nigeria.
              </p>
            </div>

            {/* Abstract: a house outline drawn as connected points. Decorative only. */}
            <svg
              viewBox="0 0 240 180"
              className="mx-auto h-auto w-full max-w-[240px] text-primary md:max-w-[280px]"
              fill="none"
              aria-hidden="true"
            >
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

// ---------- Hero background: slow crossfade between your own photos ----------
// Put your photos in /public and list them here. Files that don't exist are skipped,
// and if none load, the old /hero.jpg is used so the hero is never empty.
const HERO_IMAGES = ['/hero-home.jpg', '/hero-2.jpg', '/hero-3.jpg']
const HERO_FALLBACK = '/hero.jpg'
const HERO_FADE_MS = 1400 // how long one photo takes to fade in
const HERO_HOLD_MS = 6500 // how long each photo stays before the next one fades in

// One photo layer. The incoming photo fades in ON TOP of the previous one, which stays fully
// visible underneath until the fade is done, so the hero never dips to dark between photos.
function HeroSlide({ src, state, reduce }: { src: string; state: 'current' | 'previous' | 'hidden'; reduce: boolean }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    // Mount invisible, then fade in on the next frame, so even the first photo fades in
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

  // Each photo is added the moment it finishes loading, so the hero never waits for all three.
  // If every photo fails, the old /hero.jpg is used.
  useEffect(() => {
    let cancelled = false
    let settled = 0
    let loadedAny = false

    const settle = () => {
      settled += 1
      if (!cancelled && settled === HERO_IMAGES.length && !loadedAny) setImages([HERO_FALLBACK])
    }

    HERO_IMAGES.forEach((src) => {
      const img = new window.Image()
      img.onload = () => {
        if (!cancelled) {
          loadedAny = true
          setImages((prev) => (prev.includes(src) ? prev : [...prev, src]))
        }
        settle()
      }
      img.onerror = () => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Hero image not found or not loadable: ${src}`)
        }
        settle()
      }
      img.src = src
    })

    return () => {
      cancelled = true
    }
  }, [])

  // Move to the next photo every few seconds (not at all if the visitor prefers reduced motion)
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
        <HeroSlide
          key={src}
          src={src}
          reduce={reduce}
          state={i === pos.current ? 'current' : i === pos.previous ? 'previous' : 'hidden'}
        />
      ))}
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [listingMode] = useState<'rent' | 'sale'>('rent')
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const [featured, setFeatured] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState({ properties: 0, landlords: 0 })
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [isSearching, startSearch] = useTransition()

  useEffect(() => {
    const fetchHomeListings = async () => {
      setLoading(true)

      const { data: featuredData } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .eq('featured', true)
        .order('created_at', { ascending: false })

      const { data: recentData } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(6)

      // Every featured listing is shown; order is shuffled on each visit so none is always first
      const shuffled = [...(featuredData ?? [])]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setFeatured(shuffled)
      setRecent(recentData ?? [])
      setLoading(false)
    }
    fetchHomeListings()
  }, [])

  useEffect(() => {
    const fetchCategoryCounts = async () => {
      const { data } = await supabase
        .from('listings')
        .select('property_type')
        .eq('status', 'approved')

      const counts: Record<string, number> = {}
      data?.forEach((row) => {
        const type = row.property_type
        counts[type] = (counts[type] || 0) + 1
      })
      setCategoryCounts(counts)
    }
    fetchCategoryCounts()
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      const { count: propCount } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')

      const { count: landlordCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'landlord')

      setStats({ properties: propCount ?? 0, landlords: landlordCount ?? 0 })
    }
    fetchStats()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location) params.set('location', location)
    if (propertyType) params.set('type', propertyType)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    params.set('mode', listingMode)
    // isSearching stays true until the search page has loaded, so the button shows a spinner
    startSearch(() => {
      router.push('/search?' + params.toString())
    })
  }

  // Area suggestions come from real listings, nothing invented
  const locationSuggestions = Array.from(
    new Set([...featured, ...recent].map((l) => l.location_text).filter(Boolean)),
  ) as string[]

  const sortedCats = [...CATEGORIES].sort((a, b) => (categoryCounts[b.value] ?? 0) - (categoryCounts[a.value] ?? 0))

  const steps = [
    { n: 1, icon: Search, title: 'Search', desc: 'Find properties that fit your needs' },
    { n: 2, icon: MessageCircle, title: 'Contact', desc: 'Chat with EboHomes to arrange viewings.' },
    { n: 3, icon: ClipboardCheck, title: 'Inspect', desc: 'Schedule viewing and inspect' },
    { n: 4, icon: Key, title: 'Move In', desc: 'Sign agreement and move in' },
  ]

  const TRUST_MINI = [
    { icon: ShieldCheck, label: 'Reviewed Listings' },
    { icon: MessageCircle, label: 'Secure Messaging' },
    { icon: BadgeCheck, label: 'Trusted Platform' },
    { icon: Headphones, label: '24/7 Support' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section>
          <div className="relative isolate overflow-hidden">
            <HeroBackground />
            {/* Dark overlay so text stays readable on every photo */}
            <div className="absolute inset-0 z-[3] bg-gradient-to-b from-black/60 via-black/45 to-black/70" />

            <div className="relative z-10 mx-auto max-w-3xl px-4 pb-32 pt-14 text-center sm:px-6 md:pb-40 md:pt-24 lg:px-8">
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-4 py-1.5 text-sm font-medium text-white">
                <ShieldCheck size={16} className="text-emerald-300" />
                Reviewed Rentals. Real People.
              </span>
              <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Find Verified Homes in <span className="text-emerald-300">Ebonyi State</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-white/90 md:text-lg">
                A safer way to find and rent properties in Ebonyi State, with every listing reviewed before it goes live.
              </p>
            </div>
          </div>

          {/* Search: one row on laptops, stacked on phones. Overlaps the bottom of the hero. */}
          <div className="relative z-20 mx-auto -mt-24 max-w-5xl px-4 sm:px-6 md:-mt-28 lg:px-8">
            <form
              onSubmit={handleSearch}
              className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl sm:grid-cols-2 md:p-5 lg:grid-cols-[1.4fr_1fr_1.3fr_auto] lg:items-end lg:gap-4"
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
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                  Property Type
                </label>
                <div className="relative">
                  <select
                    id="home-type"
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="h-12 w-full appearance-none rounded-xl border border-border bg-background pl-3 pr-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Any Type</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
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
                    placeholder="Min Price"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-sm text-muted-foreground">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Maximum price"
                    placeholder="Max Price"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                    Search Homes
                  </>
                )}
              </Button>
            </form>

            {/* Quick searches: only property types that really have listings, plus budget shortcuts */}
            <div className="-mx-4 sm:mx-0 mt-4 flex gap-2 overflow-x-auto px-4 sm:px-0 sm:flex-wrap sm:justify-center sm:overflow-visible pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { label: 'Under ₦100k', href: '/search?mode=rent&maxPrice=100000' },
                { label: '₦100k – ₦300k', href: '/search?mode=rent&minPrice=100000&maxPrice=300000' },
                { label: '2 Bedroom', href: '/search?mode=rent&bedrooms=2' },
                ...CATEGORIES.filter((c) => (categoryCounts[c.value] ?? 0) > 0)
                  .slice(0, 5)
                  .map((c) => ({ label: c.label, href: '/search?type=' + encodeURIComponent(c.value) })),
              ].map((chip) => (
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
          </div>
        </section>

        {/* Featured Properties */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-amber-500 text-xl">★</span>
            <h2 className="text-xl md:text-3xl font-bold text-foreground">Featured Properties</h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              Premium Listings
            </span>
          </div>
          <p className="text-muted-foreground text-sm mb-5">Featured properties, reviewed before they go live</p>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card rounded-lg overflow-hidden border border-border animate-pulse h-64" />
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
              No featured properties yet.
            </div>
          ) : (
            <FeaturedMarquee items={featured} />
          )}
        </section>

        {/* Recently Added */}
        {(loading || recent.length > 0) && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-5">
            {loading ? (
              <div className="h-64 animate-pulse rounded-3xl bg-muted/60" />
            ) : (
              <RecentMarquee items={recent} />
            )}
          </section>
        )}

        {/* See More Properties CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Search size={26} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-extrabold text-foreground uppercase tracking-wide">
                  See More Properties
                </h3>
                <p className="text-muted-foreground text-sm">Browse verified properties across Ebonyi State</p>
              </div>
            </div>
            <Button
              onClick={() => router.push('/search')}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-3 rounded-full text-base whitespace-nowrap"
            >
              See More Properties →
            </Button>
          </div>
        </section>

        {/* Property Types */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-3xl font-bold text-foreground">Browse by property type</h2>
              <p className="text-muted-foreground text-sm mt-1">Most popular first.</p>
            </div>
            <button
              onClick={() => router.push('/search')}
              className="shrink-0 text-sm font-semibold text-primary hover:underline"
            >
              View all →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {sortedCats.slice(0, 4).map((cat) => (
              <button
                key={cat.value}
                onClick={() => router.push('/search?type=' + encodeURIComponent(cat.value))}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
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
        </section>

        {/* How It Works */}
        <HowItWorks />

        {/* Why Choose EboHomes */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="relative">
              <img
                src="/hero.jpg"
                alt="Verified home in Ebonyi State"
                className="rounded-2xl object-cover w-full h-56 md:h-[440px]"
              />
              {stats.landlords > 0 && (
                <div className="absolute -bottom-6 -right-2 sm:-right-6 bg-card border border-border rounded-xl px-5 py-4 shadow-lg">
                  <p className="text-2xl font-extrabold text-foreground"><CountUp to={stats.landlords} />+</p>
                  <p className="text-xs text-muted-foreground max-w-[140px]">Verified landlords ready to rent to you</p>
                </div>
              )}
              {stats.properties > 0 && (
                <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-primary shadow">
                  <CountUp to={stats.properties} /> live listings
                </div>
              )}
            </div>

            <div>
              <span className="text-primary text-xs font-semibold tracking-wide uppercase">Our promise</span>
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mt-2 mb-4">
                Why trust <span className="text-primary">EboHomes?</span>
              </h2>
              <p className="text-muted-foreground text-sm mb-8 max-w-md">
                We built EboHomes because finding a home in Ebonyi State shouldn't mean risking a scam. Here's what that actually means for you.
              </p>
              <ul className="space-y-5">
                {WHY_CHOOSE.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <CheckCircle2 size={20} className="text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <p className="text-muted-foreground text-sm">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Trusted by Students & Professionals (rolling ticker) */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-5">
          <InstitutionsTicker />
        </section>

        {/* Founder */}
        <FounderSection />

        {/* EboHomes AI: coming soon */}
        <AiComingSoon />

        {/* App CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
          <div className="bg-primary rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-5 text-primary-foreground">
            <div>
              <span className="inline-block bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1 rounded-full mb-2">
                COMING SOON
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-1">EboHomes App Coming Soon!</h3>
              <p className="text-primary-foreground/80 text-sm max-w-md">
                We're working hard to bring you the best property search experience on the go.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-3">
              <CalendarClock size={20} />
              <span className="text-sm font-medium">Stay tuned!</span>
            </div>
          </div>
        </section>

        {/* Featured Upgrade Banner with Carousel */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-5">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 shadow-2xl">
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative z-10 grid md:grid-cols-2 gap-10 md:gap-12 items-center p-8 md:p-14">
              <div>
                <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-amber-400/30 text-amber-300 text-xs font-bold px-4 py-1.5 rounded-full mb-6 tracking-wide">
                  <Crown size={13} className="text-amber-400" />
                  FEATURED LISTING
                </span>

                <h3 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4">
                  List Your Property as{' '}
                  <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                    Featured
                  </span>
                </h3>

                <p className="text-white/70 text-sm md:text-base mb-6 max-w-sm leading-relaxed">
                  Increase visibility, get more inquiries, and close deals faster by upgrading to a Featured Listing.
                </p>

                <div className="inline-flex items-center gap-2.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 mb-7">
                  <div className="w-8 h-8 rounded-full bg-amber-400/15 flex items-center justify-center shrink-0">
                    <Eye size={15} className="text-amber-400" />
                  </div>
                  <p className="text-xs md:text-sm text-white/90">
                    Featured listings get up to <span className="font-bold text-amber-400">5× more views</span>
                  </p>
                </div>

                <Button
                  onClick={() => router.push(featured.length > 0 ? `/listing/${featured[featuredIndex].id}/feature` : '/dashboard/listings')}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-950 font-bold px-7 py-6 rounded-full shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:scale-[1.03] transition-all duration-300"
                >
                  Upgrade to Featured
                  <ChevronRight size={18} className="ml-1" />
                </Button>
              </div>

              <div className="relative">
                {featured.length > 0 && (
                  <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 transition-transform duration-500">
                    <div className="relative h-52 md:h-60">
                      <img
                        src={featured[featuredIndex]?.photos?.[0] ?? '/hero.jpg'}
                        alt={featured[featuredIndex]?.property_type ?? 'Featured property'}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                      <span className="absolute top-3.5 left-3.5 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full shadow">
                        Featured
                      </span>
                      <button
                        aria-label="Save property"
                        className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center shadow hover:bg-white hover:scale-110 transition-all duration-200"
                      >
                        <Heart size={16} className="text-foreground" />
                      </button>
                    </div>

                    <div className="p-5">
                      <p className="text-xl font-extrabold text-primary mb-1.5">
                        ₦{featured[featuredIndex]?.price_monthly?.toLocaleString()}
                        <span className="text-sm font-medium text-muted-foreground">/month</span>
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mb-3">
                        <MapPin size={13} />
                        {featured[featuredIndex]?.location_text}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
                        <span className="flex items-center gap-1.5">
                          <HomeIcon size={13} /> {featured[featuredIndex]?.property_type}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Bed size={13} /> {featured[featuredIndex]?.bedrooms} Beds
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {featured.length > 1 && (
                  <>
                    <button
                      aria-label="Previous featured property"
                      onClick={() => setFeaturedIndex((i) => (i - 1 + featured.length) % featured.length)}
                      className="absolute top-1/2 -translate-y-1/2 -left-4 md:-left-5 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all duration-200"
                    >
                      <ChevronLeft size={18} className="text-foreground" />
                    </button>
                    <button
                      aria-label="Next featured property"
                      onClick={() => setFeaturedIndex((i) => (i + 1) % featured.length)}
                      className="absolute top-1/2 -translate-y-1/2 -right-4 md:-right-5 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all duration-200"
                    >
                      <ChevronRight size={18} className="text-foreground" />
                    </button>

                    <div className="flex justify-center gap-1.5 mt-5">
                      {featured.map((_, i) => (
                        <button
                          key={i}
                          aria-label={`Go to featured property ${i + 1}`}
                          onClick={() => setFeaturedIndex(i)}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            i === featuredIndex
                              ? 'bg-gradient-to-r from-amber-300 to-amber-500 w-7'
                              : 'bg-white/30 w-1.5 hover:bg-white/50'
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

        {/* Ready to Get Started */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <div className="relative overflow-hidden bg-gradient-to-br from-secondary/60 to-secondary/20 border border-border/60 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
              <Home size={28} className="text-white" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1.5">Ready to get started?</h3>
              <p className="text-muted-foreground text-sm md:text-base">
                List your property or explore verified properties across Ebonyi State.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full md:w-auto">
              <Button
                onClick={() => router.push('/list-property')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-7 py-6 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-300"
              >
                <Home size={16} className="mr-2" />
                List Your Property
              </Button>
              <Button
                onClick={() => router.push('/search')}
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/5 hover:border-primary font-semibold rounded-full px-7 py-6 hover:scale-[1.02] transition-all duration-300"
              >
                <Search size={16} className="mr-2" />
                Browse Properties
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}