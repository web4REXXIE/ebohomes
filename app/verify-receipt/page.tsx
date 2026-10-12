'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function VerifyReceiptPage() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  const check = async () => {
    setBusy(true)
    const { data } = await supabase.rpc('verify_receipt', { p_code: code })
    setResult(data && data.length > 0 ? data[0] : null)
    setChecked(true)
    setBusy(false)
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-foreground mb-1">Verify a receipt</h1>
      <p className="text-sm text-muted-foreground mb-4">Enter the receipt number, for example EBO-RCT-000001.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EBO-RCT-000001" className="w-full bg-input border border-border rounded-lg px-4 py-3 text-sm mb-3" />
      <button onClick={check} disabled={busy ? true : !code.trim()} className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm">
        {busy ? 'Checking...' : 'Check receipt'}
      </button>
      {checked && !result && <p className="mt-4 text-sm text-destructive">No receipt found with that number.</p>}
      {result && (
        <div className="mt-4 bg-card border border-border rounded-lg p-4 text-sm space-y-1">
          <p className="font-semibold text-foreground">{result.receipt_code} exists</p>
          <p>₦{Number(result.amount).toLocaleString()} ({result.payment_type})</p>
          <p>{new Date(result.paid_on).toLocaleDateString()}</p>
          <p className="capitalize">Status: {result.status}</p>
          {result.recorded_only && (
            <p className="text-xs text-muted-foreground">Recorded by the landlord. Not collected or confirmed by EboHomes.</p>
          )}
        </div>
      )}
    </div>
  )
}