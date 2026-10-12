// Makes a 64-bit "difference hash" fingerprint, as 16 hex characters.
// Similar-looking pictures give hashes that differ in only a few bits.

function hashFromSource(source: CanvasImageSource): string {
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(source, 0, 0, 9, 8)
  const { data } = ctx.getImageData(0, 0, 9, 8)

  const gray: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }

  let bits = ''
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

export async function computeImageHash(file: File): Promise<string> {
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image load failed'))
      el.src = url
    })
    URL.revokeObjectURL(url)
    return hashFromSource(img)
  } catch {
    return ''
  }
}

function waitFor(target: HTMLVideoElement, eventName: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    target.addEventListener(
      eventName,
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

// Takes 5 snapshots across the video and fingerprints each one.
// Returns an empty list if the browser cannot read the video.
export async function computeVideoHashes(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url

    await waitFor(video, 'loadedmetadata', 8000)
    const duration = video.duration
    if (!isFinite(duration) || duration <= 0) return []

    const hashes: string[] = []
    const points = [0.1, 0.3, 0.5, 0.7, 0.9]
    for (const p of points) {
      try {
        const seeked = waitFor(video, 'seeked', 5000)
        video.currentTime = duration * p
        await seeked
        const h = hashFromSource(video)
        if (h.length === 16 && h !== '0000000000000000') hashes.push(h)
      } catch {
        // skip this snapshot
      }
    }
    return hashes
  } catch {
    return []
  } finally {
    URL.revokeObjectURL(url)
  }
}