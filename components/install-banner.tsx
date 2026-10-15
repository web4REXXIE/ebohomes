'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { useInstall } from '@/components/install-provider'
import { INSTALL_CONFIG } from '@/lib/install-config'

export function InstallBanner() {
  const pathname = usePathname()
  const {
    ready,
    shouldOfferInstall,
    engaged,
    bannerSuppressed,
    sheetOpen,
    isStandalone,
    startInstall,
    dismissBanner,
  } = useInstall()
  const [hiddenThisVisit, setHiddenThisVisit] = useState(false)

  const allowedHere = (INSTALL_CONFIG.bannerPaths as readonly string[]).includes(pathname)

  if (
    !ready ||
    !engaged ||
    !allowedHere ||
    !shouldOfferInstall ||
    isStandalone ||
    bannerSuppressed ||
    sheetOpen ||
    hiddenThisVisit
  ) {
    return null
  }

  const onInstall = async () => {
    setHiddenThisVisit(true)
    const outcome = await startInstall()
    // They said no in the browser's own dialog: respect it
    if (outcome === 'dismissed') dismissBanner()
  }

  return (
    <aside
      aria-label="Install the EboHomes app"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] md:inset-x-auto md:bottom-6 md:left-6 md:w-[380px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500"
    >
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-[#FAF7F2] p-4 shadow-2xl ring-1 ring-black/5">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0A2E1A] via-amber-400 to-[#0A2E1A]" />

        <button
          type="button"
          onClick={dismissBanner}
          aria-label="Dismiss"
          className="absolute right-1.5 top-2 flex h-9 w-9 items-center justify-center rounded-full text-[#0A2E1A]/50 hover:bg-black/5 hover:text-[#0A2E1A]"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-7">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl shadow-md ring-1 ring-black/10"
          />
          <div className="min-w-0">
            <p className="text-base font-extrabold leading-tight text-[#0A2E1A]">Make yourself at home.</p>
            <p className="mt-1 text-[13px] leading-snug text-[#0A2E1A]/70">
              Get the EboHomes app for a smoother way to find your next home and manage your rental journey.
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onInstall}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#0A7A3B] text-sm font-bold text-white shadow-sm transition hover:bg-[#0A7A3B]/90 active:translate-y-px"
          >
            Install App
          </button>
          <button
            type="button"
            onClick={dismissBanner}
            className="h-11 rounded-xl px-4 text-sm font-semibold text-[#0A2E1A]/70 hover:bg-black/5"
          >
            Not now
          </button>
        </div>
      </div>
    </aside>
  )
}