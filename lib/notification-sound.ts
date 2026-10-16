let audioContext: AudioContext | null = null

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext
}

// Other parts of the app call notifyPreferencesChanged() after the person
// saves their notification settings, so the sound setting takes effect
// straight away without a page reload.
export const NOTIFICATION_PREFS_CHANGED_EVENT = 'ebohomes:notification-prefs-changed'

export function notifyPreferencesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATION_PREFS_CHANGED_EVENT))
  }
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext
  if (!AudioCtx) return null
  if (!audioContext) audioContext = new AudioCtx()
  return audioContext
}

// Browsers only allow sound after the person has tapped or clicked something.
// The notification listener calls this on the first tap anywhere on the site,
// so a later automatic sound is allowed to play.
export function unlockNotificationSound() {
  try {
    const ctx = getContext()
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume()
    }
  } catch (err) {
    console.error('Could not unlock notification sound:', err)
  }
}

// Plays a short, soft two-tone beep. Fails quietly if the browser has not
// allowed sound yet.
export function playNotificationSound() {
  try {
    const ctx = getContext()
    if (!ctx) return
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