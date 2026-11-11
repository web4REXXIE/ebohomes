'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Loader2, Trash2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'

type Alert = {
  id: string
  label: string | null
  location: string | null
  property_type: string | null
  min_price: number | null
  max_price: number | null
  bedrooms: number | null
  active: boolean | null
  created_at: string | null
}

const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`

function summary(a: Alert): string {
  const parts: string[] = []
  if (a.location) parts.push(a.location)
  if (a.property_type) parts.push(a.property_type)
  if (a.bedrooms != null) parts.push(a.bedrooms >= 4 ? '4+ bedrooms' : `${a.bedrooms} bedroom${a.bedrooms === 1 ? '' : 's'}`)
  if (a.min_price != null && a.max_price != null) parts.push(`${naira(a.min_price)} to ${naira(a.max_price)} a month`)
  else if (a.min_price != null) parts.push(`from ${naira(a.min_price)} a month`)
  else if (a.max_price != null) parts.push(`up to ${naira(a.max_price)} a month`)
  return parts.length ? parts.join(' · ') : 'Any new property'
}

export default function AlertsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [confirmId, setConfirmId] = useState('')

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      router.replace('/login?redirect=/alerts')
      return
    }
    const { data, error: err } = await supabase
      .from('property_alerts')
      .select('id, label, location, property_type, min_price, max_price, bedrooms, active, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
    if (err) setError('Could not load your alerts. Please try again.')
    setAlerts((data as Alert[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = async (a: Alert) => {
    setBusyId(a.id)
    setError('')
    const { error: err } = await supabase.from('property_alerts').update({ active: a.active === false }).eq('id', a.id)
    setBusyId('')
    if (err) {
      setError('Could not update that alert. Please try again.')
      return
    }
    setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, active: a.active === false } : x)))
  }

  const remove = async (id: string) => {
    setBusyId(id)
    setError('')
    const { error: err } = await supabase.from('property_alerts').delete().eq('id', id)
    setBusyId('')
    setConfirmId('')
    if (err) {
      setError('Could not delete that alert. Please try again.')
      return
    }
    setAlerts((list) => list.filter((x) => x.id !== id))
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-foreground">My property alerts</h1>
            <p className="text-sm text-muted-foreground">
              When EboHomes approves a property that matches an alert, you get a notification in the app.
            </p>
          </div>

          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

          {loading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Loading your alerts...
            </div>
          )}

          {!loading && alerts.length === 0 && !error && (
            <div className="rounded-card border border-border bg-card p-8 text-center">
              <Bell size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
              <p className="mb-1 font-semibold text-foreground">No alerts yet</p>
              <p className="mb-5 text-sm text-muted-foreground">
                Search for a property, then tap Set alert to be told when a match is listed.
              </p>
              <Link
                href="/search"
                className="focus-ring inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Search properties
              </Link>
            </div>
          )}

          <ul className="space-y-3">
            {alerts.map((a) => {
              const paused = a.active === false
              return (
                <li key={a.id} className="rounded-card border border-border bg-card p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-foreground">{summary(a)}</p>
                      <p className="text-xs text-muted-foreground">{paused ? 'Paused' : 'On'}</p>
                    </div>
                  </div>

                  {confirmId === a.id ? (
                    <div className="space-y-2 rounded-lg border border-border bg-secondary p-3">
                      <p className="text-sm text-foreground">Delete this alert? You will stop getting notifications for it.</p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setConfirmId('')}
                          className="min-h-11 flex-1 rounded-lg border border-border bg-background text-sm font-semibold"
                        >
                          Keep it
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          disabled={busyId === a.id}
                          className="min-h-11 flex-1 rounded-lg bg-destructive text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busyId === a.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => toggle(a)}
                        disabled={busyId === a.id}
                        className="min-h-11 flex-1 rounded-lg border border-border bg-background text-sm font-semibold text-foreground disabled:opacity-50"
                      >
                        {paused ? 'Turn on' : 'Pause'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(a.id)}
                        aria-label="Delete alert"
                        className="inline-flex min-h-11 w-12 items-center justify-center rounded-lg border border-destructive/40 text-destructive"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </main>
      <Footer />
    </div>
  )
}
