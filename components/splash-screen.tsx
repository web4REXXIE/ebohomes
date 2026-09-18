'use client'

import { useState, useEffect } from 'react'

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const MIN_DISPLAY = 900   // always show splash at least this long
    const MAX_DISPLAY = 4000  // hard cap, in case 'load' never fires
    const start = Date.now()

    const finish = () => {
      const wait = Math.max(MIN_DISPLAY - (Date.now() - start), 0)
      setTimeout(() => {
        setFadeOut(true)
        setTimeout(() => setLoading(false), 400)
      }, wait)
    }

    if (document.readyState === 'complete') {
      finish()
    } else {
      window.addEventListener('load', finish)
    }
    const maxTimer = setTimeout(finish, MAX_DISPLAY)

    return () => {
      window.removeEventListener('load', finish)
      clearTimeout(maxTimer)
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = loading ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [loading])

  return (
    <>
      {loading && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#0A2E1A] transition-opacity duration-400 ${
            fadeOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <img
          src="/splash-screen.png"
          alt="EboHomes"
          className="max-w-full max-h-full w-auto h-auto object-contain"
        />
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[110]">
            <div className="w-9 h-9 border-4 border-[#1A3C1A]/20 border-t-[#1A3C1A] rounded-full animate-spin" />
            <p className="text-[#1A3C1A] text-xs font-semibold tracking-widest">LOADING...</p>
          </div>
        </div>
      )}
      {children}
    </>
  )
}

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2E1A]">
      <img
        src="/splash-screen.png"
        alt="EboHomes"
        className="max-w-full max-h-full w-auto h-auto object-contain"
       />
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[60]">
        <div className="w-9 h-9 border-4 border-[#1A3C1A]/20 border-t-[#1A3C1A] rounded-full animate-spin" />
        <p className="text-[#1A3C1A] text-xs font-semibold tracking-widest">LOADING...</p>
      </div>
    </div>
  )
}