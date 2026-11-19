'use client'

import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { LightDeyCard } from '@/components/light-dey-card'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { timeAgo, type LightState } from '@/lib/light-status'

const EbovilleScene = dynamic(() => import('@/components/eboville-scene'), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse rounded-xl bg-secondary" />,
})

// If a model file is missing or broken, show a plain message instead of a blank screen.
class SceneGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error('EboVille scene failed:', err)
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          The town could not load. A model file may be missing. Check that the files are in public/models.
        </p>
      )
    }
    return this.props.children
  }
}

type BoardPost = { id: string; kind: string; title: string; author: string; created_at: string }
const KIND: Record<string, string> = { notice: 'Notice', poll: 'Poll', meeting: 'Meeting' }

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export default function TownPage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading')
  const [name, setName] = useState('')
  const [theme, setTheme] = useState<string | null>(null)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [character, setCharacter] = useState<'woman' | 'man'>('woman')
  const [night, setNight] = useState(false)
  const [light, setLight] = useState<LightState>('unknown')
  const [resident, setResident] = useState(false)
  const [panel, setPanel] = useState<'board' | 'light' | null>(null)
  const [boardRole, setBoardRole] = useState<string | null>(null)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [boardLoading, setBoardLoading] = useState(false)

  const load = useCallback(async () => {
    if (!isValidListingId(estateId)) {
      setState('notfound')
      return
    }
    const { data, error } = await supabase.from('estates').select('id, name, theme').eq('id', estateId).maybeSingle()
    if (error || !data) {
      setState('notfound')
      return
    }
    const e = data as { name: string; theme?: string | null }
    setName(e.name)
    setTheme(e.theme ?? null)
    setState('ok')

    // Do I live here? Only residents can report the light. If this fails, the page still works.
    const rv = await supabase.rpc('estate_resident_view', { p_estate: estateId })
    const view = rv.error ? null : (rv.data as { resident?: boolean } | null)
    setResident(view?.resident === true)
  }, [estateId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const h = new Date().getHours()
    setNight(h >= 18 || h < 6)
    try {
      const c = document.createElement('canvas')
      setWebgl(!!(c.getContext('webgl2') || c.getContext('webgl')))
    } catch {
      setWebgl(false)
    }
  }, [])

  const loadBoard = useCallback(async () => {
    if (!isValidListingId(estateId)) return
    setBoardLoading(true)
    const { data, error } = await supabase.rpc('lodge_board', { p_estate: estateId })
    setBoardLoading(false)
    if (error) {
      setBoardRole(null)
      setPosts([])
      return
    }
    const r = data as { role: string | null; posts: BoardPost[] } | null
    setBoardRole(r?.role ?? null)
    setPosts((r?.posts ?? []).slice(0, 3))
  }, [estateId])

  // Called when the character reaches the board or the light pole.
  const onArrive = useCallback(
    (spot: 'board' | 'light') => {
      setPanel(spot)
      if (spot === 'board') void loadBoard()
    },
    [loadBoard],
  )

  const lightWord = light === 'on' ? 'Light dey' : light === 'off' ? 'No light' : 'No update yet'

  let body: ReactNode
  if (state === 'loading') {
    body = (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  } else if (state === 'notfound') {
    body = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">Place not found</p>
        <Link href="/search" className={btnP}>Back to search</Link>
      </div>
    )
  } else {
    body = (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">EboVille</p>
          <h1 className="text-2xl font-bold text-foreground">{name}</h1>
          <p className="text-sm text-muted-foreground">Tap the ground to walk. Walk to the Lodge board or the light pole.</p>
        </div>

        {webgl === false ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">3D does not work on this phone.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border" style={{ height: 480, touchAction: 'none' }}>
            {webgl && (
              <SceneGuard>
                <EbovilleScene character={character} theme={theme} night={night} light={light} onArrive={onArrive} />
              </SceneGuard>
            )}
          </div>
        )}

        <p className="text-sm text-foreground"><span className="font-semibold">Light:</span> {lightWord}</p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={character === 'woman' ? btnP : btnS} onClick={() => setCharacter('woman')}>Her</button>
          <button type="button" className={character === 'man' ? btnP : btnS} onClick={() => setCharacter('man')}>Him</button>
          <button type="button" className={btnS} onClick={() => setNight((n) => !n)}>{night ? '☀️ Day' : '🌙 Night'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          <Link href={`/estate/${estateId}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Back to the building
          </Link>
          {body}
        </div>
      </main>
      <Footer />

      {/* The light card stays mounted, hidden, so the glow in the scene always knows the light status. */}
      {estateId && (
        <div className={panel === 'light' ? 'fixed inset-0 z-50 flex items-end justify-center sm:items-center' : 'hidden'} role={panel === 'light' ? 'dialog' : undefined} aria-modal={panel === 'light' ? true : undefined} aria-label="Light dey?">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setPanel(null)} />
          <div className="relative w-full max-w-md space-y-3 rounded-t-2xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-2xl sm:pb-5">
            <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
              <X size={20} aria-hidden />
            </button>
            <LightDeyCard estateId={estateId} isResident={resident} onStatus={setLight} />
          </div>
        </div>
      )}

      {panel === 'board' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Lodge board">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setPanel(null)} />
          <div className="relative w-full max-w-md space-y-3 rounded-t-2xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-2xl sm:pb-5">
            <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
              <X size={20} aria-hidden />
            </button>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Lodge board</p>
            <h3 className="pr-10 text-xl font-bold text-foreground">What is happening here</h3>

            {boardLoading ? (
              <div className="flex justify-center py-6" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={22} aria-hidden /></div>
            ) : !boardRole ? (
              <p className="text-sm text-muted-foreground">The board is for the people who live here and the owner. Log in with your home account to see it.</p>
            ) : posts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nobody don post anything yet. Be the first.</p>
            ) : (
              <ul className="space-y-2">
                {posts.map((p) => (
                  <li key={p.id} className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{KIND[p.kind] ?? 'Post'} · {p.author} · {timeAgo(p.created_at)}</p>
                    <p className="text-sm font-semibold text-foreground">{p.title}</p>
                  </li>
                ))}
              </ul>
            )}

            {boardRole && (
              <Link href={`/estate/${estateId}/board`} className={`${btnP} w-full`}>Open the Lodge board <ArrowRight size={15} aria-hidden /></Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
