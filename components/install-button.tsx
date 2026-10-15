'use client'

import { Download, ShieldCheck, Smartphone } from 'lucide-react'
import { useInstall } from '@/components/install-provider'

type Variant = 'hero' | 'header' | 'footer' | 'drawer'

export function InstallButton({ variant = 'hero', className = '' }: { variant?: Variant; className?: string }) {
  const { shouldOfferInstall, startInstall } = useInstall()

  // Hidden until the browser is checked, when already installed, or when install isn't possible here
  if (!shouldOfferInstall) return null

  const onClick = () => {
    void startInstall()
  }

  if (variant === 'drawer') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`mb-5 flex w-full items-center gap-3 rounded-xl border border-amber-400/50 bg-[#0A2E1A] p-3 text-left text-white ${className}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <Smartphone size={20} className="text-amber-300" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">Get the EboHomes App</span>
          <span className="block text-xs text-white/70">Free. Opens like a real app.</span>
        </span>
      </button>
    )
  }

  const looks: Record<Exclude<Variant, 'drawer'>, string> = {
    hero: 'mt-6 h-11 gap-2 rounded-full border border-amber-300/60 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20',
    header:
      'hidden h-9 gap-1.5 rounded-full border border-amber-400/60 px-3.5 text-sm font-semibold text-primary hover:bg-amber-50 lg:inline-flex',
    footer:
      'h-10 gap-2 rounded-full border border-amber-400/60 px-4 text-sm font-medium text-amber-400 hover:bg-amber-400/10',
  }

  const label = variant === 'header' ? 'Get App' : 'Get the EboHomes App'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center whitespace-nowrap transition active:translate-y-px ${looks[variant]} ${className}`}
    >
      <Download size={variant === 'header' ? 15 : 16} />
      {label}
    </button>
  )
}

// Homepage section. Replaces the old "EboHomes App Coming Soon!" block.
export function InstallPromoSection() {
  const { shouldOfferInstall, startInstall } = useInstall()
  if (!shouldOfferInstall) return null

  return (
    <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 p-6 text-white shadow-xl md:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className="relative z-10 flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div className="flex flex-col items-center gap-4 md:flex-row">
            <img src="/icons/icon-192.png" alt="" width={64} height={64} className="h-16 w-16 rounded-2xl shadow-lg ring-1 ring-white/20" />
            <div>
              <span className="mb-2 inline-block rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-300">
                EBOHOMES APP
              </span>
              <h3 className="text-xl font-extrabold md:text-2xl">Take EboHomes with you</h3>
              <p className="mt-1 max-w-md text-sm text-white/75">
                Add EboHomes to your device for faster access to listings, saved homes and messages.
              </p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/60 md:justify-start">
                <ShieldCheck size={13} className="text-amber-300" /> Free. No app store needed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void startInstall()}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-7 text-sm font-bold text-amber-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 active:translate-y-px"
          >
            <Download size={17} />
            Get the EboHomes App
          </button>
        </div>
      </div>
    </section>
  )
}