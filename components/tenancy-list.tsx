'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Props = { role: 'tenant' | 'landlord' }

function daysLeft(end: string | null): number | null {
  if (!end) return null
  const ms = new Date(end).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

export function TenancyList({ role }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [payments, setPayments] = useState<Record<string, any[]>>({})
  const [renewals, setRenewals] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [offerFor, setOfferFor] = useState<string | null>(null)
  const [newRent, setNewRent] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [terms, setTerms] = useState('')
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    const { data } = await supabase.rpc('my_tenancies', { p_as: role })
    const list = data ?? []
    setRows(list)
    if (list.length > 0) {
      const ids = list.map((t: any) => t.id)
      const { data: pay } = await supabase
        .from('payments')
        .select('id, tenancy_id, amount, type, status, receipt_code, created_at, confirmed_at')
        .in('tenancy_id', ids)
        .order('created_at', { ascending: false })
      const pm: Record<string, any[]> = {}
      pay?.forEach((p: any) => {
        if (!pm[p.tenancy_id]) pm[p.tenancy_id] = []
        pm[p.tenancy_id].push(p)
      })
      setPayments(pm)
      const { data: ren } = await supabase
        .from('renewals')
        .select('*')
        .in('tenancy_id', ids)
        .order('created_at', { ascending: false })
      const rm: Record<string, any[]> = {}
      ren?.forEach((r: any) => {
        if (!rm[r.tenancy_id]) rm[r.tenancy_id] = []
        rm[r.tenancy_id].push(r)
      })
      setRenewals(rm)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    setMsg('')
    const { error } = await supabase.from('renewals').update({ status }).eq('id', id)
    if (error) setMsg(error.message)
    load()
  }

  const offer = async (t: any) => {
    setMsg('')
    if (!newRent) {
      setMsg('Enter the new rent.')
      return
    }
    if (!newEnd) {
      setMsg('Enter the new end date.')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('renewals').insert({
      tenancy_id: t.id,
      landlord_id: user.id,
      tenant_id: user.id,
      new_rent: Number(newRent),
      new_end_date: newEnd,
      terms: terms ? terms : null,
    })
    if (error) {
      setMsg(error.message)
      return
    }
    setOfferFor(null)
    setNewRent('')
    setNewEnd('')
    setTerms('')
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={26} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">
        {role === 'tenant' ? 'My Tenancies' : 'Tenancies'}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Rent, dates, receipts and renewals. Nothing is charged automatically.
      </p>
      {msg && <p className="text-sm text-destructive mb-4">{msg}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenancies yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((t) => {
            const d = daysLeft(t.end_date)
            const offers = renewals[t.id] ?? []
            const open = offers.find((o) => o.status === 'offered')
            return (
              <div key={t.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{t.title ?? 'Property'}</p>
                    <p className="text-xs text-muted-foreground">{t.location_text ?? ''}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.tenancy_code ?? ''}</p>
                  </div>
                  <span className="text-xs border border-border rounded-full px-2 py-1 capitalize">{t.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                  <p><span className="text-muted-foreground block text-xs">Rent</span>₦{Number(t.rent_amount).toLocaleString()} / {t.rent_period}</p>
                  <p><span className="text-muted-foreground block text-xs">{role === 'tenant' ? 'Landlord' : 'Tenant'}</span>{t.other_party ?? '—'}</p>
                  <p><span className="text-muted-foreground block text-xs">Starts</span>{t.start_date ?? '—'}</p>
                  <p><span className="text-muted-foreground block text-xs">Ends</span>{t.end_date ?? '—'}</p>
                </div>

                {t.status === 'active' && d !== null && d <= 30 && d >= 0 && (
                  <p className="mt-3 text-sm rounded-md bg-secondary px-3 py-2">
                    {d <= 14 ? 'Renewal reminder: ' : 'Your tenancy is approaching renewal: '}
                    {d} day(s) left.
                  </p>
                )}

                {open && role === 'tenant' && (
                  <div className="mt-3 border border-border rounded-md p-3 text-sm">
                    <p className="font-medium">Renewal offer</p>
                    <p>New rent ₦{Number(open.new_rent).toLocaleString()}, until {open.new_end_date}</p>
                    {open.terms && <p className="text-muted-foreground">{open.terms}</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => respond(open.id, 'accepted')} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">Accept</button>
                      <button onClick={() => respond(open.id, 'declined')} className="px-3 py-1.5 rounded-md border border-border text-sm">Decline</button>
                    </div>
                  </div>
                )}
                {open && role === 'landlord' && (
                  <p className="mt-3 text-sm text-muted-foreground">Renewal offer sent. Waiting for the tenant.</p>
                )}
                {!open && offers[0] && (
                  <p className="mt-3 text-sm text-muted-foreground capitalize">Last renewal offer: {offers[0].status}</p>
                )}

                {role === 'landlord' && t.status === 'active' && !open && (
                  offerFor === t.id ? (
                    <div className="mt-3 space-y-2">
                      <input type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} placeholder="New rent (₦)" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm" />
                      <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm" />
                      <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} placeholder="Terms (optional)" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm" />
                      <div className="flex gap-2">
                        <button onClick={() => offer(t)} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">Send offer</button>
                        <button onClick={() => setOfferFor(null)} className="px-3 py-1.5 rounded-md border border-border text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setOfferFor(t.id)} className="mt-3 text-sm text-primary font-medium">Offer renewal</button>
                  )
                )}

                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Receipts</p>
                  {(payments[t.id] ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {(payments[t.id] ?? []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span>₦{Number(p.amount).toLocaleString()} <span className="text-muted-foreground capitalize">{p.type} · {p.status}</span></span>
                          {p.receipt_code && (
                            <Link href={`/receipt/${p.receipt_code}`} className="inline-flex items-center gap-1 text-primary">
                              <Receipt size={14} /> {p.receipt_code}
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}