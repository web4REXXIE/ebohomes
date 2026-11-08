'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PromptCard } from '@/components/ui/prompt-card'
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
    visitId,
    startInstall,
    dismissBanner,
  } = useInstall()
  const [hiddenThisVisit, setHiddenThisVisit] = useState(false)

  // A returning visitor gets a fresh chance (unless they dismissed it within the last 7 days)
  useEffect(() => {
    setHiddenThisVisit(false)
  }, [visitId])

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

  const onInstall = () => {
    setHiddenThisVisit(true)
    void startInstall()
  }

  return (
    <aside
      aria-label="Install the EboHomes app"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] md:inset-x-auto md:bottom-6 md:left-6 md:w-[380px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500"
    >
      <PromptCard
        onDismiss={dismissBanner}
        title="Make yourself at home."
        icon={<img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-full object-cover" />}
        actions={
          <>
            <Button onClick={onInstall} className="flex-1">Install App</Button>
            <Button variant="ghost" onClick={dismissBanner}>Not now</Button>
          </>
        }
      >
        Get the EboHomes app for a smoother way to find your next home and manage your rental journey.
      </PromptCard>
    </aside>
  )
}
