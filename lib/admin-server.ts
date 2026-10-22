// SERVER ONLY. Admin authorization for API routes. Never import from a 'use client' file.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type AdminCtx = { db: SupabaseClient; userDb: SupabaseClient; user: User }

// 1) validates the bearer token, 2) asks the DATABASE (eb_is_admin, as that user) whether they are staff.
// userDb acts AS the admin, so database functions see auth.uid() = the admin. db is service-role: use it only for reads after this passes.
export async function authAdmin(req: Request): Promise<AdminCtx | { res: NextResponse }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const deny = (s: number) => ({ res: NextResponse.json({ error: s === 401 ? 'Sign in first.' : 'Not found.' }, { status: s }) })
  if (!token) return deny(401)
  const db = getSupabaseAdmin()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return deny(401)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return deny(404)
  const userDb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ok } = await userDb.rpc('eb_is_admin')
  if (ok !== true) return deny(404)
  return { db, userDb, user: data.user }
}