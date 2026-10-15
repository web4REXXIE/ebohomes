// One place that controls the EboHomes watermark on every property photo.
const WATERMARK_ID = '08a8295fc8d0881a1bd9363cf2d084e74203f2b4caa16aa58c741735c4031664_1_brejyt'

// Logo width as a share of the photo width (0.6 = 60%)
const WATERMARK_SIZE = 0.6
// Opacity from 1 to 100. Lower = more see-through
const WATERMARK_OPACITY = 40

// Only two sizes are ever requested, so each photo is built at most twice.
function bucket(width: number) {
  return width <= 800 ? 800 : 1600
}

export function watermarkedUrl(url: string, width: number) {
  if (!url || !url.includes('/upload/')) return url
  const base = `f_auto,q_auto,w_${bucket(width)}`
  const mark = WATERMARK_ID
    ? `/l_${WATERMARK_ID},fl_relative,w_${WATERMARK_SIZE},o_${WATERMARK_OPACITY}/fl_layer_apply,g_center`
    : ''
  return url.replace('/upload/', `/upload/${base}${mark}/`)
}

// Small images with no watermark (thumbnails)
export function plainUrl(url: string, width: number) {
  if (!url || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}