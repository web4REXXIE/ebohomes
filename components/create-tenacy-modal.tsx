'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Props = {
  application: {
    id: string
    listing_id: string
    tenant_id: string
    application_data: any
  }
  listing: { price_monthly: number | null; title: string }
  landlordId: string
  onClose: () => void
  onCreated: (tenancy: any) => void
}

export function CreateTenancyModal({ application, listing, landlordId, onClose, onCreated }: Props) {
  const [rentAmount, setRentAmount] = useState(listing.price_monthly?.toString() ?? '')
  const [rentPeriod, setRentPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [startDate, setStartDate] = useState(application.application_data?.move_in_date ?? '')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!rentAmount || !startDate) {
      setError('Rent amount and start date are required.')
      return
    }
    setSaving(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('tenancies')
      .insert({
        application_id: application.id,
        listing_id: application.listing_id,
        tenant_id: application.tenant_id,
        landlord_id: landlordId,
        rent_amount: Number(rentAmount),
        rent_period: rentPeriod,
        start_date: startDate,
        end_date: endDate || null,
        created_by: landlordId,
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
          <h3 className="font-semibold text-foreground">Create Tenancy</h3>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">{listing.title}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Rent Amount (₦)</label>
            <input
              type="number"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Rent Period</label>
            <select
              value={rentPeriod}
              onChange={(e) => setRentPeriod(e.target.value as 'monthly' | 'yearly')}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full mt-1 border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
          Create Tenancy
        </button>
      </div>
    </div>
  )
}