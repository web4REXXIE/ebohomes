
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Award,
  ClipboardCheck,
  FileCheck2,
  Home,
  Lightbulb,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  ShieldQuestion,
  User,
  Users,
} from 'lucide-react'
import { EBOHOMES_EMAIL, EBOHOMES_WHATSAPP } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'About us',
  description:
    'EboHomes is building a more trustworthy way to discover, understand and rent property in Nigeria, starting with reviewed listings in Ebonyi State.',
  alternates: { canonical: '/about' },
}

// Every statement here comes from how the platform works today or from EboHomes' stated mission.
// No company history, awards, partners, office claims or statistics are invented.

const PROBLEMS = [
  {
    icon: Search,
    title: 'Genuine properties are hard to find',
    text: 'Tenants often cannot tell which listings are real, current and available.',
  },
  {
    icon: ShieldQuestion,
    title: 'Property information is unreliable',
    text: 'Photos, prices and descriptions are hard to trust when nobody has checked them.',
  },
  {
    icon: Users,
    title: 'Renting is stressful for everyone',
    text: 'Landlords and tenants both lose time when the process is unclear and relies on informal middlemen.',
  },
]

const APPROACH = [
  {
    icon: ShieldCheck,
    title: 'Listings are reviewed before they go live',
    text: 'A property only appears on EboHomes after our team has reviewed it.',
  },
  {
    icon: FileCheck2,
    title: 'Each check is shown separately',
    text: 'A landlord identity check, a review of property documents and a physical inspection are different things. Each property page says which of them have been done, and which have not.',
  },
  {
    icon: ClipboardCheck,
    title: 'One place for the whole process',
    text: 'Questions, applications and viewing requests go through EboHomes, and tenant contact details stay with EboHomes.',
  },
]

const VALUES = [
  { icon: ShieldQuestion, title: 'Integrity', desc: 'We operate with honesty and transparency.' },
  { icon: Lightbulb, title: 'Innovation', desc: 'We embrace technology to build better solutions.' },
  { icon: User, title: 'Customer First', desc: 'Your needs are at the heart of what we do.' },
  { icon: Award, title: 'Excellence', desc: 'We hold ourselves to the highest standard.' },
  { icon: Users, title: 'Community', desc: 'We are committed to stronger communities.' },
]

const btnPrimary =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-button bg-featured px-6 text-label font-semibold text-featured-foreground transition hover:bg-featured/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
const btnGhost =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-button border border-white/30 px-6 text-label font-semibold text-forest-foreground transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
const iconBubble = 'mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary'

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-forest text-forest-foreground">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: "url('/hero.jpg')" }} />
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-forest/60 to-forest" />
        <div className="container-wide relative z-10 py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span aria-hidden className="mb-5 block h-0.5 w-12 rounded-full bg-featured" />
            <p className="mb-3 text-label font-semibold uppercase tracking-wide text-featured">About EboHomes</p>
            <h1 className="text-display font-bold leading-tight">
              A more trustworthy way to discover, understand and rent property in Nigeria.
            </h1>
            <p className="mt-5 max-w-2xl text-body-lg text-forest-foreground/80">
              EboHomes is a direct rental platform that connects landlords and tenants without agents. We are starting
              in Ebonyi State, with Real Estate You Can Trust as the standard we hold ourselves to.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/search" className={btnPrimary}>
                Browse homes <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/contact" className={btnGhost}>
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="py-section">
        <div className="container-wide">
          <div className="max-w-2xl">
            <h2 className="text-h1 font-bold text-foreground">Why EboHomes exists</h2>
            <p className="mt-3 text-body-lg text-muted-foreground">
              Finding a home should not mean guessing which listings are real. Too often it does.
            </p>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {PROBLEMS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-card border border-border bg-card p-card shadow-rest">
                <span aria-hidden className={iconBubble}>
                  <Icon size={20} />
                </span>
                <h3 className="text-h3 font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-body text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The approach */}
      <section className="bg-cream py-section text-cream-foreground">
        <div className="container-wide">
          <div className="max-w-2xl">
            <h2 className="text-h1 font-bold">How we are building trust</h2>
            <p className="mt-3 text-body-lg text-cream-foreground/80">
              EboHomes was born out of a simple mission: to improve the rental experience in Ebonyi State through
              technology, transparency and trust, so landlords and tenants can deal directly.
            </p>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {APPROACH.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-card border border-border bg-card p-card text-foreground shadow-rest">
                <span aria-hidden className={iconBubble}>
                  <Icon size={20} />
                </span>
                <h3 className="text-h3 font-semibold">{title}</h3>
                <p className="mt-1.5 text-body text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-3xl rounded-control border border-border bg-card px-4 py-3 text-body text-muted-foreground">
            Checks help you decide, but they are not a guarantee. Always look at the property and the documents yourself,
            and never pay outside EboHomes.
          </p>
        </div>
      </section>

      {/* For tenants and landlords */}
      <section className="py-section">
        <div className="container-wide grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-card border border-border bg-card p-card-lg shadow-rest">
            <span aria-hidden className={iconBubble}>
              <Home size={20} />
            </span>
            <h2 className="text-h2 font-bold text-foreground">For tenants</h2>
            <p className="mt-2 text-body text-muted-foreground">
              Search reviewed listings, see what has been checked on each one, and send questions, applications and
              viewing requests in one place.
            </p>
            <Link href="/search" className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline focus-ring">
              Find a home <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="rounded-card border border-border bg-card p-card-lg shadow-rest">
            <span aria-hidden className={iconBubble}>
              <ShieldCheck size={20} />
            </span>
            <h2 className="text-h2 font-bold text-foreground">For landlords</h2>
            <p className="mt-2 text-body text-muted-foreground">
              Submit your property for review, verify who you are, and reach tenants without relying on informal agents.
            </p>
            <Link
              href="/login?mode=signup"
              className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline focus-ring"
            >
              Create a landlord account <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Ambition */}
      <section className="bg-forest py-section text-forest-foreground">
        <div className="container-wide max-w-3xl text-center">
          <span aria-hidden className="mx-auto mb-5 block h-0.5 w-12 rounded-full bg-featured" />
          <h2 className="text-h1 font-bold">Where we are going</h2>
          <p className="mt-4 text-body-lg text-forest-foreground/80">
            Our long-term ambition is to build trust infrastructure for Nigerian real estate: a place where property
            information is checked, transparent and easy to understand. We are at the beginning of that work, and we
            would rather show you what we have actually checked than promise more than we can prove.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-section">
        <div className="container-wide">
          <h2 className="mb-8 text-h1 font-bold text-foreground">Our values</h2>
          <ul className="grid grid-cols-2 gap-6 md:grid-cols-5">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <li key={title}>
                <span aria-hidden className={iconBubble}>
                  <Icon size={18} />
                </span>
                <h3 className="mb-1 text-body font-semibold text-foreground">{title}</h3>
                <p className="text-body text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact band: real details from lib/contact */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-wide flex flex-col items-start justify-between gap-6 py-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-h2 font-bold">Have questions?</h2>
            <p className="mt-1 text-body text-primary-foreground/85">
              We are here to help you find a home or list a property.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={`https://wa.me/${EBOHOMES_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-button border border-white/40 px-5 text-label font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <MessageCircle size={16} aria-hidden /> WhatsApp us
            </a>
            <a
              href={`mailto:${EBOHOMES_EMAIL}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-button border border-white/40 px-5 text-label font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Mail size={16} aria-hidden /> Email us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
