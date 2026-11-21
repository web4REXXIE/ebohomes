'use client'

import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { LightDeyCard } from '@/components/light-dey-card'
import { TrustedBadge } from '@/components/trusted-badge'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { timeAgo, type LightState } from '@/lib/light-status'
import { naturalSort, unitState, type ViewUnit } from '@/lib/estate-view'
import { EMPTY_SUMMARY, LEVEL_STEPS, levelFor, nextItem, nextLodgeUnlock, nextStep, parseSummary, unlockedItems, type Summary } from '@/lib/eboville'
import type { DoorUnit, DoorTone } from '@/components/eboville-scene'

const EbovilleScene = dynamic(() => import('@/components/eboville-scene'), {
  ssr: false,
  loading: () => <div className="h-[500px] animate-pulse rounded-xl bg-secondary" />,
})
const EbovilleRoom = dynamic(() => import('@/components/eboville-room'), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-secondary" />,
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

type Estate = { id: string; owner_id: string | null; name: string; kind: string; theme?: string | null; tagline?: string | null; units: ViewUnit[] | null }
type BoardPost = { id: string; kind: string; title: string; author: string; created_at: string }
type Meeting = { id: string; title: string; meeting_at: string; going: number; my_going: boolean }
type Panel = { kind: 'board' } | { kind: 'light' } | { kind: 'hall' } | { kind: 'gate' } | { kind: 'door'; id: string } | null

const KIND: Record<string, string> = { notice: 'Notice', poll: 'Poll', meeting: 'Meeting' }
const MAX_DOORS = 40

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Sheet({ title, label, onClose, children }: { title: string; label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-2xl sm:pb-5">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
          <X size={20} aria-hidden />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
        <h3 className="pr-10 text-xl font-bold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default function TownPage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading')
  const [estate, setEstate] = useState<Estate | null>(null)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())
  const [trusted, setTrusted] = useState(false)
  const [resident, setResident] = useState(false)
  const [myUnit, setMyUnit] = useState<string | null>(null)
  const [occupied, setOccupied] = useState<string[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [character, setCharacter] = useState<'woman' | 'man'>('woman')
  const [night, setNight] = useState(false)
  const [light, setLight] = useState<LightState>('unknown')
  const [view, setView] = useState<'town' | 'room'>('town')
  const [panel, setPanel] = useState<Panel>(null)
  const [boardRole, setBoardRole] = useState<string | null>(null)
  const [posts, setPosts] = useState<BoardPost[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!isValidListingId(estateId)) {
      setState('notfound')
      return
    }
    const { data, error } = await supabase
      .from('estates')
      .select('id, owner_id, name, kind, theme, tagline, units(id, unit_label, floor_no, group_label, status, listing_id)')
      .eq('id', estateId)
      .maybeSingle()
    if (error || !data) {
      setState('notfound')
      return
    }
    const e = data as unknown as Estate
    setEstate(e)
    setState('ok')

    // Which homes are really to let (their listing is approved). If this fails the doors show as not available.
    const ids = (e.units ?? []).map((u) => u.listing_id).filter((x): x is string => !!x)
    if (ids.length > 0) {
      const { data: ls } = await supabase.from('listings').select('id').in('id', ids).eq('status', 'approved')
      setLiveIds(new Set(((ls ?? []) as { id: string }[]).map((l) => l.id)))
    }

    // Do I live here? Everything below is a bonus. If it fails, the town still works.
    const rv = await supabase.rpc('estate_resident_view', { p_estate: e.id })
    const rview = rv.error ? null : (rv.data as { resident?: boolean; my_unit?: string | null; occupied?: string[] } | null)
    if (rview?.resident === true) {
      setResident(true)
      setMyUnit(typeof rview.my_unit === 'string' ? rview.my_unit : null)
      setOccupied(Array.isArray(rview.occupied) ? rview.occupied.filter((x): x is string => typeof x === 'string') : [])
    }
    const sm = await supabase.rpc('eboville_summary', { p_estate: e.id })
    if (!sm.error) setSummary(parseSummary(sm.data))
    if (e.owner_id) {
      const tr = await supabase.rpc('landlord_is_trusted', { p_landlord: e.owner_id })
      setTrusted(!tr.error && tr.data === true)
    }
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

  const units = useMemo(() => estate?.units ?? [], [estate])
  const hasFloors = units.some((u) => u.floor_no !== null)

  const toneOf = useCallback(
    (u: ViewUnit): DoorTone => {
      if (unitState(u, liveIds) === 'to_let') return 'to_let'
      if (resident && u.id === myUnit) return 'mine'
      if (resident && occupied.includes(u.id)) return 'neighbour'
      return 'taken'
    },
    [liveIds, resident, myUnit, occupied],
  )

  const sortedUnits = useMemo(() => {
    const list = [...units]
    list.sort((a, b) => (a.floor_no ?? 0) - (b.floor_no ?? 0) || naturalSort(a.unit_label, b.unit_label))
    return list
  }, [units])
  const shownUnits = useMemo(() => sortedUnits.slice(0, MAX_DOORS), [sortedUnits])
  const doors: DoorUnit[] = useMemo(
    () => shownUnits.map((u) => ({ id: u.id, label: u.unit_label, floor: u.floor_no, tone: toneOf(u), building: u.group_label })),
    [shownUnits, toneOf],
  )

  const level = levelFor(summary.lodgePoints)
  const stepNext = nextStep(summary.lodgePoints)
  const unlockNext = nextLodgeUnlock(level)
  const myItems = unlockedItems(summary.myPoints)
  const itemNext = nextItem(summary.myPoints)
  const prevStep = LEVEL_STEPS[level - 1] ?? 0
  const pct = stepNext ? Math.round(((summary.lodgePoints - prevStep) / Math.max(1, stepNext.at - prevStep)) * 100) : 100

  const loadBoard = useCallback(async () => {
    if (!isValidListingId(estateId)) return
    setPanelLoading(true)
    const { data, error } = await supabase.rpc('lodge_board', { p_estate: estateId })
    setPanelLoading(false)
    if (error) {
      setBoardRole(null)
      setPosts([])
      return
    }
    const r = data as { role: string | null; posts: BoardPost[] } | null
    setBoardRole(r?.role ?? null)
    setPosts((r?.posts ?? []).slice(0, 3))
  }, [estateId])

  const loadMeetings = useCallback(async () => {
    if (!isValidListingId(estateId)) return
    setPanelLoading(true)
    const { data, error } = await supabase.rpc('lodge_upcoming_meetings', { p_estate: estateId })
    setPanelLoading(false)
    setMeetings(error || !Array.isArray(data) ? [] : (data as Meeting[]))
  }, [estateId])

  // Called when the character reaches a place.
  const onArrive = useCallback(
    (key: string) => {
      setMsg(null)
      if (key === 'board') {
        setPanel({ kind: 'board' })
        void loadBoard()
      } else if (key === 'light') {
        setPanel({ kind: 'light' })
      } else if (key === 'hall') {
        setPanel({ kind: 'hall' })
        void loadMeetings()
      } else if (key === 'gate') {
        setPanel({ kind: 'gate' })
      } else if (key.startsWith('door:')) {
        setPanel({ kind: 'door', id: key.slice(5) })
      }
    },
    [loadBoard, loadMeetings],
  )

  const knock = async (toUnit: string, sticker: 'knock' | 'welcome' | 'howfar') => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('send_knock', { p_to_unit: toUnit, p_sticker: sticker })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message || 'Could not send it. Try again.' } : { ok: true, text: 'Sent. Your neighbour got a message with your door number only.' })
    if (!error) {
      const sm = await supabase.rpc('eboville_summary', { p_estate: estateId })
      if (!sm.error) setSummary(parseSummary(sm.data))
    }
  }

  const rsvp = async (postId: string, going: boolean) => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('lodge_meeting_rsvp', { p_post: postId, p_going: going })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not save your reply.' })
      return
    }
    void loadMeetings()
    const sm = await supabase.rpc('eboville_summary', { p_estate: estateId })
    if (!sm.error) setSummary(parseSummary(sm.data))
  }

  const closePanel = () => {
    setPanel(null)
    setMsg(null)
  }

  const doorUnit = panel?.kind === 'door' ? units.find((u) => u.id === panel.id) ?? null : null
  const doorTone = doorUnit ? toneOf(doorUnit) : null
  const homeWord = hasFloors ? 'Flat' : 'House'
  const lightWord = light === 'on' ? 'Light dey' : light === 'off' ? 'No light' : 'No update yet'
  const lodgeName = estate?.name ?? ''
  const isMember = summary.role !== null

  let body: ReactNode
  if (state === 'loading') {
    body = (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  } else if (state === 'notfound' || !estate) {
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
          <h1 className="text-2xl font-bold text-foreground">{estate.name}</h1>
          {estate.tagline && <p className="text-sm italic text-muted-foreground">{estate.tagline}</p>}
          <p className="text-sm text-muted-foreground">
            {view === 'town'
              ? 'Tap the ground to walk. Tap a door, the board, the pole, the hall or the gate.'
              : 'Your room. Only you can see it. It grows as you take part.'}
          </p>
        </div>

        {webgl === false ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">3D does not work on this phone. Please use the building page.</p>
        ) : view === 'town' ? (
          <div className="overflow-hidden rounded-xl border border-border" style={{ height: 500, touchAction: 'none' }}>
            {webgl && (
              <SceneGuard>
                <EbovilleScene
                  character={character}
                  theme={estate.theme}
                  night={night}
                  light={light}
                  level={level}
                  lodgeName={lodgeName}
                  trusted={trusted}
                  doors={doors}
                  selectedDoor={panel?.kind === 'door' ? panel.id : null}
                  onArrive={onArrive}
                  estateId={estate.id}
                  presenceLabel={summary.role === 'owner' ? 'Management' : summary.myUnitLabel ? 'Unit ' + summary.myUnitLabel : null}
                />
              </SceneGuard>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border" style={{ height: 420, touchAction: 'none' }}>
            {webgl && (
              <SceneGuard>
                <EbovilleRoom character={character} theme={estate.theme} items={myItems.map((i) => i.key)} />
              </SceneGuard>
            )}
          </div>
        )}

        {sortedUnits.length > (hasFloors ? MAX_DOORS : 25) && view === 'town' && (
          <p className="text-xs text-muted-foreground">The town shows the first {hasFloors ? MAX_DOORS : 25} homes. See the building page for all of them.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {view === 'town' ? (
            <>
              <button type="button" className={btnS} onClick={() => setNight((n) => !n)}>{night ? '☀️ Day' : '🌙 Night'}</button>
              {resident && myUnit && <button type="button" className={btnP} onClick={() => setView('room')}>🏠 My room</button>}
            </>
          ) : (
            <button type="button" className={btnP} onClick={() => setView('town')}>Back to the town</button>
          )}
          <button type="button" className={character === 'woman' ? btnP : btnS} onClick={() => setCharacter('woman')}>Her</button>
          <button type="button" className={character === 'man' ? btnP : btnS} onClick={() => setCharacter('man')}>Him</button>
        </div>

        {view === 'town' ? (
          <section aria-label="Lodge level" className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-foreground">Lodge Level {level}</p>
              <p className="text-sm text-muted-foreground">Light: {lightWord}</p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
            {isMember ? (
              <p className="text-sm text-muted-foreground">
                {summary.activeResidents} of {summary.residents} {summary.residents === 1 ? 'person' : 'people'} took part in the last 30 days.
                {stepNext ? ` ${stepNext.left} more points to Level ${stepNext.level}.` : ' This lodge is at the top level.'}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">People who live here see how the lodge is growing. Log in with your home account to join.</p>
            )}
            {unlockNext && <p className="text-xs text-muted-foreground">Next unlock at Level {unlockNext.level}: {unlockNext.label}.</p>}
            {resident && (
              <p className="text-xs text-muted-foreground">
                Your points: {summary.myPoints}.{itemNext ? ` Next for your room: ${itemNext.emoji} ${itemNext.label} at ${itemNext.points}.` : ' Your room has everything.'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Points come from knocking on doors, posting, voting and joining meetings. No money, no random prizes.</p>
          </section>
        ) : (
          <section aria-label="Room items" className="space-y-2 rounded-xl border border-border bg-card p-4">
            <p className="text-base font-bold text-foreground">Your room{summary.myUnitLabel ? `, ${homeWord} ${summary.myUnitLabel}` : ''}</p>
            <p className="text-sm text-muted-foreground">{myItems.length === 0 ? 'Empty for now. Knock on a door or answer a poll to get your first plant.' : myItems.map((i) => `${i.emoji} ${i.label}`).join('  ')}</p>
            {itemNext && <p className="text-xs text-muted-foreground">Next: {itemNext.emoji} {itemNext.label} at {itemNext.points} points. You have {summary.myPoints}.</p>}
          </section>
        )}
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

      {/* The light card stays mounted, hidden, so the glow in the town always knows the light status. */}
      {estateId && (
        <div className={panel?.kind === 'light' ? 'fixed inset-0 z-50 flex items-end justify-center sm:items-center' : 'hidden'} role={panel?.kind === 'light' ? 'dialog' : undefined} aria-modal={panel?.kind === 'light' ? true : undefined} aria-label="Light dey?">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={closePanel} />
          <div className="relative w-full max-w-md space-y-3 rounded-t-2xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-2xl sm:pb-5">
            <button type="button" aria-label="Close" onClick={closePanel} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
              <X size={20} aria-hidden />
            </button>
            <LightDeyCard estateId={estateId} isResident={resident} onStatus={setLight} />
          </div>
        </div>
      )}

      {panel?.kind === 'board' && (
        <Sheet label="Lodge board" title="What is happening here" onClose={closePanel}>
          {panelLoading ? (
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
          {boardRole && <Link href={`/estate/${estateId}/board`} className={`${btnP} w-full`}>Open the Lodge board <ArrowRight size={15} aria-hidden /></Link>}
        </Sheet>
      )}

      {panel?.kind === 'hall' && (
        <Sheet label="Meeting hall" title="Meetings" onClose={closePanel}>
          {panelLoading ? (
            <div className="flex justify-center py-6" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={22} aria-hidden /></div>
          ) : !isMember ? (
            <p className="text-sm text-muted-foreground">Meetings are for the people who live here and the owner. Log in with your home account to see them.</p>
          ) : meetings.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No meeting is set. {summary.role === 'owner' ? 'You can set one on the Lodge board.' : 'The owner will set one here when it is time.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {meetings.map((m) => (
                <li key={m.id} className="space-y-2 rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold text-foreground">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{when(m.meeting_at)} · {m.going} coming</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} className={m.my_going ? btnP : btnS} onClick={() => void rsvp(m.id, !m.my_going)}>
                      {m.my_going ? "✓ I'll come" : "I'll come"}
                    </button>
                    <Link href={`/estate/${estateId}/meeting/${m.id}`} className={btnS}>Meeting room <ArrowRight size={15} aria-hidden /></Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {msg && <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'}`}>{msg.text}</p>}
          <p className="text-xs text-muted-foreground">Meetings happen inside EboHomes. The text room opens 30 minutes before the start.</p>
        </Sheet>
      )}

      {panel?.kind === 'gate' && (
        <Sheet label="Lodge gate" title={lodgeName} onClose={closePanel}>
          {trusted && <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><TrustedBadge /> Trusted Lodge Keeper</div>}
          <p className="text-sm text-foreground">Lodge Level {level}</p>
          {isMember ? (
            <p className="text-sm text-muted-foreground">{summary.residents} {summary.residents === 1 ? 'home is' : 'homes are'} lived in. {summary.activeResidents} took part in the last 30 days.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Log in with your home account to see how this lodge is doing.</p>
          )}
          {unlockNext && <p className="text-xs text-muted-foreground">Next unlock at Level {unlockNext.level}: {unlockNext.label}.</p>}
          <Link href={`/estate/${estateId}`} className={`${btnS} w-full`}>See the building and homes to let <ArrowRight size={15} aria-hidden /></Link>
        </Sheet>
      )}

      {panel?.kind === 'door' && doorUnit && (
        <Sheet label={`${homeWord} ${doorUnit.unit_label}`} title={`${homeWord} ${doorUnit.unit_label}`} onClose={closePanel}>
          {doorTone === 'mine' ? (
            <>
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Your home</span>
              <p className="text-sm text-muted-foreground">This is your door.</p>
              <button type="button" className={`${btnP} w-full`} onClick={() => { closePanel(); setView('room') }}>Go inside: my room</button>
            </>
          ) : doorTone === 'neighbour' ? (
            <>
              <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">Neighbour</span>
              <p className="text-sm text-muted-foreground">Someone lives here. Say hello. They only see your door number.</p>
              <div className="grid grid-cols-1 gap-2">
                <button type="button" disabled={busy} onClick={() => void knock(doorUnit.id, 'knock')} className={`${btnS} w-full`}>👋 Knock knock</button>
                <button type="button" disabled={busy} onClick={() => void knock(doorUnit.id, 'welcome')} className={`${btnS} w-full`}>🏠 Welcome</button>
                <button type="button" disabled={busy} onClick={() => void knock(doorUnit.id, 'howfar')} className={`${btnS} w-full`}>🤝 How far?</button>
              </div>
              {msg && <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'}`}>{msg.text}</p>}
            </>
          ) : doorTone === 'to_let' ? (
            <>
              <span className="inline-block rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">To let</span>
              <p className="text-sm text-muted-foreground">This home is open for new people.</p>
              {doorUnit.listing_id && <Link href={`/listing/${doorUnit.listing_id}`} className={`${btnP} w-full`}>View this home <ArrowRight size={15} aria-hidden /></Link>}
            </>
          ) : (
            <>
              <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Not available</span>
              <p className="text-sm text-muted-foreground">This home is not available right now.</p>
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
