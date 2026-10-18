'use client'

import { useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Props = {
  tenancy: { id: string; listing_id: string; tenant_id: string; rent_amount: number }
  // Kept so existing callers keep compiling. It is NOT sent to the database:
  // the database sets the recording user and the recorded status itself.
  landlordId?: string
  onClose: () => void
  onCreated: (payment: any) => void
}

const TYPES = ['rent', 'deposit', 'fee', 'other'] as const
const METHODS = ['bank_transfer', 'cash', 'card'] as const

export function RecordPaymentModal({ tenancy, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState(tenancy.rent_amount?.toString() ?? '')
  const [type, setType] = useState<(typeof TYPES)[number]>('rent')
  const [paymentMethod, setPaymentMethod] = useState<(typeof METHODS)[number]>('bank_transfer')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A ref blocks a second submit in the same tick, before React re-renders.
  const submitting = useRef(false)

  const handleSubmit = async () => {
    if (submitting.current) return

    const value = Number(amount)
    if (!amount.trim() || !Number.isFinite(value)) {
      setError('Enter the amount paid.')
      return
    }
    if (value <= 0) {
      setError('Amount must be greater than zero.')
      return
    }
    if (!TYPES.includes(type) || !METHODS.includes(paymentMethod)) {
      setError('Choose what the payment is for and how it was paid.')
      return
    }
    if (!tenancy?.id || !tenancy.listing_id || !tenancy.tenant_id) {
      setError('This tenancy is missing details. Refresh the page and try again.')
      return
    }

    submitting.current = true
    setSaving(true)
    setError(null)

    // Only the facts the landlord knows. The database decides status, who
    // recorded it, the source and the receipt code. A landlord-recorded payment
    // always starts as "recorded" and waits for EboHomes to verify it.
    const { data, error: insertError } = await supabase
      .from('payments')
      .insert({
        tenancy_id: tenancy.id,
        listing_id: tenancy.listing_id,
        user_id: tenancy.tenant_id,
        type,
        amount: value,
        payment_method: paymentMethod,
        reference: reference.trim() || null,
      })
      .select()
      .single()

    setSaving(false)
    submitting.current = false

    if (insertError) {
      setError(insertError.message)
      return
    }

    onCreated(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={saving ? undefined : onClose} />
      <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Record Payment</h3>
          <button onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount (₦)</label>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Payment For</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              disabled={saving}
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
              disabled={saving}
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
              disabled={saving}
              placeholder="e.g. transfer ID"
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          This records the payment. It stays &ldquo;awaiting verification&rdquo; until an EboHomes administrator checks it.
        </p>

        {error && <p className="text-xs text-destructive mt-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-sm rounded-md py-2 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? 'Recording…' : 'Record Payment'}
        </button>
      </div>
    </div>
  )
}