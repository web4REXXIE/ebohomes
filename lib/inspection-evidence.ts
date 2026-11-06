// Pure helpers for INSPECTION evidence files (Phase 10.4). Safe for client and server. No imports.
// Files live in the PRIVATE bucket below. The path is  <inspector id>/<job id>/<random id>.<ext>
// and must match the check inside eb_inspection_register_file in SQL.

export const INSPECTION_BUCKET = 'inspection-files'
export const INSPECTION_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const INSPECTION_VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const MAX_INSPECTION_FILES_PER_JOB = 30
export const INSPECTION_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}
export const INSPECTION_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
export const INSPECTION_VIDEO_ACCEPT = 'video/mp4,video/webm'
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type InspectionKind = 'photo' | 'video'
export type CaptureMethod = 'camera' | 'gallery' | 'unknown'

export function kindForMime(mime: unknown): InspectionKind | null {
  if (typeof mime !== 'string' || !INSPECTION_MIME_EXT[mime]) return null
  return mime.startsWith('video/') ? 'video' : 'photo'
}

export function validateInspectionFileMeta(mime: unknown, bytes: unknown): string | null {
  const kind = kindForMime(mime)
  if (!kind) {
    // iPhones record .mov by default. Say so plainly.
    if (mime === 'video/quicktime') return 'This video is in .mov format, which is not accepted. On iPhone use Settings > Camera > Formats > Most Compatible, then record again.'
    return 'Upload a JPG, PNG or WEBP photo, or an MP4 or WEBM video.'
  }
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (kind === 'photo' && bytes > INSPECTION_PHOTO_MAX_BYTES) return 'This photo is too large. The maximum is 10MB.'
  if (kind === 'video' && bytes > INSPECTION_VIDEO_MAX_BYTES) return 'This video is too large. The maximum is 100MB.'
  return null
}

// Reads the file's real type from its first bytes. Only shows the file is really one of the allowed formats.
// It says nothing about whether the content is genuine or was taken at the property.
export function sniffInspectionMime(bytes: Uint8Array): string | null {
  const at = (i: number, sig: number[]) => bytes.length >= i + sig.length && sig.every((b, k) => bytes[i + k] === b)
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  if (at(4, [0x66, 0x74, 0x79, 0x70])) {
    // 'ftyp' box. The brand 'qt  ' is an Apple .mov file, which is not accepted.
    if (at(8, [0x71, 0x74, 0x20, 0x20])) return null
    return 'video/mp4'
  }
  return null
}

export function normaliseCaptureMethod(v: unknown): CaptureMethod {
  return v === 'camera' || v === 'gallery' ? v : 'unknown'
}

export function inspectionPathFor(userId: string, jobId: string, mime: string, fileId: string): string {
  return `${userId}/${jobId}/${fileId}.${INSPECTION_MIME_EXT[mime]}`
}

export function isValidInspectionPath(path: unknown, userId: string, jobId: string): path is string {
  if (typeof path !== 'string' || path.length > 200) return false
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== userId || parts[1] !== jobId) return false
  return /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i.test(parts[2])
}

// Turns the database's plain error text into something safe to show.
export function friendlyInspectionError(message: string | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  const m = (message ?? '').trim()
  if (!m) return fallback
  if (/^(only an active inspector|this inspection|this file|this exact file|you already|too many files|invalid file|this request for more evidence|add at least|choose |give the reason|enter the name|capture your gps|a submitted file|file not found)/i.test(m)) return m
  return fallback
}
