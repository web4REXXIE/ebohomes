export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The old webhook address keeps working. The real handler lives at /api/paystack/webhook.
export { POST } from '../../webhook/route'
