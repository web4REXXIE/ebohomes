'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { LODGE_THEMES, type LodgeThemeKey } from '@/lib/lodge-themes'
import type { ViewUnit } from '@/lib/estate-view'

const Building3D = dynamic(() => import('@/components/building-3d'), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-secondary" />,
})

// The landlord gives their place a name, a short tagline and a look. Only the owner can save (the database checks it).
type Row = { id: string; name: string; theme: string | null; tagline: string | null; units: ViewUnit[] | null }

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export default function LodgeStylePage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading')
  const [row, setRow] = useState<Row | null>(null)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [theme, setTheme] = useState<LodgeThemeKey>('classic')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!isValidListingId(estateId)) {
      setState('notfound')
      return
    }
    setState('loading')
    const { data, error } = await supabase
      .from('estates')
      .select('id, name, theme, tagline, units(id, unit_label, floor_no, group_label, status, listing_id)')
      .eq('id', estateId)
      .maybeSingle()
    if (error) {
      console.error('Lodge style: load failed:', error.message)
      setState('error')
      return
    }
    if (!data) {
      setState('notfound')
      return
    }
    const r = data as unknown as Row
    setRow(r)
    setName(r.name)
    setTagline(r.tagline ?? '')
    setTheme(LODGE_THEMES.some((t) => t.key === r.theme) ? (r.theme as LodgeThemeKey) : 'classic')
    setState('ok')
  }, [estateId])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!row || saving) return
    const n = name.trim()
    if (n.length < 1) {
      setMsg({ ok: false, text: 'Give your place a name.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.rpc('set_estate_style', { p_estate: row.id, p_name: n, p_theme: theme, p_tagline: tagline.trim() })
    setSaving(false)
    setMsg(error ? { ok: false, text: error.message || 'Could not save. Try again.' } : { ok: true, text: 'Saved. Tenants now see the new name and look.' })
  }

  let body: React.ReactNode
  if (state === 'loading') {
    body = (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  } else if (state === 'error') {
    body = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">We could not load this place</p>
        <button type="button" className={btnP} onClick={() => void load()}>Try again</button>
      </div>
    )
  } else if (state === 'notfound' || !row) {
    body = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">Place not found</p>
        <p className="text-sm text-muted-foreground">Sign in as the owner, or check the link.</p>
        <Link href="/dashboard/estates" className={btnP}>Your places <ArrowRight size={15} aria-hidden /></Link>
      </div>
    )
  } else {
    const units = row.units ?? []
    body = (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-foreground">Name and style</h1>
        <p className="text-sm text-muted-foreground">Give your place a name people remember, like Maker Man&apos;s Lodge. Pick a look. Tenants see it on the building page.</p>

        {units.length > 0 && (
          <div aria-hidden>
            <Building3D preview height={260} units={units} theme={theme} name={name} toneOf={() => 'taken'} selectedId={null} />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="lodge-name" className="text-sm font-semibold text-foreground">Name</label>
          <input id="lodge-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="focus-ring min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground" />
        </div>

        <div className="space-y-1">
          <label htmlFor="lodge-tagline" className="text-sm font-semibold text-foreground">Tagline (optional)</label>
          <input id="lodge-tagline" value={tagline} maxLength={80} placeholder="Quiet. Clean. Home." onChange={(e) => setTagline(e.target.value)} className="focus-ring min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground" />
          <p className="text-xs text-muted-foreground">{tagline.length} of 80 letters</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-foreground">Look</legend>
          <div className="grid grid-cols-2 gap-2">
            {LODGE_THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={theme === t.key}
                onClick={() => setTheme(t.key)}
                className={`focus-ring min-h-11 rounded-xl border-2 p-3 text-left transition ${theme === t.key ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
              >
                <span className="block text-sm font-bold text-foreground">{t.emoji} {t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {msg && (
          <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'}`}>{msg.text}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnP} disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</button>
          <Link href={`/estate/${row.id}`} className={btnS}>See it as tenants do <ArrowRight size={15} aria-hidden /></Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          <Link href="/dashboard/estates" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Your places
          </Link>
          {body}
        </div>
      </main>
      <Footer />
    </div>
  )
}
