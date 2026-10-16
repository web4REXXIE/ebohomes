let audioContext: AudioContext | null = null

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext
}

// Plays a short, soft two-tone beep. Browsers only allow sound after the
// person has tapped or clicked something on the page, so this fails
// quietly if called too early.
export function playNotificationSound() {
  if (typeof window === 'undefined') return

  try {
    const AudioCtx =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext
    if (!AudioCtx) return

    if (!audioContext) audioContext = new AudioCtx()
    const ctx = audioContext
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const now = ctx.currentTime
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    oscillator.frequency.setValueAtTime(1175, now + 0.12)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.4)
  } catch (err) {
    console.error('Could not play notification sound:', err)
  }
}