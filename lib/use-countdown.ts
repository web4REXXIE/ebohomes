import { useCallback, useEffect, useState } from 'react'

export function useCountdown(initial = 0) {
  const [seconds, setSeconds] = useState(initial)

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const start = useCallback((n: number) => setSeconds(n), [])
  return { seconds, start }
}