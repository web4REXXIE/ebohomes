'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Camera, ClipboardCheck, FileText, Home, Key, Search, ShieldCheck, Upload, UserPlus } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Section } from '@/components/ui/section'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Stage 6: homepage sections. Every step below describes something the app already does.
// Nothing here fetches data or touches auth, so the homepage logic in home-client.tsx is unchanged.

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0.25, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

const TENANT_STEPS = [
  { icon: Search, title: 'Search', desc: 'Filter by area, type and budget until something fits.' },
  { icon: ClipboardCheck, title: 'Request a viewing', desc: 'EboHomes arranges the inspection. You never chase an owner or agent.' },
  { icon: BadgeCheck, title: 'Apply', desc: 'Apply online. EboHomes handles the paperwork with the owner.' },
  { icon: Key, title: 'Move in', desc: 'Sign the rental terms, pay using the official EboHomes details and collect your keys.' },
]

const LANDLORD_STEPS = [
  { icon: UserPlus, title: 'Create an account', desc: 'Sign up as a landlord.' },
  { icon: FileText, title: 'Add your property', desc: 'Submit the property details, photos and your documents.' },
  { icon: ShieldCheck, title: 'EboHomes reviews it', desc: 'Your details and listing are reviewed before anything goes live.' },
  { icon: Upload, title: 'Reach tenants', desc: 'Once approved, your listing appears in search for people looking for a home.' },
]

function StepList({ steps }: { steps: { icon: React.ElementType; title: string; desc: string }[] }) {
  return (
    <ol className="space-y-5">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <s.icon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Step {i + 1}</p>
            <p className="text-body-lg font-semibold text-foreground">{s.title}</p>
            <p className="mt-0.5 text-body text-muted-foreground">{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="cream" className="scroll-mt-24" aria-labelledby="how-it-works-heading">
      <Reveal className="mb-10 max-w-xl">
        <p className="text-caption font-semibold uppercase tracking-wide text-primary">How EboHomes works</p>
        <h2 id="how-it-works-heading" className="mt-2 text-h2 font-bold text-foreground">
          Clear steps for tenants and landlords
        </h2>
      </Reveal>
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <Reveal>
          <div className="h-full rounded-card border border-border bg-card p-card shadow-rest md:p-8">
            <h3 className="mb-6 text-h3 font-bold text-foreground">Looking for a home</h3>
            <StepList steps={TENANT_STEPS} />
            <Link href="/search" className={cn(buttonVariants({ size: 'lg' }), 'mt-8 w-full sm:w-auto')}>
              Explore Properties <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="h-full rounded-card border border-border bg-card p-card shadow-rest md:p-8">
            <h3 className="mb-6 text-h3 font-bold text-foreground">Have a property to rent</h3>
            <StepList steps={LANDLORD_STEPS} />
            <Link href="/list-property" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-8 w-full sm:w-auto')}>
              List Your Property <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

// Founder story. Photo lives at /public/founder.jpg
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
  highlight: 'Built by a student who needed it first, for everyone who still does.',
  cta: 'Follow the EboHomes journey',
}

export function FounderSection() {
  const [imgOk, setImgOk] = useState(true)
  const initials = FOUNDER.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <Section aria-labelledby="founder-heading">
      <div className="grid items-center gap-10 md:grid-cols-[2fr_3fr] md:gap-14">
        <Reveal className="mx-auto w-full max-w-xs md:max-w-none">
          <div className="relative aspect-[4/5] overflow-hidden rounded-panel bg-forest shadow-raised">
            {imgOk ? (
              <img
                src={FOUNDER.photo}
                alt={`${FOUNDER.name}, ${FOUNDER.role}`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setImgOk(false)}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-forest-foreground/90">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl font-bold">{initials}</span>
                <Camera size={20} className="opacity-70" aria-hidden="true" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 pt-16">
              <p className="text-base font-bold text-white">{FOUNDER.name}</p>
              <p className="text-caption text-white/80">{FOUNDER.sub}</p>
            </div>
          </div>
        </Reveal>
        <div>
          <Reveal>
            <p className="text-caption font-semibold uppercase tracking-wide text-primary">{FOUNDER.eyebrow}</p>
            <h2 id="founder-heading" className="mt-2 text-balance text-h1 font-bold text-foreground">{FOUNDER.headline}</h2>
          </Reveal>
          <Reveal delay={0.08} className="mt-4 space-y-3 text-body-lg text-muted-foreground">
            {FOUNDER.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </Reveal>
          <Reveal delay={0.14}>
            <blockquote className="mt-6 border-l-4 border-featured pl-4 text-h3 font-semibold text-foreground">{FOUNDER.highlight}</blockquote>
            <a
              href={FOUNDER.social}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full sm:w-auto')}
            >
              {FOUNDER.cta} <ArrowRight aria-hidden="true" />
            </a>
          </Reveal>
        </div>
      </div>
    </Section>
  )
}

export function LandlordCta() {
  return (
    <Section tone="forest" aria-labelledby="landlord-cta-heading">
      <Reveal className="max-w-2xl">
        <p className="text-caption font-semibold uppercase tracking-wide text-featured">For landlords</p>
        <h2 id="landlord-cta-heading" className="mt-2 text-h1 font-bold">Have a property to rent?</h2>
        <p className="mt-4 text-body-lg text-white/80">
          Bring your property to people looking for their next home. Submit your details and documents for review. Once your listing is approved, tenants can find it.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/list-property" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }))}>
            <Home aria-hidden="true" /> List Your Property
          </Link>
          <Link
            href="/dashboard/listings"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white dark:border-white/30 dark:bg-transparent dark:hover:bg-white/10')}
          >
            Upgrade a listing to Featured <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
    </Section>
  )
}

export function FinalCta() {
  return (
    <Section tone="cream" spacing="sm" aria-labelledby="final-cta-heading">
      <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="max-w-xl">
          <h2 id="final-cta-heading" className="text-h2 font-bold text-foreground">Ready to find your next home?</h2>
          <p className="mt-2 text-body-lg text-muted-foreground">Real Estate You Can Trust. Browse rentals across Ebonyi State, or list yours.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/search" className={cn(buttonVariants({ size: 'lg' }))}>
            Explore Properties <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/list-property" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
            List Your Property
          </Link>
        </div>
      </Reveal>
    </Section>
  )
}
