// SERVER ONLY. Used by /api/payment-submissions/*. Never import from a 'use client' file.
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { UUID_RE, type SubmissionType } from '@/lib/payment-submission'

export const fail = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status })

export async function authUser(req: Request): Promise<{ db: SupabaseClient; user: User } | { res: NextResponse }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { res: fail('Sign in first.', 401) }
  const db = getSupabaseAdmin()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return { res: fail('Sign in first.', 401) }
  return { db, user: data.user }
}

export type PayContext = { tenancyId: string; termsId: string; expected: number; renewalId: string | null }

// Everything about the tenancy comes from the database, never from the client.
// If renewalId is given, the amount due is the accepted renewal's new rent (rent only).
export async function loadPayContext(db: SupabaseClient, userId: string, tenancyId: unknown, type: SubmissionType, renewalId?: unknown):
  Promise<PayContext | { res: NextResponse }> {
  if (typeof tenancyId !== 'string' || !UUID_RE.test(tenancyId)) return { res: fail('Invalid request.', 400) }
  const { data: tenancy } = await db.from('tenancies').select('id, tenant_id, status').eq('id', tenancyId).maybeSingle()
  if (!tenancy || tenancy.tenant_id !== userId) return { res: fail('Tenancy not found.', 404) }
  if (tenancy.status !== 'active') return { res: fail('Payments can only be submitted on an active tenancy.', 409) }
  const { data: terms } = await db.from('rental_terms')
    .select('id, rent_amount, deposit_amount, fees_amount').eq('tenancy_id', tenancyId).eq('status', 'signed')
    .order('version', { ascending: false }).limit(1).maybeSingle()
  if (!terms) return { res: fail('Payment opens once your signed agreement is recorded.', 409) }
  let expected: number
  let renewal: string | null = null
  if (renewalId != null && renewalId !== '') {
    if (type !== 'rent') return { res: fail('A renewal is paid as rent.', 400) }
    if (typeof renewalId !== 'string' || !UUID_RE.test(renewalId)) return { res: fail('Invalid request.', 400) }
    const { data: ren } = await db.from('renewals').select('id, tenant_id, tenancy_id, status, new_rent').eq('id', renewalId).maybeSingle()
    if (!ren || ren.tenant_id !== userId || ren.tenancy_id !== tenancyId) return { res: fail('Renewal not found.', 404) }
    if (ren.status !== 'accepted') return { res: fail('This renewal is not waiting for payment.', 409) }
    expected = Number(ren.new_rent)
    renewal = ren.id
  } else {
    const col = type === 'rent' ? terms.rent_amount : type === 'deposit' ? terms.deposit_amount : terms.fees_amount
    expected = Number(col)
  }
  if (!Number.isFinite(expected) || expected <= 0) return { res: fail('Your signed agreement has no amount for this item.', 409) }
  return { tenancyId, termsId: terms.id, expected, renewalId: renewal }
}