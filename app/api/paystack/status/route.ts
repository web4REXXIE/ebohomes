import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { amountForPurpose, PURPOSES, PURPOSE_LABEL, paystackConfig } from '@/lib/paystack'
import { settleReference } from '@/lib/paystack-server'
import { settledByPayments } from '@/lib/payment-complete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/paystack/status                      -> { enabled }                      (no sign-in needed)
// GET /api/paystack/status?tenancy_id=...       -> { enabled, options[] }           (what can be paid online)
// GET /api/paystack/status?reference=...        -> { enabled, status }              (asks Paystack, never trusts the redirect)
export async function GET(req: Request) {
  const cfg = paystackConfig(process.env)
  if (!cfg.ok) return NextResponse.json({ enabled: false })

  const url = new URL(req.url)
  const reference = url.searchParams.get('reference')
  const tenancyId = url.searchParams.get('tenancy_id')
  if (!reference && !tenancyId) return NextResponse.json({ enabled: true })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = getSupabaseAdmin()
  const { data: auth } = await db.auth.getUser(token)
  const user = auth?.user
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  if (reference) {
    const { data: row } = await db.from('paystack_transactions').select('user_id').eq('reference', reference).maybeSingle()
    if (!row || row.user_id !== user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    const r = await settleReference(db, cfg.secret, reference)
    if (r.providerError) return NextResponse.json({ enabled: true, status: 'checking' })
    return NextResponse.json({ enabled: true, status: r.status })
  }

  const { data: tenancy } = await db.from('tenancies').select('id, tenant_id').eq('id', tenancyId!).maybeSingle()
  if (!tenancy || tenancy.tenant_id !== user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const { data: terms } = await db.from('rental_terms')
    .select('rent_amount, deposit_amount, fees_amount').eq('tenancy_id', tenancyId!).eq('status', 'signed').maybeSingle()
  if (!terms) return NextResponse.json({ enabled: true, options: [] })
  const { data: paid } = await db.from('paystack_transactions').select('purpose')
    .eq('tenancy_id', tenancyId!).eq('status', 'paid')
  const paidPurposes = new Set((paid ?? []).map((p: any) => p.purpose))
  // A deposit or fee counts as done when an online payment was confirmed OR a payment record / bank proof already covers it.
  const { data: payRows } = await db.from('payments').select('id, amount, type, status, verified_by, created_at').eq('tenancy_id', tenancyId!)
  const { data: proofRows } = await db.from('payment_submissions').select('payment_type, amount_paid, status').eq('tenancy_id', tenancyId!)
  const agreedFor = (p: string) => (p === 'rent' ? terms.rent_amount : p === 'deposit' ? terms.deposit_amount : terms.fees_amount)
  const options = PURPOSES.map((purpose) => ({
    purpose, label: PURPOSE_LABEL[purpose], amount_kobo: amountForPurpose(terms, purpose),
    paid: purpose !== 'rent' && (paidPurposes.has(purpose) || settledByPayments(payRows ?? [], purpose, agreedFor(purpose), proofRows ?? [])),
  })).filter((o) => o.amount_kobo)
  return NextResponse.json({ enabled: true, options })
}