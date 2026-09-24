'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const REASONS = [
  'Misleading photos',
  'Scam or fraud',
  'Listing no longer available',
  'Incorrect price',
  'Other',
]

export function ReportListingModal({
  listingId,
  onClose,
}: {
  listingId: string
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please select a reason')
      return
    }
    setSubmitting(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Please log in to report a listing')
      setSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('reports').insert({
      listing_id: listingId,
      reporter_id: user.id,
      reason,
      details: details || null,
    })

    setSubmitting(false)
    if (insertError) {
      setError('Something went wrong. Please try again.')
      return
    }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X size={18} />
        </button>

        {done ? (
          <div className="text-center py-6">
            <p className="font-semibold text-foreground mb-1">Report submitted</p>
            <p className="text-sm text-muted-foreground">Our team will review this listing.</p>
            <Button onClick={onClose} className="mt-4 w-full">Close</Button>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-foreground mb-4">Report this listing</h3>

            <label className="text-sm font-medium text-foreground mb-1 block">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm mb-3 bg-background"
            >
              <option value="">Select a reason</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <label className="text-sm font-medium text-foreground mb-1 block">Details (optional)</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="w-full border border-border rounded-md px-3 py-2 text-sm mb-3 bg-background"
              placeholder="Anything else we should know?"
            />

            {error && <p className="text-xs text-destructive mb-3">{error}</p>}

            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              {submitting ? 'Submitting...' : 'Submit report'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}