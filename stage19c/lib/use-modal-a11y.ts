'use client'

import { useEffect, useRef } from 'react'

// Stage 19c: keyboard and screen-reader behaviour for a modal that is only rendered while it is open.
// Give the returned ref to the dialog panel (the box, not the dark backdrop) and also set role="dialog",
// aria-modal="true", aria-labelledby and tabIndex={-1} on it. While it is open:
//  - focus moves into the panel, and goes back to the button that opened it when the panel closes
//  - Escape closes it (unless canClose is false, for example while a save is running)
//  - Tab and Shift+Tab stay inside the panel
// The confirmation dialog (components/confirm-dialog.tsx) has its own copy of this behaviour. Left as it was.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalA11y<T extends HTMLElement = HTMLDivElement>(onClose: () => void, canClose = true) {
  const panelRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  const canCloseRef = useRef(canClose)

  useEffect(() => {
    closeRef.current = onClose
    canCloseRef.current = canClose
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current
      if (!panel) return
      if (e.key === 'Escape') {
        if (canCloseRef.current) { e.preventDefault(); closeRef.current() }
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); panel.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      else if (!panel.contains(active)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return panelRef
}
