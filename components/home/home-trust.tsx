'use client'

import Link from 'next/link'
import { ArrowRight, ClipboardCheck, FileCheck2, Flag, Headphones, Lock, ShieldCheck, UserCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Section } from '@/components/ui/section'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Stages 9 and 10: trust content for the homepage.
// Every statement here matches something the app already does (listing review, landlord identity
// and document review, inspections, viewing requests, official payment channel, reports, support).
// Nothing here fetches data. Live counts are passed in by home-client.tsx, which already loads them.

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

/* ---------------- Stage 9: trust strip (directly under the hero) ---------------- */

export function TrustStrip({ listingStat, landlordStat }: { listingStat?: React.ReactNode; landlordStat?: React.ReactNode }) {
  const items = [
    {
      icon: ShieldCheck,
      title: 'Reviewed listings',
      text: 'EboHomes reviews each listing before it appears in search.',
      stat: listingStat,
    },
    {
      icon: UserCheck,
      title: 'Landlord checks',
      text: 'Landlords submit their details and documents for review.',
      stat: landlordStat,
    },
    {
      icon: ClipboardCheck,
      title: 'Viewings through EboHomes',
      text: 'Request a viewing on the listing and EboHomes arranges it with the owner.',
    },
    {
      icon: Lock,
      title: 'One official channel',
      text: 'Pay only using the official EboHomes details on your tenancy page.',
    },
  ]
  return (
    <section aria-label="Why people trust EboHomes" className="mt-8 border-y border-border bg-card">
      <ul className="container-wide grid grid-cols-1 gap-x-8 gap-y-5 py-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary" aria-hidden="true">
              <it.icon size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{it.title}</p>
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{it.text}</p>
              {it.stat && <p className="mt-1.5 text-xs font-semibold text-primary">{it.stat}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------------- Stage 10: verification and inspection explained ---------------- */

const CHECKS = [
  {
    icon: UserCheck,
    title: 'Identity check',
    means: 'EboHomes reviewed the identity details the landlord submitted.',
    not: 'It does not show that they own or may rent out a specific property.',
  },
  {
    icon: FileCheck2,
    title: 'Document review',
    means: 'EboHomes reviewed the evidence the lister submitted for that property.',
    not: 'It is a review of documents, not a legal guarantee of ownership.',
  },
  {
    icon: ClipboardCheck,
    title: 'Property inspection',
    means: 'An EboHomes inspector visited the property and EboHomes reviewed the report.',
    not: 'It covers the physical property only. Not every listing has been inspected.',
  },
]

const OTHER_TOOLS = [
  { icon: Flag, text: 'Report a fake or misleading listing from its page. The EboHomes team reviews every report.' },
  { icon: Headphones, text: 'Message the EboHomes team if you are unsure about anything.' },
  { icon: Lock, text: 'Pay only through the official EboHomes details. Payments made anywhere else cannot be tracked or protected.' },
]

export function VerificationExplainer() {
  return (
    <Section tone="cream" aria-labelledby="verification-heading">
      <Reveal className="mb-10 max-w-2xl">
        <p className="text-caption font-semibold uppercase tracking-wide text-primary">Trust and verification</p>
        <h2 id="verification-heading" className="mt-2 text-h2 font-bold text-foreground">
          What EboHomes checks, and what each check means
        </h2>
        <p className="mt-3 text-body text-muted-foreground">
          Each property page shows which checks that listing has actually earned. Anything not marked as checked has not been confirmed.
        </p>
      </Reveal>

      <div className="grid gap-5 md:grid-cols-3">
        {CHECKS.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.06}>
            <div className="h-full rounded-card border border-border bg-card p-card shadow-rest">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                <c.icon size={20} />
              </span>
              <h3 className="mt-4 text-h3 font-bold text-foreground">{c.title}</h3>
              <p className="mt-2 text-body text-foreground">{c.means}</p>
              <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">{c.not}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <div className="mt-5 rounded-card border border-border bg-card p-card shadow-rest">
          <h3 className="text-body-lg font-bold text-foreground">Other ways EboHomes helps you stay safe</h3>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {OTHER_TOOLS.map((t) => (
              <li key={t.text} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary" aria-hidden="true">
                  <t.icon size={18} />
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">{t.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6">
          <Link href="/search" className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
            Explore Properties <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </Reveal>
    </Section>
  )
}
