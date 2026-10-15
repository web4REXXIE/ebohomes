'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle2, Download, Monitor, Share, ShieldCheck, Smartphone, X } from 'lucide-react'
import { useInstall } from '@/components/install-provider'

type Guide = {
  title: string
  intro: string
  steps: React.ReactNode[]
  note?: string
}

const Dots = ({ vertical }: { vertical?: boolean }) => (
  <span className="mx-0.5 inline-block rounded bg-[#0A2E1A]/10 px-1.5 font-bold leading-5 text-[#0A2E1A]">
    {vertical ? '⋮' : '⋯'}
  </span>
)

const ShareIcon = () => (
  <Share size={15} className="mx-0.5 inline -mt-0.5 text-[#0A2E1A]" aria-label="Share" />
)

function getGuide(platform: string, browser: string): Guide {
  if (browser === 'inapp') {
    return {
      title: 'Open EboHomes in your browser',
      intro: 'This app’s built-in browser can’t install EboHomes. It takes a few seconds in your main browser.',
      steps: [
        <>Tap the <Dots /> or <Dots vertical /> menu in the corner of this screen.</>,
        <>Choose <b>Open in browser</b> (or <b>Open in Safari / Chrome</b>).</>,
        <>Tap <b>Get the EboHomes App</b> again.</>,
      ],
    }
  }

  if (platform === 'ios') {
    if (browser === 'safari') {
      return {
        title: 'Add EboHomes to your Home Screen',
        intro: 'Three quick taps and EboHomes opens like a real app, with no browser bars.',
        steps: [
          <>Tap the <ShareIcon /> <b>Share</b> button in Safari’s toolbar.</>,
          <>Scroll down and tap <b>Add to Home Screen</b>.</>,
          <>Tap <b>Add</b>. EboHomes now appears on your Home Screen.</>,
        ],
        note: 'On iPad, the Share button is at the top right of Safari.',
      }
    }
    return {
      title: 'Add EboHomes to your Home Screen',
      intro: 'Three quick taps and EboHomes opens like a real app, with no browser bars.',
      steps: [
        <>Tap the <ShareIcon /> <b>Share</b> button, or the <Dots /> menu, in your browser.</>,
        <>Choose <b>Add to Home Screen</b>.</>,
        <>Tap <b>Add</b>. EboHomes now appears on your Home Screen.</>,
      ],
      note: 'Don’t see “Add to Home Screen”? Open EboHomes in Safari and follow the same steps there.',
    }
  }

  if (platform === 'android') {
    if (browser === 'samsung') {
      return {
        title: 'Install EboHomes on your phone',
        intro: 'Add EboHomes to your Home screen so it opens like any other app.',
        steps: [
          <>Tap the menu button at the bottom right of Samsung Internet.</>,
          <>Tap <b>Add page to</b>, then choose <b>Home screen</b> (or <b>Install</b> if shown).</>,
          <>Confirm by tapping <b>Add</b>.</>,
        ],
      }
    }
    if (browser === 'firefox') {
      return {
        title: 'Install EboHomes on your phone',
        intro: 'Add EboHomes to your Home screen so it opens like any other app.',
        steps: [
          <>Tap the <Dots vertical /> menu in Firefox.</>,
          <>Tap <b>Install</b> (or <b>Add to Home screen</b>).</>,
          <>Confirm by tapping <b>Add</b>.</>,
        ],
      }
    }
    return {
      title: 'Install EboHomes on your phone',
      intro: 'Add EboHomes to your Home screen so it opens like any other app.',
      steps: [
        <>Tap the <Dots vertical /> menu in the top corner of your browser.</>,
        <>Tap <b>Install app</b>, or <b>Add to Home screen</b>.</>,
        <>Confirm by tapping <b>Install</b>.</>,
      ],
      note: 'Menu wording varies slightly between browsers.',
    }
  }

  if (platform === 'desktop') {
    if (browser === 'safari') {
      return {
        title: 'Add EboHomes to your Dock',
        intro: 'Keep EboHomes one click away on your Mac.',
        steps: [
          <>In the Safari menu bar, click <b>File</b>.</>,
          <>Choose <b>Add to Dock</b>.</>,
          <>Click <b>Add</b>.</>,
        ],
      }
    }
    if (browser === 'firefox') {
      return {
        title: 'Install from Chrome or Edge',
        intro: 'Firefox on computers can’t install web apps. You can keep using EboHomes right here, or open it in Chrome or Edge to install it.',
        steps: [],
      }
    }
    return {
      title: 'Install EboHomes on your computer',
      intro: 'EboHomes opens in its own window, with an icon on your desktop or taskbar.',
      steps: [
        <>Look for the <b>install icon</b> at the right end of the address bar and click it.</>,
        <>Or open the browser menu and choose <b>Install EboHomes</b> (in Edge: <b>Apps</b>, then <b>Install this site as an app</b>).</>,
        <>Click <b>Install</b>.</>,
      ],
    }
  }

  return {
    title: 'Get the EboHomes app',
    intro: 'Open your browser’s menu and look for an option called Install app or Add to Home screen.',
    steps: [],
  }
}

export function InstallSheet() {
  const {
    sheetOpen,
    closeSheet,
    hideSheet,
    platform,
    browser,
    canPrompt,
    isStandalone,
    promptInstall,
  } = useInstall()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!sheetOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [sheetOpen, closeSheet])

  if (!sheetOpen) return null

  const guide = getGuide(platform, browser)
  const DeviceIcon = platform === 'desktop' ? Monitor : Smartphone

  const onInstallNow = async () => {
    const outcome = await promptInstall()
    // The provider records a decline itself, so this only hides the guide
    if (outcome !== 'unavailable') hideSheet()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4 motion-safe:animate-in motion-safe:fade-in"
      onClick={closeSheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-sheet-title"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[#FAF7F2] shadow-2xl sm:rounded-3xl motion-safe:animate-in motion-safe:slide-in-from-bottom-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-[#0A2E1A] via-[#0A7A3B] to-[#0A2E1A] px-6 pb-6 pt-7 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          />
          <button
            ref={closeRef}
            type="button"
            onClick={closeSheet}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
          <div className="relative flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-white/10">
              <DeviceIcon size={26} className="text-amber-300" />
            </span>
            <div className="pr-8">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">EboHomes App</p>
              <h2 id="install-sheet-title" className="text-xl font-extrabold leading-tight">
                {isStandalone ? 'EboHomes is already installed' : guide.title}
              </h2>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isStandalone ? (
            <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-[#0A2E1A] ring-1 ring-black/5">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#0A7A3B]" />
              <p>You’re already using EboHomes as an app. Nothing more to do.</p>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-[#0A2E1A]/75">{guide.intro}</p>

              {canPrompt && (
                <button
                  type="button"
                  onClick={onInstallNow}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A7A3B] text-sm font-bold text-white shadow-md transition hover:bg-[#0A7A3B]/90 active:translate-y-px"
                >
                  <Download size={18} />
                  Install now
                </button>
              )}

              {guide.steps.length > 0 && (
                <>
                  {canPrompt && (
                    <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-[#0A2E1A]/50">
                      Or do it by hand
                    </p>
                  )}
                  <ol className="mt-4 space-y-3">
                    {guide.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-extrabold text-amber-950">
                          {i + 1}
                        </span>
                        <p className="pt-0.5 text-sm leading-relaxed text-[#0A2E1A]">{step}</p>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {guide.note && <p className="mt-4 text-xs leading-relaxed text-[#0A2E1A]/60">{guide.note}</p>}
            </>
          )}

          <div className="mt-5 flex items-center gap-2 text-xs text-[#0A2E1A]/60">
            <ShieldCheck size={14} className="shrink-0 text-[#0A7A3B]" />
            Free. No download from a store, and nothing is installed without your say-so.
          </div>
        </div>

        <div
          className="border-t border-black/5 bg-[#FAF7F2] px-6 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={closeSheet}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-[#0A2E1A]/15 text-sm font-semibold text-[#0A2E1A] hover:bg-black/5"
          >
            {isStandalone ? 'Close' : 'Maybe later'}
          </button>
        </div>
      </div>
    </div>
  )
}