// Small pure helpers shared by the viewing, agreement, maintenance, dispute and settlement screens.

export function label(s: string | null | undefined): string {
  return (s ?? '').replace(/_/g, ' ')
}

// "2026-10-20T14:30" (datetime-local) -> ISO string, or null when empty/invalid.
export function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function naira(n: number | string | null | undefined): string {
  const v = Number(n)
  return Number.isFinite(v) ? `₦${v.toLocaleString()}` : '—'
}

// Refund shown to the user before the database computes it. The database is the source of truth.
export function refundPreview(deposit: number, deductions: number): number | null {
  if (!Number.isFinite(deposit) || !Number.isFinite(deductions)) return null
  if (deposit < 0 || deductions < 0 || deductions > deposit) return null
  return deposit - deductions
}

// Where a notification about a tenancy should send each role.
export function tenancyPath(role: 'tenant' | 'landlord', id: string): string {
  return role === 'tenant' ? `/tenancies/${id}` : `/dashboard/tenancies/${id}`
}