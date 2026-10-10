'use client'

import { useRef } from 'react'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  error?: boolean
  autoFocus?: boolean
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  error,
  autoFocus,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus()

  const handleChange = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '')
    if (!clean) return
    const next = (value.slice(0, i) + clean).slice(0, length)
    onChange(next)
    focus(Math.min(next.length, length - 1))
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1))
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i))
        focus(i - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      focus(i - 1)
    } else if (e.key === 'ArrowRight') {
      focus(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    focus(Math.min(pasted.length, length - 1))
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={d}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`w-11 h-14 sm:w-12 text-center text-xl font-semibold rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 disabled:opacity-60 ${
            error
              ? 'border-destructive focus:ring-destructive'
              : 'border-border focus:ring-primary'
          }`}
        />
      ))}
    </div>
  )
}