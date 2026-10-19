import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { amountForPurpose, isPurpose, newReference, paystackConfig } from '@/lib/paystack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { tenancy_id, purpose: 'rent' | 'deposit' | 'fees' }  with  Authorization: Bearer <supabase access token>
// Returns { url } to send the tenant to Paystack's hosted payment page.
// OFF by default: returns 503 until PAYSTACK_ENABLED=true and a key is set. The amount is read from the SIGNED rental terms.
export async function POST(req: Request) {
  const cfg = paystackConfig(process.env)
  if (!cfg.ok) return NextResponse.json({ error: 'Online payments are not switched on yet.' }, { status: 503 })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const tenancyId = typeof body?.tenancy_id === 'string' ? body.tenancy_id : ''
  if (!tenancyId || !isPurpose(body?.purpose)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const purpose = body.purpose

  const db = getSupabaseAdmin()
  const { data: auth, error: authErr } = await db.auth.getUser(token)
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const user = auth.user
  if (!user.email) return NextResponse.json({ error: 'Your account has no email address.' }, { status: 400 })

  const { data: tenancy } = await db.from('tenancies').select('id, tenant_id').eq('id', tenancyId).maybeSingle()
  if (!tenancy || tenancy.tenant_id !== user.id) return NextResponse.json({ error: 'Tenancy not found.' }, { status: 404 })

  const { data: terms } = await db.from('rental_terms')
    .select('id, rent_amount, deposit_amount, fees_amount').eq('tenancy_id', tenancyId).eq('status', 'signed').maybeSingle()
  if (!terms) return NextResponse.json({ error: 'Online payment opens once the signed agreement is recorded.' }, { status: 409 })

  const amount = amountForPurpose(terms, purpose)
  if (!amount) return NextResponse.json({ error: 'There is nothing to pay for this item.' }, { status: 409 })

  if (purpose !== 'rent') {
    const { data: already } = await db.from('paystack_transactions').select('id')
      .eq('tenancy_id', tenancyId).eq('purpose', purpose).eq('status', 'paid').limit(1)
    if (already && already.length) return NextResponse.json({ error: 'This has already been paid online.' }, { status: 409 })
  }

  const reference = newReference()
  const { error: insErr } = await db.from('paystack_transactions').insert({
    reference, tenancy_id: tenancyId, terms_id: terms.id, user_id: user.id, purpose, amount_kobo: amount, currency: 'NGN',
  })
  if (insErr) return NextResponse.json({ error: 'Could not start the payment. Try again.' }, { status: 500 })

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email, amount, currency: 'NGN', reference,
      callback_url: site ? `${site}/tenancies/${tenancyId}` : undefined,
      metadata: { tenancy_id: tenancyId, purpose },
    }),
  })
  const json: any = await res.json().catch(() => null)
  if (!res.ok || !json?.status || !json?.data?.authorization_url) {
    await db.from('paystack_transactions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('reference', reference)
    return NextResponse.json({ error: 'The payment provider did not accept the request. Try again later.' }, { status: 502 })
  }
  return NextResponse.json({ url: json.data.authorization_url, reference })
}