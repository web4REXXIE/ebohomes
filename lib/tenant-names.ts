import { supabase } from '@/lib/supabase'

// Names (and nothing else) of tenants a landlord is allowed to see: people who applied to the landlord's
// properties and tenants with a tenancy. The database function eb_tenant_names decides who is allowed.
// Anyone else is simply missing from the result, so callers should show a neutral fallback such as "Applicant".
export async function fetchTenantNames(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 200)
  if (unique.length === 0) return {}
  const { data, error } = await supabase.rpc('eb_tenant_names', { p_ids: unique })
  if (error || !Array.isArray(data)) return {}
  return Object.fromEntries(
    (data as { id: string; full_name: string | null }[]).map((r) => [r.id, r.full_name ?? ''])
  )
}