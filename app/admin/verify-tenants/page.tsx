'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getOwnershipSignedUrl } from '@/lib/ownership-docs'
import { tenantVerificationState, TENANT_ID_LABELS, type TenantVerificationState } from '@/lib/tenant-verification'

type Tenant = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  id_document_type: string | null
  id_document_url: string | null
  selfie_url: string | null
  verification_status: string | null
  verified: boolean | null
  rejection_reason: string | null
  created_at: string | null
}

type Tab = 'submitted' | 'verified' | 'rejected'
const TABS: { key: Tab; label: string }[] = [
  { key: 'submitted', label: 'Waiting' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
]

const isPdf = (p: string | null) => !!p && p.toLowerCase().endsWith('.pdf')

export default function AdminVerifyTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('submitted')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [idUrl, setIdUrl] = useState('')
  const [selfieUrl, setSelfieUrl] = useState('')
  const [confirming, setConfirming] = useState<'verify' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email, id_document_type, id_document_url, selfie_url, verification_status, verified, rejection_reason, created_at')
      .eq('role', 'tenant')
      .not('id_document_url', 'is', null)
      .not('selfie_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) setLoadError('Could not load tenants: ' + error.message)
    setTenants((data as Tenant[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const stateOf = (t: Tenant): TenantVerificationState => tenantVerificationState(t)
  const inTab = tenants.filter((t) => stateOf(t) === tab)
  const counts: Record<Tab, number> = {
    submitted: tenants.filter((t) => stateOf(t) === 'submitted').length,
    verified: tenants.filter((t) => stateOf(t) === 'verified').length,
    rejected: tenants.filter((t) => stateOf(t) === 'rejected').length,
  }
  const selected = tenants.find((t) => t.id === selectedId) ?? null

  // Load the private photos for the selected tenant (short-lived signed links).
  useEffect(() => {
    setIdUrl('')
    setSelfieUrl('')
    setConfirming(null)
    setReason('')
    setActionError('')
    if (!selected) return
    let alive = true
    ;(async () => {
      const a = await getOwnershipSignedUrl(selected.id_document_url, selected.id)
      const b = await getOwnershipSignedUrl(selected.selfie_url, selected.id)
      if (!alive) return
      setIdUrl(a ?? '')
      setSelfieUrl(b ?? '')
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const decide = async (decision: 'verify' | 'reject') => {
    if (!selected) return
    if (decision === 'reject' && !reason.trim()) {
      setActionError('Write the reason the tenant will see.')
      return
    }
    setBusy(true)
    setActionError('')
    const { error } = await supabase.rpc('admin_decide_tenant_verification', {
      p_tenant: selected.id,
      p_decision: decision,
      p_reason: decision === 'reject' ? reason.trim() : null,
    })
    setBusy(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setConfirming(null)
    setReason('')
    setSelectedId(null)
    await load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Verify tenants</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Check that the ID and selfie match the name on the account. Your decision is recorded and the tenant is notified.
      </p>

      <div role="tablist" aria-label="Tenant verification status" className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            type="button"
            onClick={() => {
              setTab(t.key)
              setSelectedId(null)
            }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${
              tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading tenants...
        </div>
      )}
      {loadError && <p role="alert" className="mb-4 text-sm font-medium text-destructive">{loadError}</p>}

      {!loading && !loadError && inTab.length === 0 && (
        <p className="rounded-card border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No tenants in this list.
        </p>
      )}

      <ul className="space-y-2">
        {inTab.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
              aria-expanded={t.id === selectedId}
              className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left ${
                t.id === selectedId ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">{t.full_name ?? 'No name on file'}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.email ?? t.phone ?? 'No contact on file'}</span>
              </span>
              {stateOf(t) === 'submitted' && <Clock size={18} className="shrink-0 text-warning" aria-label="Waiting" />}
              {stateOf(t) === 'verified' && <ShieldCheck size={18} className="shrink-0 text-success" aria-label="Verified" />}
              {stateOf(t) === 'rejected' && <XCircle size={18} className="shrink-0 text-destructive" aria-label="Rejected" />}
            </button>

            {t.id === selectedId && selected && (
              <div className="mt-2 space-y-4 rounded-card border border-border bg-card p-4">
                <dl className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Name on account</dt>
                    <dd className="font-semibold text-foreground">{selected.full_name ?? 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd className="font-semibold text-foreground">{selected.phone ?? 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">ID type</dt>
                    <dd className="font-semibold text-foreground">
                      {TENANT_ID_LABELS[selected.id_document_type ?? ''] ?? 'Not provided'}
                    </dd>
                  </div>
                  {selected.rejection_reason && stateOf(selected) === 'rejected' && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Rejection reason</dt>
                      <dd className="font-semibold text-foreground">{selected.rejection_reason}</dd>
                    </div>
                  )}
                </dl>

                <div className="grid gap-3 min-[520px]:grid-cols-2">
                  {[
                    { label: 'Government ID', url: idUrl, path: selected.id_document_url },
                    { label: 'Selfie holding ID', url: selfieUrl, path: selected.selfie_url },
                  ].map((f) => (
                    <div key={f.label}>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{f.label}</p>
                      {!f.url ? (
                        <p className="text-sm text-muted-foreground">Loading photo...</p>
                      ) : isPdf(f.path) ? (
                        <a href={f.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline">
                          Open PDF
                        </a>
                      ) : (
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.label} className="max-h-72 w-full rounded-lg border border-border object-contain" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {stateOf(selected) === 'submitted' && (
                  <div className="space-y-3 border-t border-border pt-4">
                    {actionError && <p role="alert" className="text-sm font-medium text-destructive">{actionError}</p>}

                    {confirming === null && (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setConfirming('reject')}
                          className="min-h-12 flex-1 rounded-lg border border-destructive/40 text-sm font-semibold text-destructive"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming('verify')}
                          className="min-h-12 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                        >
                          Verify
                        </button>
                      </div>
                    )}

                    {confirming === 'verify' && (
                      <div className="space-y-3 rounded-lg border border-border bg-secondary p-3">
                        <p className="text-sm text-foreground">
                          Confirm: the ID and selfie match <span className="font-semibold">{selected.full_name ?? 'this tenant'}</span>. The tenant will be marked verified and notified.
                        </p>
                        <div className="flex gap-3">
                          <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="min-h-12 flex-1 rounded-lg border border-border bg-background text-sm font-semibold">
                            Cancel
                          </button>
                          <button type="button" onClick={() => decide('verify')} disabled={busy} className="min-h-12 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
                            {busy ? 'Saving...' : 'Confirm verify'}
                          </button>
                        </div>
                      </div>
                    )}

                    {confirming === 'reject' && (
                      <div className="space-y-3 rounded-lg border border-border bg-secondary p-3">
                        <label htmlFor="reject-reason" className="block text-sm font-semibold text-foreground">
                          Reason the tenant will see *
                        </label>
                        <textarea
                          id="reject-reason"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          placeholder="e.g. The ID photo is blurry. Please send a clear photo."
                          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm"
                        />
                        <div className="flex gap-3">
                          <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="min-h-12 flex-1 rounded-lg border border-border bg-background text-sm font-semibold">
                            Cancel
                          </button>
                          <button type="button" onClick={() => decide('reject')} disabled={busy} className="min-h-12 flex-1 rounded-lg bg-destructive text-sm font-semibold text-white disabled:opacity-50">
                            {busy ? 'Saving...' : 'Confirm reject'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
                          }
