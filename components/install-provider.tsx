'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { INSTALL_CONFIG } from '@/lib/install-config'

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown'
export type InstallBrowser =
  | 'safari'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'samsung'
  | 'opera'
  | 'inapp'
  | 'other'
export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Stored = {
  dismissedAt?: number
  installedAt?: number
  lastSeenAt?: number
  // Old fields from the first version. They are ignored and cleared.
  installed?: boolean
  dismissCount?: number
}

export interface InstallContextValue {
  ready: boolean
  platform: InstallPlatform
  browser: InstallBrowser
  isStandalone: boolean
  hasInstalled: boolean
  canPrompt: boolean
  shouldOfferInstall: boolean
  engaged: boolean
  bannerSuppressed: boolean
  sheetOpen: boolean
  /** Changes every time the visitor comes back after being away */
  visitId: number
  startInstall: () => Promise<PromptOutcome>
  promptInstall: () => Promise<PromptOutcome>
  openSheet: () => void
  /** Closes the guide and counts it as "not now" */
  closeSheet: () => void
  /** Closes the guide without counting it as a dismissal */
  hideSheet: () => void
  dismissBanner: () => void
}

const DEFAULT_VALUE: InstallContextValue = {
  ready: false,
  platform: 'unknown',
  browser: 'other',
  isStandalone: false,
  hasInstalled: false,
  canPrompt: false,
  shouldOfferInstall: false,
  engaged: false,
  bannerSuppressed: true,
  sheetOpen: false,
  visitId: 0,
  startInstall: async () => 'unavailable',
  promptInstall: async () => 'unavailable',
  openSheet: () => {},
  closeSheet: () => {},
  hideSheet: () => {},
  dismissBanner: () => {},
}

const InstallContext = createContext<InstallContextValue>(DEFAULT_VALUE)

const DAY = 86_400_000

// ---------- Safe browser storage (never crashes if localStorage is blocked) ----------
function readStore(): Stored {
  try {
    const raw = window.localStorage.getItem(INSTALL_CONFIG.storageKey)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    return {}
  }
}

function writeStore(patch: Partial<Stored>) {
  try {
    const next = { ...readStore(), ...patch }
    window.localStorage.setItem(INSTALL_CONFIG.storageKey, JSON.stringify(next))
  } catch {
    // Storage is blocked: the choice still applies while this page stays open
  }
}

function isInstalledFlagValid(stored: Stored): boolean {
  return Boolean(stored.installedAt) && Date.now() - (stored.installedAt as number) < INSTALL_CONFIG.installedTrustDays * DAY
}

function isDismissed(stored: Stored): boolean {
  return Boolean(stored.dismissedAt) && Date.now() - (stored.dismissedAt as number) < INSTALL_CONFIG.dismissDays * DAY
}

function isSuppressed(stored: Stored): boolean {
  return isInstalledFlagValid(stored) || isDismissed(stored)
}

// ---------- Device and browser detection (runs only in the browser) ----------
function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent || ''
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (ua) return 'desktop'
  return 'unknown'
}

function detectBrowser(): InstallBrowser {
  const ua = navigator.userAgent || ''
  if (/FBAN|FBAV|Instagram|TikTok|musical_ly|Snapchat|MicroMessenger|Line\/|; wv\)/i.test(ua)) return 'inapp'
  if (/Edg\/|EdgA|EdgiOS/i.test(ua)) return 'edge'
  if (/OPR\/|OPiOS/i.test(ua)) return 'opera'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox'
  if (/Chrome|CriOS/i.test(ua)) return 'chrome'
  if (/Safari/i.test(ua)) return 'safari'
  return 'other'
}

function detectStandalone(): boolean {
  try {
    const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    if (modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
    if (document.referrer.startsWith('android-app://')) return true
  } catch {
    // Treat unknown as "not installed"
  }
  return false
}

export function InstallProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [ready, setReady] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('unknown')
  const [browser, setBrowser] = useState<InstallBrowser>('other')
  const [isStandalone, setIsStandalone] = useState(false)
  const [hasInstalled, setHasInstalled] = useState(false)
  const [canPrompt, setCanPrompt] = useState(false)
  const [bannerSuppressed, setBannerSuppressed] = useState(true)
  const [engaged, setEngaged] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [visitId, setVisitId] = useState(0)

  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const pageViews = useRef(0)
  const lastPath = useRef<string | null>(null)
  const returning = useRef(false)
  const lastSeen = useRef<number>(Date.now())

  // 1. One-time detection after the page has loaded (avoids hydration mismatches)
  useEffect(() => {
    // Testing helper: open any page with ?resetinstall=1 to clear every saved choice
    try {
      if (new URLSearchParams(window.location.search).get('resetinstall') === '1') {
        window.localStorage.removeItem(INSTALL_CONFIG.storageKey)
      }
    } catch {}

    const stored = readStore()
    returning.current = Boolean(stored.lastSeenAt)
    // Clear the old permanent flag from the first version
    if (stored.installed !== undefined || stored.dismissCount !== undefined) {
      writeStore({ installed: undefined, dismissCount: undefined })
    }
    lastSeen.current = Date.now()
    writeStore({ lastSeenAt: lastSeen.current })

    setPlatform(detectPlatform())
    setBrowser(detectBrowser())
    setIsStandalone(detectStandalone())
    setHasInstalled(isInstalledFlagValid(stored))
    setBannerSuppressed(isSuppressed(stored))
    setReady(true)
  }, [])

  // 2. Browser install events. Registered once, removed on cleanup.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanPrompt(true)
      // The browser only offers installation when the app is NOT installed,
      // so an old "installed" flag (for example after uninstalling) is wrong.
      const stored = readStore()
      if (stored.installedAt) {
        writeStore({ installedAt: undefined })
        setHasInstalled(false)
        setBannerSuppressed(isDismissed({ ...stored, installedAt: undefined }))
      }
    }
    const onInstalled = () => {
      deferredPrompt.current = null
      setCanPrompt(false)
      setHasInstalled(true)
      setBannerSuppressed(true)
      setSheetOpen(false)
      writeStore({ installedAt: Date.now() })
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // 3. Keep "running as installed app" correct if the display mode changes
  useEffect(() => {
    let mq: MediaQueryList | null = null
    try {
      mq = window.matchMedia('(display-mode: standalone)')
    } catch {
      return
    }
    const onChange = () => setIsStandalone(detectStandalone())
    mq.addEventListener?.('change', onChange)
    return () => mq?.removeEventListener?.('change', onChange)
  }, [])

  // 4. Coming back after being away counts as a new visit.
  //    Phones resume the same page instead of reloading it, so this is what makes the banner return.
  useEffect(() => {
    const markAway = () => {
      lastSeen.current = Date.now()
      writeStore({ lastSeenAt: lastSeen.current })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markAway()
        return
      }
      const awayMs = Date.now() - lastSeen.current
      lastSeen.current = Date.now()
      writeStore({ lastSeenAt: lastSeen.current })
      if (awayMs >= INSTALL_CONFIG.awayMinutes * 60_000) {
        const stored = readStore()
        returning.current = true
        setIsStandalone(detectStandalone())
        setHasInstalled(isInstalledFlagValid(stored))
        setBannerSuppressed(isSuppressed(stored))
        setEngaged(false)
        setVisitId((v) => v + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', markAway)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', markAway)
    }
  }, [])

  // 5. "Let them browse first". Returning visitors wait less than first-time visitors.
  useEffect(() => {
    if (!ready) return
    const delay = returning.current ? INSTALL_CONFIG.returnShowAfterMs : INSTALL_CONFIG.showAfterMs
    const t = setTimeout(() => setEngaged(true), delay)
    return () => clearTimeout(t)
  }, [ready, visitId])

  // ...or after a few page views in one visit
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    pageViews.current += 1
    if (pageViews.current >= INSTALL_CONFIG.showAfterPageViews) setEngaged(true)
  }, [pathname])

  const recordDismissal = useCallback(() => {
    writeStore({ dismissedAt: Date.now() })
    setBannerSuppressed(true)
  }, [])

  const openSheet = useCallback(() => setSheetOpen(true), [])
  const hideSheet = useCallback(() => setSheetOpen(false), [])
  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    // Closing the guide without installing counts as "not now"
    if (!detectStandalone()) recordDismissal()
  }, [recordDismissal])

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    const ev = deferredPrompt.current
    if (!ev) return 'unavailable'
    // The browser allows each saved event to be used only once
    deferredPrompt.current = null
    setCanPrompt(false)
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      // Declined in the browser's own dialog: same 7-day pause.
      // Accepted: wait for the browser's "appinstalled" event before claiming anything.
      if (outcome === 'dismissed') recordDismissal()
      return outcome
    } catch {
      return 'unavailable'
    }
  }, [recordDismissal])

  // The single action behind every Get App button and the banner
  const startInstall = useCallback(async (): Promise<PromptOutcome> => {
    if (detectStandalone()) return 'unavailable'
    if (deferredPrompt.current) {
      const outcome = await promptInstall()
      if (outcome !== 'unavailable') return outcome
    }
    // No native prompt: show the right instructions for this device
    setSheetOpen(true)
    return 'unavailable'
  }, [promptInstall])

  const dismissBanner = useCallback(() => {
    recordDismissal()
  }, [recordDismissal])

  const shouldOfferInstall =
    ready &&
    !isStandalone &&
    (platform === 'ios' ||
      platform === 'android' ||
      (platform === 'desktop' && (canPrompt || browser === 'safari')))

  const value = useMemo<InstallContextValue>(
    () => ({
      ready,
      platform,
      browser,
      isStandalone,
      hasInstalled,
      canPrompt,
      shouldOfferInstall,
      engaged,
      bannerSuppressed,
      sheetOpen,
      visitId,
      startInstall,
      promptInstall,
      openSheet,
      closeSheet,
      hideSheet,
      dismissBanner,
    }),
    [
      ready,
      platform,
      browser,
      isStandalone,
      hasInstalled,
      canPrompt,
      shouldOfferInstall,
      engaged,
      bannerSuppressed,
      sheetOpen,
      visitId,
      startInstall,
      promptInstall,
      openSheet,
      closeSheet,
      hideSheet,
      dismissBanner,
    ],
  )

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>
}

export function useInstall(): InstallContextValue {
  return useContext(InstallContext)
}