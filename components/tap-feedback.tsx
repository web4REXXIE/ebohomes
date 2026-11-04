'use client'

import { useEffect } from 'react'

const TARGETS = 'button, a[href], [role="button"], summary'

export function TapFeedback() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const isDisabled = (el: Element) =>
      (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'

    // Ring that pops where the finger touches
    const onDown = (e: PointerEvent) => {
      if (reduce) return
      const el = (e.target as Element | null)?.closest(TARGETS)
      if (!el || isDisabled(el)) return

      const ring = document.createElement('span')
      ring.className = 'eh-tap-ring'
      ring.style.left = `${e.clientX}px`
      ring.style.top = `${e.clientY}px`
      document.body.appendChild(ring)
      ring.addEventListener('animationend', () => ring.remove(), { once: true })
      window.setTimeout(() => ring.remove(), 800)
    }

    // Small buzz on phones that support it
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest(TARGETS)
      if (!el || isDisabled(el)) return
      try {
        navigator.vibrate?.(8)
      } catch {}
    }

    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('click', onClick, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <style>{`
      a[href], button, [role="button"], summary {
        -webkit-tap-highlight-color: rgba(16, 122, 64, 0.2);
      }
      .eh-tap-ring {
        position: fixed;
        z-index: 9999;
        width: 56px;
        height: 56px;
        margin: -28px 0 0 -28px;
        border-radius: 9999px;
        pointer-events: none;
        background: rgba(255, 255, 255, 0.35);
        border: 2px solid rgba(16, 122, 64, 0.65);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
        animation: eh-tap-ring 0.55s ease-out forwards;
      }
      @keyframes eh-tap-ring {
        from { transform: scale(0.2); opacity: 1; }
        to { transform: scale(1.6); opacity: 0; }
      }
      @media (prefers-reduced-motion: no-preference) {
        button:not(:disabled):active,
        a[href]:active,
        [role="button"]:active,
        summary:active {
          scale: 0.96;
          filter: brightness(0.93);
        }
      }
    `}</style>
  )
}
