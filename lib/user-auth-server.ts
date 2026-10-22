// SERVER ONLY. Validates the caller's token and returns a client that acts AS that user (auth.uid() = the caller).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export async function authUser(req: Request): Promise<{ db: SupabaseClient; user: User } | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !anon) return null
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return { db, user: data.user }
}