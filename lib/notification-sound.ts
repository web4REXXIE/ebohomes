let audioContext: AudioContext | null = null
let lastPlayedAt = 0

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
// The notification provider calls this on the first tap anywhere on the site,
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

// One bell-like note: a pure tone plus two quiet overtones, with a fast
// attack and a smooth fade. The overtones give it a warm "chime" character.
function strike(
  ctx: AudioContext,
  out: AudioNode,
  frequency: number,
  start: number,
  length: number,
  peak: number
) {
  const partials = [
    { multiple: 1, level: 1 },
    { multiple: 2, level: 0.3 },
    { multiple: 3, level: 0.1 },
  ]
  for (const p of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency * p.multiple, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak * p.level, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    osc.connect(gain)
    gain.connect(out)
    osc.start(start)
    osc.stop(start + length + 0.05)
  }
}

// Plays a short, pleasant three-note rising chime (G5, C6, E6).
// Fails quietly if the browser has not allowed sound yet.
export function playNotificationSound() {
  try {
    const ctx = getContext()
    if (!ctx) return

    // Never stack sounds on top of each other
    const nowMs = Date.now()
    if (nowMs - lastPlayedAt < 800) return
    lastPlayedAt = nowMs

    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const start = ctx.currentTime + 0.02

    // A gentle limiter so the chime is clear but never harsh
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.setValueAtTime(-14, start)
    limiter.ratio.setValueAtTime(8, start)
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.9, start)
    master.connect(limiter)
    limiter.connect(ctx.destination)

    strike(ctx, master, 783.99, start, 0.55, 0.3) // G5
    strike(ctx, master, 1046.5, start + 0.13, 0.65, 0.3) // C6
    strike(ctx, master, 1318.51, start + 0.26, 1.0, 0.32) // E6
  } catch (err) {
    console.error('Could not play notification sound:', err)
  }
}