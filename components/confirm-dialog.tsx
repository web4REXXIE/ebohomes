'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, HelpCircle } from 'lucide-react'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for actions that are hard to undo. */
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

/**
 * Replaces window.confirm. Usage:
 *   const { confirm, dialog } = useConfirm()
 *   if (!(await confirm({ message: 'Do the thing?' }))) return
 *   ...render {dialog} once in the page JSX.
 * Focus starts on Cancel, Tab stays inside, Escape cancels, and focus returns to the button that opened it.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
        pendingRef.current?.resolve(false)
        const p: Pending = { ...o, resolve }
        pendingRef.current = p
        setPending(p)
      }),
    []
  )

  const settle = useCallback((ok: boolean) => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setPending(null)
    p.resolve(ok)
  }, [])

  // If the page closes while a question is open, answer "no" so nothing is left waiting.
  useEffect(() => () => pendingRef.current?.resolve(false), [])

  const dialog = pending ? <ConfirmDialog {...pending} onSettle={settle} /> : null
  return { confirm, dialog }
}

function ConfirmDialog({
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onSettle,
}: ConfirmOptions & { onSettle: (ok: boolean) => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onSettle(false)
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Icon = destructive ? AlertTriangle : HelpCircle

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => onSettle(false)} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            }`}
          >
            <Icon size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="font-semibold text-foreground">{title}</h2>
            <p id={bodyId} className="mt-1 break-words text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onSettle(false)}
            className="min-h-11 flex-1 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-secondary/50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold ${
              destructive ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
