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
  if (!audioContext || audioContext.state === 'closed') audioContext = new AudioCtx()
  return audioContext
}

// Browsers only allow sound after the person has tapped or clicked something,
// and some (iOS Safari especially) stop the audio again when the page goes to
// the background or the screen locks. unlockNotificationSound() is therefore
// safe to call on EVERY tap, not just the first: it does nothing while the
// audio is already running.
export function unlockNotificationSound() {
  try {
    const ctx = getContext()
    if (!ctx) return
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => {})
      // A silent one-sample sound started inside a tap fully unlocks iOS audio
      const silent = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = silent
      source.connect(ctx.destination)
      source.start(0)
    }
  } catch (err) {
    console.error('Could not unlock notification sound:', err)
  }
}

// Keeps the audio unlocked for as long as the app is open. Call once; it
// returns a function that removes the listeners. Unlike a one-time "first tap"
// listener, this re-unlocks the sound after the browser suspends it.
export function armNotificationSoundUnlock(): () => void {
  if (typeof window === 'undefined') return () => {}
  const events = ['pointerdown', 'touchend', 'click', 'keydown'] as const
  const onGesture = () => unlockNotificationSound()
  for (const name of events) window.addEventListener(name, onGesture, { passive: true })
  return () => {
    for (const name of events) window.removeEventListener(name, onGesture)
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
// Fails quietly if the browser has not allowed sound yet. If the audio was
// suspended, it asks the browser to resume first and only plays if that
// succeeds within a few seconds, so an old chime never plays much later.
export function playNotificationSound() {
  try {
    const ctx = getContext()
    if (!ctx) return

    // Never stack sounds on top of each other
    if (Date.now() - lastPlayedAt < 800) return

    const requestedAt = Date.now()

    const chime = () => {
      if (ctx.state !== 'running') return
      if (Date.now() - requestedAt > 3000) return
      if (Date.now() - lastPlayedAt < 800) return
      lastPlayedAt = Date.now()

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
    }

    if (ctx.state === 'running') {
      chime()
    } else {
      void ctx.resume().then(chime).catch(() => {})
    }
  } catch (err) {
    console.error('Could not play notification sound:', err)
  }
}
