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

// The browser's install event is not in TypeScript's built-in types
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type Stored = { dismissedAt?: number; dismissCount?: number; installed?: boolean }

export interface InstallContextValue {
  ready: boolean
  platform: InstallPlatform
  browser: InstallBrowser
  /** True only when EboHomes is currently running as an installed app */
  isStandalone: boolean
  /** True when EboHomes was installed on this device earlier (browser confirmed it) */
  hasInstalled: boolean
  /** True when the browser has handed us a real native install prompt */
  canPrompt: boolean
  /** Whether Get App buttons make sense on this device right now */
  shouldOfferInstall: boolean
  /** Visitor has browsed long enough for the banner to appear */
  engaged: boolean
  /** Banner is hidden because of "Not now" or because the app is installed */
  bannerSuppressed: boolean
  sheetOpen: boolean
  /** The one shared action behind every Get App entry point */
  startInstall: () => Promise<PromptOutcome>
  promptInstall: () => Promise<PromptOutcome>
  openSheet: () => void
  closeSheet: () => void
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
  startInstall: async () => 'unavailable',
  promptInstall: async () => 'unavailable',
  openSheet: () => {},
  closeSheet: () => {},
  dismissBanner: () => {},
}

const InstallContext = createContext<InstallContextValue>(DEFAULT_VALUE)

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
    // Storage is blocked: the choice still applies for this visit only
  }
}

function isSuppressed(stored: Stored): boolean {
  if (stored.installed) return true
  if (stored.dismissedAt) {
    const days =
      (stored.dismissCount ?? 1) >= INSTALL_CONFIG.longDismissAfter
        ? INSTALL_CONFIG.longDismissDays
        : INSTALL_CONFIG.dismissDays
    return Date.now() - stored.dismissedAt < days * 86_400_000
  }
  return false
}

// ---------- Device and browser detection (runs only in the browser) ----------
function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent || ''
  // iPadOS pretends to be a Mac, so also check for touch support
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (ua) return 'desktop'
  return 'unknown'
}

function detectBrowser(): InstallBrowser {
  const ua = navigator.userAgent || ''
  // In-app browsers (Facebook, Instagram, TikTok, WeChat, Android WebView...) cannot install
  if (/FBAN|FBAV|Instagram|TikTok|musical_ly|Snapchat|MicroMessenger|Line\/|; wv\)/i.test(ua)) return 'inapp'
  if (/Edg\/|EdgA|EdgiOS/i.test(ua)) return 'edge'
  if (/OPR\/|OPiOS/i.test(ua)) return 'opera'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox'
  if (/Chrome|CriOS/i.test(ua)) return 'chrome'
  if (/Safari/i.test(ua)) return 'safari'
  return 'other'
}

// No single method works everywhere, so several signals are combined
function detectStandalone(): boolean {
  try {
    const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    if (modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true
    // iPhone and iPad (Safari "Add to Home Screen")
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
    // Android app wrapper (used later if EboHomes is published on Google Play)
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

  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const pageViews = useRef(0)
  const lastPath = useRef<string | null>(null)

  // 1. One-time detection after the page has loaded (avoids hydration mismatches)
  useEffect(() => {
    const stored = readStore()
    setPlatform(detectPlatform())
    setBrowser(detectBrowser())
    setIsStandalone(detectStandalone())
    setHasInstalled(Boolean(stored.installed))
    setBannerSuppressed(isSuppressed(stored))
    setReady(true)
  }, [])

  // 2. Browser install events. Registered once, removed on cleanup.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // we show the prompt ourselves, when the visitor asks
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanPrompt(true)
    }
    const onInstalled = () => {
      deferredPrompt.current = null
      setCanPrompt(false)
      setHasInstalled(true)
      setBannerSuppressed(true)
      setSheetOpen(false)
      writeStore({ installed: true })
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

  // 4. "Let them browse first": engaged after a delay...
  useEffect(() => {
    const t = setTimeout(() => setEngaged(true), INSTALL_CONFIG.showAfterMs)
    return () => clearTimeout(t)
  }, [])

  // ...or after a few page views in one visit
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    pageViews.current += 1
    if (pageViews.current >= INSTALL_CONFIG.showAfterPageViews) setEngaged(true)
  }, [pathname])

  const openSheet = useCallback(() => setSheetOpen(true), [])
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    const ev = deferredPrompt.current
    if (!ev) return 'unavailable'
    // The browser allows each saved event to be used only once
    deferredPrompt.current = null
    setCanPrompt(false)
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      return outcome
    } catch {
      return 'unavailable'
    }
  }, [])

  // The single action behind every Get App button and the banner
  const startInstall = useCallback(async (): Promise<PromptOutcome> => {
    if (detectStandalone()) return 'unavailable'
    if (deferredPrompt.current) {
      const outcome = await promptInstall()
      if (outcome !== 'unavailable') return outcome
    }
    setSheetOpen(true)
    return 'unavailable'
  }, [promptInstall])

  const dismissBanner = useCallback(() => {
    const stored = readStore()
    writeStore({ dismissedAt: Date.now(), dismissCount: (stored.dismissCount ?? 0) + 1 })
    setBannerSuppressed(true)
  }, [])

  // Phones and tablets can always be guided. Desktop only where install really exists.
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
      startInstall,
      promptInstall,
      openSheet,
      closeSheet,
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
      startInstall,
      promptInstall,
      openSheet,
      closeSheet,
      dismissBanner,
    ],
  )

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>
}

export function useInstall(): InstallContextValue {
  return useContext(InstallContext)
}