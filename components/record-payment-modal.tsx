'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Props = {
  tenancy: { id: string; listing_id: string; tenant_id: string; rent_amount: number }
  landlordId: string
  onClose: () => void
  onCreated: (payment: any) => void
}

export function RecordPaymentModal({ tenancy, landlordId, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState(tenancy.rent_amount?.toString() ?? '')
  const [type, setType] = useState<'rent' | 'deposit' | 'fee' | 'other'>('rent')
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | 'card'>('bank_transfer')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!amount) {
      setError('Amount is required.')
      return
    }
    setSaving(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('payments')
      .insert({
        tenancy_id: tenancy.id,
        listing_id: tenancy.listing_id,
        user_id: tenancy.tenant_id,
        type,
        amount: Number(amount),
        payment_method: paymentMethod,
        source: 'manual',
        recorded_by: landlordId,
        confirmed_at: new Date().toISOString(),
        status: 'confirmed',
        reference: reference || null,
      })
      .select()
      .single()

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    onCreated(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Record Payment</h3>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount (₦)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment For</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="rent">Rent</option>
              <option value="deposit">Deposit</option>
              <option value="fee">Fee</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Reference (optional)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. transfer ID"
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive mt-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-sm rounded-md py-2 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Record Payment
        </button>
      </div>
    </div>
  )
}