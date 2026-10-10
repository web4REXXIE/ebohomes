import { supabase } from '@/lib/supabase'

export const OWNERSHIP_BUCKET = 'ownership-docs'
export const OWNERSHIP_MAX_BYTES = 10 * 1024 * 1024
export const OWNERSHIP_SIGNED_URL_SECONDS = 60 * 5
export const OWNERSHIP_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'application/pdf': 'pdf',
}
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf']

function extensionOf(name: string) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

export function validateOwnershipFile(file: File): string | null {
  if (!MIME_TO_EXT[file.type]) return 'Invalid file type. Please upload a JPG, PNG, WEBP or PDF.'
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) return 'Invalid file extension.'
  if (file.size <= 0) return 'The selected file is empty.'
  if (file.size > OWNERSHIP_MAX_BYTES) return 'File is too large. Maximum size is 10MB.'
  return null
}

export function sanitizeFileName(file: File): string {
  const ext = MIME_TO_EXT[file.type] ?? 'bin'
  const dot = file.name.lastIndexOf('.')
  const base = (dot === -1 ? file.name : file.name.slice(0, dot))
    .normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '').slice(0, 50)
  return `${base || 'document'}.${ext}`
}

export function buildOwnershipPath(userId: string, prefix: string, file: File) {
  return `${userId}/${prefix}-${Date.now()}-${sanitizeFileName(file)}`
}

export function isValidOwnershipPath(path: unknown, ownerId: string | null | undefined): path is string {
  if (typeof path !== 'string' || !ownerId || path.length > 300) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false
  if (path.startsWith('/') || path.includes('\\') || path.includes('..') || path.includes('//')) return false
  const parts = path.split('/')
  if (parts.length !== 2 || parts[0] !== ownerId) return false
  return /^[A-Za-z0-9._-]+$/.test(parts[1])
}

export async function getOwnershipSignedUrl(path: unknown, ownerId: string | null | undefined) {
  if (!isValidOwnershipPath(path, ownerId)) return null
  const { data, error } = await supabase.storage
    .from(OWNERSHIP_BUCKET)
    .createSignedUrl(path, OWNERSHIP_SIGNED_URL_SECONDS)
  return error || !data?.signedUrl ? null : data.signedUrl
}