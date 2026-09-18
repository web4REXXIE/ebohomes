'use client'

import { useState, useEffect } from 'react'

export function SplashScreen({
  children,
}: {
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const MIN_DISPLAY = 1400
    const MAX_DISPLAY = 4000

    const start = Date.now()
    let finished = false
    let finishTimer: ReturnType<typeof setTimeout> | undefined
    let fadeTimer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (finished) return
      finished = true

      const elapsed = Date.now() - start
      const wait = Math.max(MIN_DISPLAY - elapsed, 0)

      finishTimer = setTimeout(() => {
        setFadeOut(true)

        fadeTimer = setTimeout(() => {
          setLoading(false)
        }, 500)
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

      if (finishTimer) {
        clearTimeout(finishTimer)
      }

      if (fadeTimer) {
        clearTimeout(fadeTimer)
      }
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = loading ? 'hidden' : ''

    return () => {
      document.body.style.overflow = ''
    }
  }, [loading])

  return (
    <>
      {loading && (
        <div
          className={`
            fixed inset-0 z-[9999]
            flex items-center justify-center
            bg-[#0A2E1A]
            transition-opacity duration-500 ease-out
            ${fadeOut ? 'opacity-0' : 'opacity-100'}
          `}
        >
          {/* Main splash artwork */}
          <div className="relative w-full h-full flex items-center justify-center">

            <img
              src="/splash-screen.png"
              alt="EboHomes"
              draggable={false}
              className="
                max-w-full
                max-h-full
                w-auto
                h-auto
                object-contain
                select-none
              "
            />

            {/* Premium loading indicator */}
          <div
  className="
    absolute
    bottom-20
    left-1/2
    -translate-x-1/2
    flex
    flex-col
    items-center
    gap-3
    z-[110]
  "
>
  <div
    className="
      relative
      w-32
      h-[4px]
      overflow-hidden
      rounded-full
      bg-white/30
    "
  >
    <div
      className="
        absolute
        left-0
        top-0
        h-full
        w-1/2
        rounded-full
        bg-[#24A65A]
        shadow-[0_0_10px_rgba(36,166,90,0.7)]
        animate-ebohomes-loading
      "
    />
  </div>

  <p
    className="
      text-white
      text-sm
      font-bold
      tracking-[0.28em]
      uppercase
      drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]
    "
  >
    EBOHOMES
  </p>
</div>
          </div>
        </div>
      )}

      {children}
    </>
  )
}

export default function Loading() {
  return (
    <div
      className="
        fixed inset-0
        z-[9999]
        flex items-center justify-center
        bg-[#0A2E1A]
      "
    >
      <div className="relative w-full h-full flex items-center justify-center">

        {/* Splash artwork */}
        <img
          src="/splash-screen.png"
          alt="EboHomes"
          draggable={false}
          className="
            max-w-full
            max-h-full
            w-auto
            h-auto
            object-contain
            select-none
          "
        />

        {/* Premium loading indicator */}
        <div
          className="
            absolute
            bottom-8
            left-1/2
            -translate-x-1/2
            flex
            flex-col
            items-center
            gap-3
          "
        >
          {/* Loading bar */}
          <div
            className="
              relative
              w-28
              sm:w-32
              h-[3px]
              overflow-hidden
              rounded-full
              bg-white/30
              backdrop-blur-sm
            "
          >
            <div
              className="
                absolute
                left-0
                top-0
                h-full
                w-1/2
                rounded-full
                bg-[#24A65A]
                shadow-[0_0_8px_rgba(36,166,90,0.45)]
                animate-ebohomes-loading
              "
            />
          </div>

          {/* Brand */}
          <p
            className="
              text-white
              text-[9px]
              sm:text-[10px]
              font-medium
              tracking-[0.38em]
              uppercase
              drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]
            "
          >
            EboHomes
          </p>
        </div>
      </div>
    </div>
  )
}