export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same handler as /api/paystack/initialize/webhook, on a clean address.
// You can point Paystack at /api/paystack/webhook whenever you like. Both addresses stay valid.
export { POST } from '../initialize/webhook/route'
