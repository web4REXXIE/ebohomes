'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'

export default function VerifyReceiptPage() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const [checked, setChecked] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy || !code.trim()) return

    setBusy(true)
    setFailed(false)
    setChecked(false)
    setResult(null)

    const { data, error } = await supabase.rpc('verify_receipt_v2', {
      p_code: code.trim().toUpperCase(),
    })

    if (error) {
      console.error('Receipt check failed:', error.message)
      setFailed(true)
    } else {
      setResult(data && data.length > 0 ? data[0] : null)
      setChecked(true)
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-bold text-foreground">Check a receipt</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Enter the receipt number, for example EBO-RCT-000001.
        </p>

        <form onSubmit={check}>
          <label htmlFor="receipt-code" className="sr-only">
            Receipt number
          </label>
          <input
            id="receipt-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="EBO-RCT-000001"
            autoComplete="off"
            className="mb-3 w-full rounded-lg border border-border bg-input px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Checking...
              </>
            ) : (
              'Check receipt'
            )}
          </button>
        </form>

        {failed && (
          <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-destructive">
            We could not check this receipt right now. Please check your connection and try again.
          </p>
        )}

        {checked && !result && (
          <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-destructive">
            No receipt found with that number. Check the number and try again.
          </p>
        )}

        {result && (
          <div className="mt-4 space-y-1 rounded-lg border border-border bg-card p-4 text-sm text-foreground">
            <p className="font-semibold">{result.receipt_code} exists</p>
            <p className="capitalize">Type: {result.payment_type}</p>
            <p>Recorded: {new Date(result.recorded_on).toLocaleDateString()}</p>
            {result.is_verified ? (
              <p className="flex items-center gap-1.5 font-medium text-primary">
                <ShieldCheck size={16} />
                Verified by EboHomes
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                Not verified by EboHomes. This payment was recorded but has not been checked by an
                EboHomes administrator.
              </p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              Names, amounts and property details are only shown to the people on the receipt.
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}