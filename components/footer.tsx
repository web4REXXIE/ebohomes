'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Shield, ChevronDown } from 'lucide-react'

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.891h-2.33v6.987C18.343 21.128 22 16.991 22 12z"/>
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153a4.908 4.908 0 011.153 1.772c.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 01-1.153 1.772 4.915 4.915 0 01-1.772 1.153c-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 01-1.772-1.153 4.904 4.904 0 01-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 011.153-1.772A4.897 4.897 0 015.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 1.802c-2.67 0-2.987.01-4.04.059-.976.045-1.505.207-1.858.344-.466.182-.8.398-1.15.748-.35.35-.566.684-.748 1.15-.137.353-.3.882-.344 1.857-.048 1.054-.059 1.37-.059 4.04 0 2.67.01 2.987.059 4.04.045.976.207 1.505.344 1.858.182.466.399.8.748 1.15.35.35.684.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.059 4.04.059 2.67 0 2.987-.01 4.04-.059.976-.045 1.505-.207 1.858-.344.466-.182.8-.399 1.15-.748.35-.35.566-.684.748-1.15.137-.353.3-.882.344-1.857.048-1.054.059-1.37.059-4.04 0-2.67-.01-2.987-.059-4.04-.045-.976-.207-1.505-.344-1.858a3.09 3.09 0 00-.748-1.15 3.09 3.09 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.054-.048-1.37-.059-4.04-.059zm0 4.594a5.604 5.604 0 110 11.208 5.604 5.604 0 010-11.208zM12 16a4 4 0 100-8 4 4 0 000 8zm5.884-8.803a1.31 1.31 0 11-2.62 0 1.31 1.31 0 012.62 0z"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

const NAV_GROUPS = [
  {
    title: 'Explore',
    links: [
      { href: '/search', label: 'Browse Properties' },
      { href: '/search', label: 'Map & Locations' },
      { href: '/#how-it-works', label: 'How It Works' },
    ],
  },
  {
    title: 'For You',
    links: [
      { href: '/dashboard/saved', label: 'Saved Properties' },
      { href: '/dashboard/applications', label: 'Rental Application' },
      { href: '/contact', label: 'Help Center' },
    ],
  },
  {
    title: 'For Landlords',
    links: [
      { href: '/list-property', label: 'List Your Property' },
      { href: '/dashboard/verification', label: 'Verification Guide' },
      { href: '/dashboard', label: 'Landlord Dashboard' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/contact', label: 'Contact' },
      { href: '/report-listing', label: 'Report a Listing' },
      { href: 'https://wa.me/2348012345678', label: 'WhatsApp Support', external: true },
    ],
  },
]

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
      className="flex items-center justify-center w-9 h-9 rounded-full border border-white/20 text-white/80 hover:text-white hover:border-white/50 transition-colors"
    >
      {children}
    </a>
  )
}

function BuildingArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g stroke="white" strokeWidth="1">
        <rect x="60" y="120" width="140" height="160" />
        <rect x="220" y="80" width="100" height="200" />
        <rect x="340" y="150" width="120" height="130" />
        <rect x="480" y="100" width="90" height="180" />
        {Array.from({ length: 4 }).flatMap((_, row) =>
          Array.from({ length: 3 }).map((_, col) => (
            <rect
              key={`w-${row}-${col}`}
              x={75 + col * 40}
              y={140 + row * 30}
              width="20"
              height="18"
            />
          ))
        )}
      </g>
    </svg>
  )
}

function TrustBadge() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center justify-center w-9 h-9 rounded-md border border-amber-400/60 text-amber-400 shrink-0">
        <Shield size={18} />
      </span>
      <div>
        <p className="text-sm font-medium text-amber-400">Real Estate You Can Trust.</p>
        <span className="block w-8 h-[2px] bg-amber-400/70 mt-1" />
      </div>
    </div>
  )
}

function SocialRow() {
  return (
    <div className="flex items-center gap-3">
      <SocialIcon href="#" label="Facebook"><FacebookIcon /></SocialIcon>
      <SocialIcon href="#" label="Instagram"><InstagramIcon /></SocialIcon>
      <SocialIcon href="https://wa.me/2348012345678" label="WhatsApp"><MessageCircle size={16} /></SocialIcon>
      <SocialIcon href="#" label="X"><XIcon /></SocialIcon>
  
    </div>
  )
}

export function Footer() {
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <footer className="relative bg-[#0A2E1A] text-white overflow-hidden">
      <BuildingArt className="hidden md:block absolute right-0 bottom-0 w-[520px] h-auto opacity-[0.07] pointer-events-none" />
      <BuildingArt className="md:hidden absolute left-0 bottom-0 w-full h-auto opacity-[0.05] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 pt-16 pb-8">
        {/* Desktop */}
        <div className="hidden md:grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-10">
          <div>
            <img src="/logo-white.png" alt="EboHomes" className="h-12 w-auto mb-5" />
            <p className="text-lg font-semibold mb-2">
              Find Homes. <span className="text-emerald-400">Skip the Stress.</span>
            </p>
            <p className="text-sm text-white/60 leading-relaxed mb-6 max-w-[220px]">
              Connecting people with places they can trust.
            </p>
            <div className="mb-8"><SocialRow /></div>
            <TrustBadge />
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold tracking-wide uppercase text-white mb-1.5">
                {group.title}
              </h4>
              <span className="block w-6 h-[2px] bg-amber-400/70 mb-4" />
              <ul className="space-y-3 text-sm text-white/70">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="hover:text-white transition-colors">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <img src="/logo-white.png" alt="EboHomes" className="h-11 w-auto mb-5" />
          <p className="text-lg font-semibold mb-2">
            Find Homes. <span className="text-emerald-400">Skip the Stress.</span>
          </p>
          <p className="text-sm text-white/60 leading-relaxed mb-6">
            Connecting people with places they can trust.
          </p>

          <div className="mb-6"><SocialRow /></div>

          <div className="border-t border-white/10 pt-5">
            <TrustBadge />
          </div>

          <div className="mt-4 divide-y divide-white/10 border-t border-white/10">
            {NAV_GROUPS.map((group) => {
              const isOpen = openGroup === group.title
              return (
                <div key={group.title}>
                  <button
                    onClick={() => setOpenGroup(isOpen ? null : group.title)}
                    className="w-full flex items-center justify-between py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-xs font-semibold tracking-wide uppercase text-white">
                      {group.title}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-40 pb-4' : 'max-h-0'}`}>
                    <ul className="space-y-3 text-sm text-white/70">
                      {group.links.map((link) => (
                        <li key={link.label}>
                          {link.external ? (
                            <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                              {link.label}
                            </a>
                          ) : (
                            <Link href={link.href} className="hover:text-white transition-colors">
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
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50 text-center sm:text-left">
            &copy; {new Date().getFullYear()} EboHomes. All rights reserved.
          </p>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <span className="text-white/20">|</span>
            <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
            <span className="text-white/20">|</span>
            <Link href="/cookies" className="hover:text-white transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}