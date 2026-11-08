import type { ReactNode } from 'react'
import { FileCheck2, MessageCircle, MessagesSquare, ShieldCheck } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'

// One layout for every sign-in and onboarding screen: login, signup, password reset.
// Desktop: brand panel on the left, form on the right. Phones: the form only, on a cream background.
// Presentation only. It holds no authentication logic.

// Only statements that match how the platform actually works.
const POINTS = [
  {
    icon: ShieldCheck,
    title: 'Listings are reviewed first',
    text: 'A property only goes live after EboHomes has reviewed it.',
  },
  {
    icon: FileCheck2,
    title: 'Checks are shown, not assumed',
    text: 'Each property page says what has and has not been checked.',
  },
  {
    icon: MessagesSquare,
    title: 'Everything goes through EboHomes',
    text: 'Questions, applications and viewing requests stay in one place.',
  },
]

function WhatsAppHelp({ className = '' }: { className?: string }) {
  return (
    <a
      href={`https://wa.me/${EBOHOMES_WHATSAPP}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center gap-2 text-body font-semibold text-primary hover:underline focus-ring ${className}`}
    >
      <MessageCircle size={16} aria-hidden />
      Need help? Chat with EboHomes on WhatsApp
    </a>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="grid flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Brand panel (large screens only) */}
        <aside
          aria-label="About EboHomes"
          className="relative hidden flex-col justify-center overflow-hidden bg-forest p-12 text-forest-foreground lg:flex"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: "url('/hero.jpg')" }}
          />
          <div aria-hidden className="absolute inset-0 bg-linear-to-t from-forest via-forest/80 to-forest/60" />

          <div className="relative z-10 max-w-md">
            <span aria-hidden className="mb-5 block h-0.5 w-12 rounded-full bg-featured" />
            <p className="text-display font-bold leading-tight">Real Estate You Can Trust.</p>
            <p className="mt-3 text-body-lg text-forest-foreground/80">Find Homes. Skip the Stress.</p>

            <ul className="mt-10 space-y-5">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-featured"
                  >
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="text-body font-semibold">{title}</p>
                    <p className="text-caption text-forest-foreground/75">{text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <a
              href={`https://wa.me/${EBOHOMES_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-control border border-white/20 px-4 text-body font-semibold text-forest-foreground transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <MessageCircle size={16} aria-hidden />
              Chat with EboHomes on WhatsApp
            </a>
          </div>
        </aside>

        {/* Form side */}
        <div className="flex items-start justify-center bg-cream px-4 py-8 text-cream-foreground sm:px-8 sm:py-12 lg:items-center">
          <div className="w-full max-w-md">
            <div className="rounded-card border border-border bg-card p-5 text-foreground shadow-rest sm:p-8">
              {children}
            </div>
            <div className="mt-4 text-center lg:hidden">
              <WhatsAppHelp />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
