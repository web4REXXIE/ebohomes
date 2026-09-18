import Link from 'next/link'
import { Header } from './header'
import { Footer } from './footer'

const LEGAL_PAGES = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/cookies', label: 'Cookie Policy' },
]

export function LegalLayout({
  title,
  activeHref,
  lastUpdated,
  toc,
  children,
}: {
  title: string
  activeHref: string
  lastUpdated?: string
  toc?: { id: string; label: string }[]
  children: React.ReactNode
}) {
  return (
    <>
      <Header />
      <main className="bg-[#FAF7F2] min-h-screen">
        {/* Hero */}
        <div className="bg-[#0A2E1A] text-white">
          <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-14 pb-10">
            <h1 className="text-2xl sm:text-3xl font-semibold">{title}</h1>
            <p className="text-sm text-white/60 mt-2">
              Last updated: {lastUpdated ?? '[TO CONFIRM]'}
            </p>

            <nav className="flex flex-wrap gap-x-5 gap-y-2 mt-6 text-sm">
              {LEGAL_PAGES.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  className={
                    page.href === activeHref
                      ? 'text-amber-400 font-medium border-b border-amber-400 pb-0.5'
                      : 'text-white/60 hover:text-white transition-colors pb-0.5'
                  }
                >
                  {page.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* Body */}
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-12">
          {toc && (
            <div className="mb-10 rounded-xl border border-[#0A2E1A]/10 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0A2E1A]/60 mb-3">
                On this page
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-[#0A2E1A]/70 hover:text-[#0A2E1A] transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-10">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-[#0A2E1A] flex items-baseline gap-2">
        <span className="text-amber-500">{number}.</span> {title}
      </h2>
      <span className="block w-8 h-[2px] bg-amber-400/70 mt-2 mb-4" />
      <div className="text-sm text-[#171717]/80 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

export function LegalNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-[#0A2E1A]/90">
      {children}
    </div>
  )
}