import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { paystackConfig, signatureValid } from '@/lib/paystack'
import { settleReference } from '@/lib/paystack-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// Paystack calls this with POST and the header x-paystack-signature (HMAC-SHA512 of the raw body).
// The body is never trusted for the outcome: settleReference asks Paystack's verify API and compares reference, amount and currency.
// 200 = handled or safe to ignore. 500 = please retry (Paystack could not be reached, or the database failed).
export async function POST(req: Request) {
  const cfg = paystackConfig(process.env)
  if (!cfg.ok) return json({ error: 'Online payments are not switched on.' }, 503)

  const raw = await req.text()
  if (!signatureValid(raw, req.headers.get('x-paystack-signature'), cfg.secret)) return json({ error: 'Invalid signature.' }, 401)

  let evt: any
  try { evt = JSON.parse(raw) } catch { return json({ error: 'Invalid body.' }, 400) }

  const event = typeof evt?.event === 'string' ? evt.event : ''
  const reference = typeof evt?.data?.reference === 'string' ? evt.data.reference : ''
  if (!event.startsWith('charge.') || !reference) return json({ ok: true, ignored: true })

  try {
    const r = await settleReference(getSupabaseAdmin(), cfg.secret, reference)
    if (!r.found) return json({ ok: true, ignored: true })
    if (r.providerError) return json({ error: 'Try again later.' }, 500)
    return json({ ok: true, status: r.status })
  } catch {
    return json({ error: 'Try again later.' }, 500)
  }
}
