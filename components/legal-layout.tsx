import Link from 'next/link'
import { Header } from './header'
import { Footer } from './footer'

// Shared frame for the legal pages. Presentation only: the wording of each policy lives in its own
// page file and is passed in as children. Nothing here adds, removes or rewrites a clause.

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
      <main className="min-h-screen overflow-x-clip bg-cream text-cream-foreground">
        {/* Hero */}
        <div className="bg-forest text-forest-foreground">
          <div className="mx-auto max-w-3xl px-5 pb-8 pt-12 sm:px-6 sm:pt-14">
            <span aria-hidden className="mb-4 block h-0.5 w-10 rounded-full bg-featured" />
            <h1 className="text-h1 font-bold">{title}</h1>
            <p className="mt-2 text-caption text-forest-foreground/70">Last updated: {lastUpdated ?? '[TO CONFIRM]'}</p>

            <nav aria-label="Legal documents" className="-mx-1 mt-6 flex flex-wrap gap-x-1 gap-y-1 text-body">
              {LEGAL_PAGES.map((page) => {
                const active = page.href === activeHref
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center rounded-control px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      active
                        ? 'bg-white/10 font-semibold text-featured'
                        : 'text-forest-foreground/75 hover:bg-white/5 hover:text-forest-foreground'
                    }`}
                  >
                    {page.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-12">
          {toc && (
            <nav aria-label="On this page" className="mb-10 rounded-card border border-border bg-card px-5 py-4 shadow-rest">
              <p className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
              <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="inline-flex min-h-11 items-center text-body text-foreground/80 transition-colors hover:text-primary hover:underline focus-ring"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
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
      <h2 className="flex items-baseline gap-2 text-h3 font-semibold text-foreground">
        <span className="text-featured-foreground/70 dark:text-featured">{number}.</span> {title}
      </h2>
      <span aria-hidden className="mb-4 mt-2 block h-0.5 w-8 rounded-full bg-featured" />
      <div className="space-y-3 text-body leading-relaxed text-foreground/85 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </section>
  )
}

export function LegalNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-body text-warning">
      {children}
    </div>
  )
}
