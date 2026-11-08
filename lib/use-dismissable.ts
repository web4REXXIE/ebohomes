'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Shared behaviour for small pop-over menus (account menu, desktop Dashboard menu).
 * While `open` is true:
 *  - Escape closes the menu and puts focus back on the button that opened it
 *  - a click or tap outside closes it (focus is left where the person clicked)
 *  - tabbing out of it closes it
 */
export function useDismissable(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
      triggerRef.current?.focus()
    }
    const onPointerDown = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }
    const onFocusIn = (e: FocusEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open, onClose, containerRef, triggerRef])
}
