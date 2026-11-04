// The single source of truth for EboHomes contact details.
// Use these constants everywhere. Never type the number or the email address into a page.

// WhatsApp number: digits only, including the country code; no "+" or spaces.
export const EBOHOMES_WHATSAPP = '2349169069445'

// Same number, written for people to read: +234 916 906 9445
export const EBOHOMES_PHONE_DISPLAY = `+${EBOHOMES_WHATSAPP.slice(0, 3)} ${EBOHOMES_WHATSAPP.slice(3, 6)} ${EBOHOMES_WHATSAPP.slice(6, 9)} ${EBOHOMES_WHATSAPP.slice(9)}`

// Public contact email.
// To switch to a professional EboHomes domain address, set NEXT_PUBLIC_EBOHOMES_EMAIL in Vercel and redeploy.
// Only do that AFTER you have sent a test email to the new address and received it, and replied from it.
// If the variable is missing or is not a valid address, the current working address below is used.
const CURRENT_WORKING_EMAIL = 'EboHomesng@gmail.com'
const configured = (process.env.NEXT_PUBLIC_EBOHOMES_EMAIL ?? '').trim()
export const EBOHOMES_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured) ? configured : CURRENT_WORKING_EMAIL
