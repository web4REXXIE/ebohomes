// One place for sizing Cloudinary photos. Replaces four copies of the same helper
// (listing card, search page, search map, homepage).
//
// Rules that keep existing behaviour safe:
//  - Only Cloudinary "/upload/" URLs are changed. Every other URL is returned untouched.
//  - A URL that already carries f_auto is not changed a second time.
//  - A signed Cloudinary URL ("/upload/s--signature--/") is never changed, because adding a
//    transformation in front of the signature would invalidate it.

export const PLACEHOLDER_PHOTO = '/placeholder.jpg'

export function sizedPhoto(url: string | null | undefined, width: number): string {
  if (!url) return ''
  if (!url.includes('/upload/')) return url
  if (url.includes('/upload/f_auto') || url.includes('/upload/s--')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}

// A srcSet for Cloudinary photos so phones download the small file, not the desktop one.
// Returns undefined for any other URL, so the plain src is used.
export function photoSrcSet(url: string | null | undefined, widths: number[]): string | undefined {
  if (!url || !url.includes('/upload/')) return undefined
  if (url.includes('/upload/f_auto') || url.includes('/upload/s--')) return undefined
  return widths.map((w) => `${sizedPhoto(url, w)} ${w}w`).join(', ')
}
