
'use client'

import { useState, useEffect } from 'react'

const SEEN_KEY = 'ebohomes-splash-seen'
const BG = '#062D1A' // same green as the logo image, so there is no visible box
const MIN_MS = 1400 // shortest time shown, so it never just flashes
const MAX_MS = 3500 // longest time, even if the page is slow
const FADE_MS = 450

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // Full splash once per visit. After that, go straight to the page.
    let seen = false
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1'
    } catch {
      seen = false
    }
    if (seen) {
      setVisible(false)
      return
    }

    const start = Date.now()
    let finished = false
    let waitTimer: ReturnType<typeof setTimeout> | undefined
    let fadeTimer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (finished) return
      finished = true
      const wait = Math.max(MIN_MS - (Date.now() - start), 0)
      waitTimer = setTimeout(() => {
        setFadeOut(true)
        fadeTimer = setTimeout(() => {
          setVisible(false)
          try {
            sessionStorage.setItem(SEEN_KEY, '1')
          } catch {
            /* private mode: ignore */
          }
        }, FADE_MS)
      }, wait)
    }

    if (document.readyState === 'complete') finish()
    else window.addEventListener('load', finish)
    const maxTimer = setTimeout(finish, MAX_MS)

    return () => {
      window.removeEventListener('load', finish)
      clearTimeout(maxTimer)
      if (waitTimer) clearTimeout(waitTimer)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [visible])

  return (
    <>
      {visible && (
        <div
          role="status"
          aria-label="Loading EboHomes"
          className={`fixed inset-0 z-[9999] flex h-[100dvh] flex-col items-center justify-center px-6 transition-opacity ease-out ${
            fadeOut ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ backgroundColor: BG, transitionDuration: `${FADE_MS}ms` }}
        >
          <div className="relative flex w-[clamp(190px,58vw,320px)] items-center justify-center">
            <span
              className="ebo-ring absolute left-1/2 top-1/2 aspect-square w-[62%] rounded-full border border-[#24A65A]/50"
              aria-hidden
            />
            <img
              src="/splash-mark.png"
              alt=""
              draggable={false}
              decoding="sync"
              className="ebo-mark relative w-full select-none"
            />
          </div>

          <p className="ebo-text -mt-3 text-[clamp(16px,4.8vw,24px)] font-extrabold tracking-[0.3em] text-white">
            EBOHOMES
          </p>
          <p className="ebo-text2 mt-2 text-center text-[clamp(9px,2.7vw,12px)] uppercase tracking-[0.2em] text-white/60">
            Find Homes. Skip the Stress.
          </p>

          <div className="mt-9 h-[3px] w-28 overflow-hidden rounded-full bg-white/15">
            <div className="ebo-bar h-full w-1/2 rounded-full bg-[#24A65A]" />
          </div>

          <style>{`
            @keyframes ebo-mark-in {
              0% { opacity: 0; transform: scale(0.85); }
              100% { opacity: 1; transform: scale(1); }
            }
            @keyframes ebo-ring {
              0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.7; }
              100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
            }
            @keyframes ebo-fade-up {
              0% { opacity: 0; transform: translateY(8px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes ebo-bar {
              0% { transform: translateX(-120%); }
              100% { transform: translateX(220%); }
            }
            .ebo-mark { animation: ebo-mark-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
            .ebo-ring { animation: ebo-ring 2s ease-out 0.5s infinite; }
            .ebo-text { animation: ebo-fade-up 0.6s ease-out 0.35s both; }
            .ebo-text2 { animation: ebo-fade-up 0.6s ease-out 0.55s both; }
            .ebo-bar { animation: ebo-bar 1.5s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .ebo-mark, .ebo-text, .ebo-text2 { animation: none; }
              .ebo-ring, .ebo-bar { animation: none; }
              .ebo-ring { opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {children}
    </>
  )
}

