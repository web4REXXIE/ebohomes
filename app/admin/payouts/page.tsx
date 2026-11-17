'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AdminPageHeader, EmptyState, ErrorState, LoadingState, StatusChip, type AdminState } from '@/components/admin-ui'
import { Pagination, SearchBox, usePaged } from '@/components/list-controls'
import { ADMIN_STATUS_LABEL, PROOF_ACCEPT, PROOF_BUCKET, validatePaid, validatePrepare, validateProofMeta, type PayoutStatus } from '@/lib/payout'

// Landlord payouts. EboHomes pays the landlord by bank transfer, outside the app, and records it here.
// Three steps: prepare (admin 1), approve (a second admin), then send the money and record it with proof.
// Every rule is enforced again by the API and the database. This page only collects the input.

type Filter = 'candidates' | 'progress' | 'done'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'progress', label: 'In progress' },
  { key: 'candidates', label: 'Ready to prepare' },
  { key: 'done', label: 'Completed' },
]

const naira = (n: number | string | null) => (n == null ? 'n/a' : '\u20A6' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 }))
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
// One fixed state per payout status. The chip always shows the status as text with an icon.
const STATE: Record<PayoutStatus, AdminState> = {
  pending: 'pending', approved: 'info', paid: 'pending', confirmed: 'success', disputed: 'danger', cancelled: 'neutral',
}

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j, status: res.status }
}

export default function AdminPayouts() {
  const [filter, setFilter] = useState<Filter>('progress')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const r = await api(`/api/admin/payouts?filter=${filter}`)
    if (!r.ok) { setErr(r.j?.error ?? `Could not load the list (HTTP ${r.status}).`); setItems([]); return }
    setItems(r.j.items ?? [])
  }, [filter])
  useEffect(() => { load() }, [load])

  // Search only narrows what is shown. The full list is still loaded.
  const needle = q.trim().toLowerCase()
  const shown = (items ?? []).filter((x) => !needle || String(x.landlord_name ?? '').toLowerCase().includes(needle))
  const paged = usePaged(shown, 25)
  const candidates = filter === 'candidates'

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <AdminPageHeader title="Landlord payouts" description="Money collected for a landlord is sent to their approved bank account. EboHomes records each transfer here." />
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Payout stage">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null); setQ(''); paged.setPage(1) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      <SearchBox id="payout-search" label="Search payouts" value={q} onChange={(v) => { setQ(v); paged.setPage(1) }} placeholder="Search by landlord name" />
      {err && <ErrorState message={err} onRetry={load} />}
      {items === null ? <LoadingState label="Loading..." />
        : items.length === 0 ? (err ? null : <EmptyState title="Nothing here" text={candidates ? 'No verified payments are waiting for a payout.' : 'No payouts at this stage.'} />)
        : shown.length === 0 ? <EmptyState title="No matches" text="No payout matches your search." />
        : <ul className="space-y-2">{paged.slice.map((x) => {
          const id: string = candidates ? x.payment_id : x.id
          return (
            <li key={id} className="rounded-xl border border-border bg-card">
              <button className="focus-ring flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => setOpenId(openId === id ? null : id)} aria-expanded={openId === id}>
                <span><b>{x.landlord_name}</b> · {x.tenancy_code ?? 'no tenancy'} · {candidates ? x.type : x.payment_type} · {naira(x.amount)}</span>
                {candidates
                  ? (x.hold_reason ? <StatusChip state="info">On hold</StatusChip>
                    : !x.has_account ? <StatusChip state="danger">No payout account</StatusChip>
                    : <StatusChip state="success">Ready</StatusChip>)
                  : <StatusChip state={STATE[x.status as PayoutStatus] ?? 'neutral'}>{ADMIN_STATUS_LABEL[x.status as PayoutStatus] ?? x.status}</StatusChip>}
              </button>
              {openId === id && (candidates
                ? <PrepareForm c={x} onChanged={() => { setOpenId(null); load() }} />
                : <PayoutDetail p={x} onChanged={() => { setOpenId(null); load() }} />)}
            </li>)
        })}</ul>}
      <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={(n) => { setOpenId(null); paged.setPage(n) }} noun="payouts" />
    </div>
  )
}

// Step 1: prepare a payout for one verified payment.
function PrepareForm({ c, onChanged }: { c: any; onChanged: () => void }) {
  const [key] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState(String(c.amount ?? ''))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const blocked = c.hold_reason ? `On hold: ${c.hold_reason}` : !c.has_account ? 'The landlord has no approved payout account yet.' : null

  const prepare = async () => {
    if (busy) return
    const v = validatePrepare({ amount, note, key }, Number(c.amount))
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify({ action: 'prepare', payment_id: c.payment_id, amount, note, key }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    onChanged()
  }

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Landlord</dt><dd>{c.landlord_name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tenant</dt><dd>{c.tenant_name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Verified payment</dt><dd>{naira(c.amount)} · {c.type} · confirmed {when(c.confirmed_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Payout allowed from</dt><dd>{when(c.payout_eligible_at)}</dd></div>
      </dl>
      {blocked
        ? <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-warning"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {blocked}</p>
        : (<>
          <div><label className="text-xs font-semibold" htmlFor={`amt-${c.payment_id}`}>Payout amount (&#8358;)</label>
            <input id={`amt-${c.payment_id}`} className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="text-xs font-semibold" htmlFor={`note-${c.payment_id}`}>Note (required if the amount differs from the payment)</label>
            <textarea id={`note-${c.payment_id}`} rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button disabled={busy} onClick={prepare} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Prepare payout
          </button>
          <p className="text-xs text-muted-foreground">A different administrator must approve it before any money is sent.</p>
        </>)}
      {msg && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-danger">{msg}</p>}
    </div>
  )
}

// Steps 2 and 3: approve (or cancel), then record the transfer with proof.
function PayoutDetail({ p, onChanged }: { p: any; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<null | 'approve' | 'cancel'>(null)
  const [ref, setRef] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [amountSent, setAmountSent] = useState('')
  const [sent, setSent] = useState(false)

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return false }
    return true
  }

  const approve = async () => {
    if (busy) return
    if (await send({ action: 'approve', id: p.id, note })) onChanged()
  }
  const cancel = async () => {
    if (busy) return
    if (note.trim().length < 5) { setMsg('Write a reason for cancelling.'); return }
    if (await send({ action: 'cancel', id: p.id, note })) onChanged()
  }

  const markPaid = async () => {
    if (busy) return
    setMsg(null)
    const attest = { transferred_to_shown_account: sent, amount_sent: amountSent }
    // Check the typed fields before anything is uploaded. The real proof path is checked again below.
    const pre = validatePaid({ reference: ref, proof_path: `payouts/${p.id}/pending`, attest }, p.id, Number(p.amount))
    if (!pre.ok) { setMsg(pre.error); return }
    if (!file) { setMsg('Upload the proof of transfer first.'); return }
    const bad = validateProofMeta(file.type, file.size)
    if (bad) { setMsg(bad); return }

    setBusy(true)
    const slot = await api('/api/admin/payouts/proof', { method: 'POST', body: JSON.stringify({ id: p.id, mime: file.type, bytes: file.size }) })
    if (!slot.ok) { setBusy(false); setMsg(slot.j?.error ?? 'Could not prepare the upload.'); return }
    const up = await supabase.storage.from(PROOF_BUCKET).uploadToSignedUrl(slot.j.path, slot.j.token, file, { contentType: file.type })
    if (up.error) { setBusy(false); setMsg('The proof could not be uploaded. Nothing was recorded.'); return }
    const final = validatePaid({ reference: ref, proof_path: slot.j.path, attest }, p.id, Number(p.amount))
    if (!final.ok) { setBusy(false); setMsg(final.error); return }

    const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify({ action: 'paid', id: p.id, reference: ref, proof_path: slot.j.path, attest }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    onChanged()
  }

  const open = p.status === 'pending' || p.status === 'approved'

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Landlord</dt><dd>{p.landlord_name} · {p.landlord_phone ?? 'no phone'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tenancy · payout code</dt><dd>{p.tenancy_code ?? 'n/a'} · {p.payout_code}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Payout · payment</dt><dd><b>{naira(p.amount)}</b> of {naira(p.payment_amount)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Prepared by</dt><dd>{p.prepared_by_name ?? 'n/a'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Send to this account</dt>
          <dd><b>{p.account_name}</b> · {p.bank_name} · {p.account_number}</dd></div>
      </dl>
      {open && p.account_is_current === false && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-warning"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> This is not the landlord&apos;s current payout account. Check with the landlord before sending anything.</p>)}
      {p.prepare_note && <p className="rounded-md bg-secondary p-2 text-xs">Preparer note: {p.prepare_note}</p>}
      {p.status !== 'pending' && p.status !== 'approved' && p.status !== 'cancelled' && (
        <p className="rounded-md bg-secondary p-2 text-xs">Paid {when(p.paid_at)} · bank reference {p.bank_reference ?? 'n/a'}{p.has_proof ? ' · proof of transfer on file' : ''}</p>)}
      {p.landlord_note && <p className="rounded-md bg-secondary p-2 text-xs">Landlord note: {p.landlord_note}</p>}

      <div>
        <h3 className="mb-1 font-bold">History</h3>
        <ul className="space-y-1 text-xs">
          {(p.events ?? []).map((e: any, i: number) => <li key={i} className="rounded-md border border-border p-2"><b>{String(e.event).replace(/_/g, ' ')}</b> · {e.by ?? 'Staff'} · {when(e.at)}{e.note ? ` · "${e.note}"` : ''}</li>)}
        </ul>
      </div>

      {open && !mode && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {p.status === 'pending' && <button onClick={() => { setMode('approve'); setNote(''); setMsg(null) }} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Approve</button>}
          <button onClick={() => { setMode('cancel'); setNote(''); setMsg(null) }} className="min-h-12 flex-1 rounded-lg border border-danger/40 font-semibold text-danger">Cancel payout</button>
        </div>)}

      {open && mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <label className="text-xs font-semibold" htmlFor={`pn-${p.id}`}>{mode === 'cancel' ? 'Reason for cancelling (required)' : 'Note (optional)'}</label>
          <textarea id={`pn-${p.id}`} rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={mode === 'approve' ? approve : cancel} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Confirm</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Back</button>
          </div>
        </div>)}

      {p.status === 'approved' && !mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="font-bold">Record the transfer</p>
          <p className="text-xs text-muted-foreground">Send the money from the EboHomes bank account first. Then record it here with the bank&apos;s proof.</p>
          <div><label className="text-xs font-semibold" htmlFor={`ref-${p.id}`}>Transfer reference from the bank</label>
            <input id={`ref-${p.id}`} className={field} autoCapitalize="none" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <div><label className="text-xs font-semibold" htmlFor={`sent-${p.id}`}>Amount sent (&#8358;)</label>
            <input id={`sent-${p.id}`} className={field} inputMode="decimal" value={amountSent} onChange={(e) => setAmountSent(e.target.value)} /></div>
          <div><label className="text-xs font-semibold" htmlFor={`proof-${p.id}`}>Proof of transfer (JPG, PNG, WEBP or PDF, up to 8MB)</label>
            <input id={`proof-${p.id}`} type="file" accept={PROOF_ACCEPT} className={field} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <label className="flex items-start gap-2"><input type="checkbox" className="focus-ring mt-1 size-5" checked={sent} onChange={(e) => setSent(e.target.checked)} /> I sent the money to the account shown above.</label>
          <button disabled={busy} onClick={markPaid} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Record as paid</button>
        </div>)}
      {msg && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-danger">{msg}</p>}
    </div>
  )
          }
