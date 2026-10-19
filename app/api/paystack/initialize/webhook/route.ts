import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { paystackConfig, signatureValid } from '@/lib/paystack'
import { settleReference } from '@/lib/paystack-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Paystack calls this. The signature is checked on the RAW body. The body is then only a hint about WHICH reference to
// look at: the outcome always comes from asking Paystack's verify API (see settleReference). Safe to receive twice.
export async function POST(req: Request) {
  const cfg = paystackConfig(process.env)
  if (!cfg.ok) return NextResponse.json({ ok: false }, { status: 503 })

  const raw = await req.text()
  if (!signatureValid(raw, req.headers.get('x-paystack-signature'), cfg.secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let event: any
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }
  if (event?.event !== 'charge.success') return NextResponse.json({ ok: true })
  const reference = typeof event?.data?.reference === 'string' ? event.data.reference : ''
  if (!reference) return NextResponse.json({ ok: true })

  const r = await settleReference(getSupabaseAdmin(), cfg.secret, reference)
  if (r.providerError) return NextResponse.json({ ok: false }, { status: 502 }) // Paystack retries
  return NextResponse.json({ ok: true })
}