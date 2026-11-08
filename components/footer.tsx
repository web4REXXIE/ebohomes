'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, ShieldCheck, ChevronDown, Phone, Mail } from 'lucide-react'
import { EBOHOMES_WHATSAPP, EBOHOMES_EMAIL, EBOHOMES_PHONE_DISPLAY } from '@/lib/contact'
import { BRAND_LOGOS } from '@/lib/brand'
import { InstallButton } from '@/components/install-button'

// Stage 5: refined footer. Every link below already existed in the previous footer, plus /about,
// which is an existing page. Contact details come from lib/contact.ts as before.
// Visual changes: forest-green surface from the design tokens, "Real Estate You Can Trust." headline
// with a gold accent, aligned to the same container as the header, decorative building art removed,
// and mobile accordion groups that no longer leave hidden links in the tab order.

function TikTokIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

type FooterLink = { href: string; label: string; external?: boolean }

const NAV_GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Explore',
    links: [
      { href: '/search', label: 'Browse Properties' },
      { href: '/saved', label: 'Saved Properties' },
      { href: '/#how-it-works', label: 'How It Works' },
    ],
  },
  {
    title: 'Popular areas',
    links: [
      { href: '/search?location=Abakaliki', label: 'Abakaliki' },
      { href: '/search?location=Abakaliki%20GRA', label: 'Abakaliki GRA' },
      { href: '/search?location=Ikwo', label: 'Ikwo (FUNAI area)' },
      { href: '/search?location=Afikpo', label: 'Afikpo' },
      { href: '/search?location=Onueke', label: 'Onueke' },
      { href: '/search?location=Edda', label: 'Edda' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About EboHomes' },
      { href: '/contact', label: 'Contact Us' },
      { href: '/list-property', label: 'List Your Property' },
      { href: '/report-listing', label: 'Report a Listing' },
      { href: `https://wa.me/${EBOHOMES_WHATSAPP}`, label: 'WhatsApp Support', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms & Conditions' },
      { href: '/cookies', label: 'Cookie Policy' },
    ],
  },
]

const linkClass =
  'rounded-sm text-white/75 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'

function SocialIcon({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-white/80 transition-colors hover:border-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {children}
    </a>
  )
}

function TrustNote() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-featured/60 text-featured">
        <ShieldCheck size={18} aria-hidden="true" />
      </span>
      <p className="text-sm leading-snug text-white/80">
        Listings are reviewed by EboHomes before they go live, so you can decide with clearer information.
      </p>
    </div>
  )
}

function ContactRow() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <SocialIcon href="https://www.tiktok.com/@ebohomes7" label="EboHomes on TikTok"><TikTokIcon /></SocialIcon>
        <SocialIcon href="https://wa.me/message/WKKSKKPRDS2SE1" label="EboHomes on WhatsApp"><MessageCircle size={16} aria-hidden="true" /></SocialIcon>
      </div>
      <div className="mt-4 space-y-1 text-sm">
        <a href={`tel:+${EBOHOMES_WHATSAPP}`} className={`flex min-h-9 items-center gap-2 ${linkClass}`}>
          <Phone size={14} aria-hidden="true" /> {EBOHOMES_PHONE_DISPLAY}
        </a>
        <a href={`mailto:${EBOHOMES_EMAIL}`} className={`flex min-h-9 items-center gap-2 break-all ${linkClass}`}>
          <Mail size={14} aria-hidden="true" /> {EBOHOMES_EMAIL}
        </a>
      </div>
    </div>
  )
}

export function Footer() {
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <footer className="border-t border-white/10 bg-forest text-forest-foreground dark:border-border">
      <div className="container-wide pb-8 pt-12 md:pt-16">
        {/* Phones: one column with collapsible groups. Tablets: two columns. Laptops: brand plus four columns. */}
        <div className="md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="md:col-span-2 lg:col-span-1">
            <Link href="/" aria-label="EboHomes home" className="mb-5 inline-block">
              <img src={BRAND_LOGOS.onDark} alt="EboHomes" className="h-11 w-auto md:h-12" />
            </Link>
            <p className="mb-2 text-xl font-semibold leading-snug">
              Real Estate <span className="text-featured">You Can Trust.</span>
            </p>
            <p className="mb-6 max-w-xs text-sm leading-relaxed text-white/70">
              Rental homes across Ebonyi State, Nigeria.
            </p>
            <div className="mb-6">
              <ContactRow />
            </div>
            <InstallButton variant="footer" className="mb-6" />
            <div className="border-t border-white/10 pt-5 md:max-w-sm md:border-0 md:pt-0">
              <TrustNote />
            </div>
          </div>

          {NAV_GROUPS.map((group, gi) => {
            const isOpen = openGroup === group.title
            const panelId = `footer-group-${gi}`
            return (
              <div key={group.title} className={`border-t border-white/10 md:border-0 ${gi === 0 ? 'mt-5 md:mt-0' : ''}`}>
                {/* Phones: the title is a button that opens and closes the list */}
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.title)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex min-h-12 w-full items-center justify-between py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:hidden"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide">{group.title}</span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`text-white/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {/* Tablet and up: a plain heading, always visible */}
                <h2 className="mb-1.5 hidden text-xs font-semibold uppercase tracking-wide md:block">{group.title}</h2>
                <span className="mb-4 hidden h-0.5 w-6 rounded-full bg-featured/80 md:block" aria-hidden="true" />
                <div
                  id={panelId}
                  className={`overflow-hidden transition-[max-height] duration-200 md:max-h-none md:pb-0 ${
                    isOpen ? 'max-h-80 pb-4' : 'max-h-0 max-md:invisible'
                  }`}
                >
                  <ul className="space-y-1 text-sm md:space-y-2.5">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        {link.external ? (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex min-h-9 items-center md:min-h-0 ${linkClass}`}
                          >
                            {link.label}
                          </a>
                        ) : (
                          <Link href={link.href} className={`inline-flex min-h-9 items-center md:min-h-0 ${linkClass}`}>
                            {link.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-10 flex items-center justify-center border-t border-white/10 pt-6 md:mt-12">
          <p className="text-center text-xs text-white/60">
            &copy; {new Date().getFullYear()} EboHomes. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
