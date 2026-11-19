'use client'

import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'

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
  }, [estateId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      setWebgl(!!(c.getContext('webgl2') || c.getContext('webgl')))
    } catch {
      setWebgl(false)
    }
  }, [])

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
          <p className="text-sm text-muted-foreground">Your lodge, as a little town. Drag to look around. Pinch to zoom.</p>
        </div>

        {webgl === false ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">3D does not work on this phone.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border" style={{ height: 480, touchAction: 'none' }}>
            {webgl && (
              <SceneGuard>
                <EbovilleScene character={character} theme={theme} />
              </SceneGuard>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className={character === 'woman' ? btnP : btnS} onClick={() => setCharacter('woman')}>Her</button>
          <button type="button" className={character === 'man' ? btnP : btnS} onClick={() => setCharacter('man')}>Him</button>
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
    </div>
  )
}
