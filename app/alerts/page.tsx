'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'

// Property alerts.
// Same as before: list, pause/turn on, delete with confirmation. Alerts are delivered as in-app notifications
// when EboHomes approves a matching property. Nothing else is promised.
// New: "Create an alert" form on this page (location, property type, monthly budget, bedrooms), so a tenant
// can set an alert without running a search first. No email, WhatsApp or frequency options are shown,
// because EboHomes does not send those.

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

// Property type values must match what is stored in listings.property_type (same list as /list-property and /search).
const PROPERTY_TYPES = [
  'Flat / Apartment',
  'Bungalow',
  'Duplex',
  'Self Contain',
  'Penthouse',
  'Hostel',
  'Office',
  'Shop / Mall',
  'Warehouse',
  'Land / Plot',
  'Event Center',
]

const QUICK_LOCATIONS = ['Abakaliki', 'Afikpo']
const BEDROOM_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Any', value: null },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4+', value: 4 },
]

const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`

type Criteria = {
  location: string | null
  property_type: string | null
  min_price: number | null
  max_price: number | null
  bedrooms: number | null
}

function summary(a: Criteria): string {
  const parts: string[] = []
  if (a.location) parts.push(a.location)
  if (a.property_type) parts.push(a.property_type)
  if (a.bedrooms != null) parts.push(a.bedrooms >= 4 ? '4+ bedrooms' : `${a.bedrooms} bedroom${a.bedrooms === 1 ? '' : 's'}`)
  if (a.min_price != null && a.max_price != null) parts.push(`${naira(a.min_price)} to ${naira(a.max_price)} a month`)
  else if (a.min_price != null) parts.push(`from ${naira(a.min_price)} a month`)
  else if (a.max_price != null) parts.push(`up to ${naira(a.max_price)} a month`)
  return parts.length ? parts.join(' · ') : 'Any new property'
}

// "1,500,000" or "1500000" -> 1500000. Empty or invalid -> null.
function parseMoney(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? n : null
}

const chipBase =
  'inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const chipOn = 'border-primary bg-primary text-primary-foreground'
const chipOff = 'border-border bg-card text-foreground hover:bg-secondary'

export default function AlertsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [confirmId, setConfirmId] = useState('')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [bedrooms, setBedrooms] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')

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

  const resetForm = () => {
    setLocation('')
    setPropertyType('')
    setMinText('')
    setMaxText('')
    setBedrooms(null)
    setFormMessage('')
  }

  const minPrice = parseMoney(minText)
  const maxPrice = parseMoney(maxText)
  const draft: Criteria = {
    location: location.trim() || null,
    property_type: propertyType || null,
    min_price: minPrice,
    max_price: maxPrice,
    bedrooms,
  }

  const createAlert = async () => {
    setFormMessage('')
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      setFormMessage('The lowest budget is higher than the highest budget. Please check the amounts.')
      return
    }

    setSaving(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      router.replace('/login?redirect=/alerts')
      return
    }

    // Do not save the same alert twice.
    let q = supabase.from('property_alerts').select('id').eq('user_id', auth.user.id)
    for (const [key, value] of Object.entries(draft)) {
      q = value === null ? q.is(key, null) : q.eq(key, value)
    }
    const { data: existing } = await q.limit(1)
    if (existing && existing.length > 0) {
      setSaving(false)
      setFormMessage('You already have an alert with these details.')
      return
    }

    const { error: err } = await supabase.from('property_alerts').insert({
      user_id: auth.user.id,
      label: summary(draft),
      ...draft,
    })
    setSaving(false)
    if (err) {
      setFormMessage('Could not save the alert. Please try again.')
      return
    }

    resetForm()
    setShowForm(false)
    await load()
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

          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={18} aria-hidden /> Create an alert
            </button>
          )}

          {showForm && (
            <section
              aria-labelledby="new-alert-heading"
              className="space-y-5 rounded-card border border-border bg-card p-4 shadow-rest sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="new-alert-heading" className="text-lg font-bold text-foreground">
                    Create a property alert
                  </h2>
                  <p className="text-sm text-muted-foreground">Leave anything blank to match any value.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    setShowForm(false)
                  }}
                  aria-label="Close"
                  className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>

              {/* Location */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Preferred location</legend>
                <div className="flex flex-wrap gap-2">
                  {QUICK_LOCATIONS.map((l) => {
                    const on = location.trim().toLowerCase() === l.toLowerCase()
                    return (
                      <button
                        key={l}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setLocation(on ? '' : l)}
                        className={`${chipBase} ${on ? chipOn : chipOff}`}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
                <label htmlFor="alert-location" className="sr-only">
                  Or type an area or town
                </label>
                <input
                  id="alert-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Or type an area or town"
                  autoComplete="off"
                  className="mt-3 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
              </fieldset>

              {/* Property type */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Property type</legend>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_TYPES.map((t) => {
                    const on = propertyType === t
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPropertyType(on ? '' : t)}
                        className={`${chipBase} ${on ? chipOn : chipOff}`}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Budget */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">
                  Rent budget <span className="font-normal text-muted-foreground">(per month, in naira)</span>
                </legend>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="alert-min" className="sr-only">
                      Lowest monthly rent
                    </label>
                    <input
                      id="alert-min"
                      type="text"
                      inputMode="numeric"
                      value={minText}
                      onChange={(e) => setMinText(e.target.value)}
                      placeholder="Min"
                      className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    />
                  </div>
                  <span aria-hidden className="text-muted-foreground">
                    to
                  </span>
                  <div className="flex-1">
                    <label htmlFor="alert-max" className="sr-only">
                      Highest monthly rent
                    </label>
                    <input
                      id="alert-max"
                      type="text"
                      inputMode="numeric"
                      value={maxText}
                      onChange={(e) => setMaxText(e.target.value)}
                      placeholder="Max"
                      className="min-h-12 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    />
                  </div>
                </div>
                {(minPrice != null || maxPrice != null) && (
                  <p className="mt-2 text-xs text-muted-foreground" role="status">
                    {minPrice != null && `${naira(minPrice)} a month is ${naira(minPrice * 12)} a year`}
                    {minPrice != null && maxPrice != null && ' · '}
                    {maxPrice != null && `${naira(maxPrice)} a month is ${naira(maxPrice * 12)} a year`}
                  </p>
                )}
              </fieldset>

              {/* Bedrooms */}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Bedrooms</legend>
                <div className="flex flex-wrap gap-2">
                  {BEDROOM_OPTIONS.map((b) => {
                    const on = bedrooms === b.value
                    return (
                      <button
                        key={b.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setBedrooms(b.value)}
                        className={`${chipBase} min-w-14 ${on ? chipOn : chipOff}`}
                      >
                        {b.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="rounded-lg bg-secondary p-3 text-sm text-foreground">
                <p className="font-semibold">This alert will match</p>
                <p className="text-muted-foreground">{summary(draft)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  You will be notified in EboHomes when a matching property is approved.
                </p>
              </div>

              {formMessage && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {formMessage}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    setShowForm(false)
                  }}
                  className="focus-ring min-h-12 flex-1 rounded-lg border border-border bg-background text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createAlert}
                  disabled={saving}
                  className="focus-ring inline-flex min-h-12 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden /> Saving...
                    </>
                  ) : (
                    <>
                      <Bell size={16} aria-hidden /> Create alert
                    </>
                  )}
                </button>
              </div>
            </section>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Loading your alerts...
            </div>
          )}

          {!loading && alerts.length === 0 && !error && !showForm && (
            <div className="rounded-card border border-border bg-card p-8 text-center">
              <Bell size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
              <p className="mb-1 font-semibold text-foreground">No alerts yet</p>
              <p className="mb-5 text-sm text-muted-foreground">
                Tap Create an alert above, or search for a property and tap Set alert.
              </p>
              <Link
                href="/search"
                className="focus-ring inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-semibold text-foreground hover:bg-secondary"
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
