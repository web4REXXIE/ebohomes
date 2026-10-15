// Fixes garbled characters (encoding bugs) and tidies spacing.
// Used when a landlord saves a listing description.
export function cleanDescription(text: string) {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/â‚¦/g, '₦')
    .replace(/â€™/g, '’')
    .replace(/â€˜/g, '‘')
    .replace(/â€œ|â€\u009d|â€/g, '"')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—')
    .replace(/â€¢/g, '•')
    .replace(/Â/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}