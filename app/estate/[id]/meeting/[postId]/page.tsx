'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'

type Msg = { id: string; author: string; body: string; created_at: string; mine: boolean }
type Room = {
  role: string | null
  title?: string
  body?: string | null
  meeting_at?: string
  going?: number
  my_going?: boolean
  open?: boolean
  messages?: Msg[]
}

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })

export default function MeetingRoomPage() {
  const params = useParams<{ id: string; postId: string }>()
  const estateId = params?.id
  const postId = params?.postId
  const [state, setState] = useState<'loading' | 'ok' | 'noaccess' | 'error'>('loading')
  const [room, setRoom] = useState<Room | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (silent: boolean) => {
      if (!isValidListingId(postId)) {
        setState('noaccess')
        return
      }
      if (!silent) setState('loading')
      const { data, error } = await supabase.rpc('lodge_meeting_room', { p_post: postId })
      if (error) {
        if (!silent) setState('error')
        return
      }
      const r = data as Room | null
      if (!r || !r.role) {
        setState('noaccess')
        return
      }
      setRoom(r)
      setState('ok')
    },
    [postId],
  )

  useEffect(() => { void load(false) }, [load])

  // While the text room is open, look for new messages every 8 seconds (only when the page is showing).
  useEffect(() => {
    if (state !== 'ok' || !room?.open) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 8000)
    return () => clearInterval(timer)
  }, [state, room?.open, load])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [room?.messages?.length])

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('lodge_meeting_say', { p_post: postId, p_body: text })
    setBusy(false)
    if (error) {
      setErr(error.message || 'Could not send. Try again.')
      return
    }
    setDraft('')
    await load(true)
  }

  const toggleGoing = async () => {
    if (!room || busy) return
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('lodge_meeting_rsvp', { p_post: postId, p_going: !room.my_going })
    setBusy(false)
    if (error) {
      setErr(error.message || 'Could not save your reply.')
      return
    }
    await load(true)
  }

  const over = room?.meeting_at ? new Date(room.meeting_at).getTime() + 6 * 3600 * 1000 < Date.now() : false

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
        <p className="font-semibold text-foreground">We could not load this meeting</p>
        <p className="text-sm text-muted-foreground">This is usually temporary. Please try again.</p>
        <button type="button" className={btnP} onClick={() => void load(false)}>Try again</button>
      </div>
    )
  } else if (state === 'noaccess' || !room) {
    body = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">Meeting not available</p>
        <p className="text-sm text-muted-foreground">Meetings are for the owner and the people who live here. Log in with your home account, or the meeting may have been removed.</p>
        <Link href={`/estate/${estateId}/town`} className={btnP}>Back to the town</Link>
      </div>
    )
  } else {
    const messages = room.messages ?? []
    body = (
      <div className="space-y-4">
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Meeting</p>
          <h1 className="text-2xl font-bold text-foreground">{room.title}</h1>
          {room.meeting_at && <p className="text-sm text-muted-foreground">{when(room.meeting_at)} · {room.going ?? 0} coming</p>}
          {room.body && <p className="whitespace-pre-line text-sm text-foreground">{room.body}</p>}
          {!over && (
            <button type="button" disabled={busy} className={room.my_going ? btnP : btnS} onClick={() => void toggleGoing()}>
              {room.my_going ? "✓ I'll come" : "I'll come"}
            </button>
          )}
        </div>

        <section aria-label="Meeting room" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-base font-bold text-foreground">Text room</p>
          {!room.open && (
            <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
              {over ? 'This meeting is over. You can still read what was said.' : 'The text room opens 30 minutes before the meeting starts.'}
            </p>
          )}
          <div ref={listRef} className="max-h-[50vh] space-y-2 overflow-y-auto" aria-live="polite">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has said anything yet.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.mine ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                    <p className={`text-xs font-semibold ${m.mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{m.mine ? 'You' : m.author} · {clock(m.created_at)}</p>
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {room.open && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  maxLength={300}
                  disabled={busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send()
                  }}
                  placeholder="Write a message"
                  aria-label="Write a message"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                />
                <button type="button" disabled={busy || draft.trim().length === 0} className={btnP} onClick={() => void send()} aria-label="Send">
                  <Send size={16} aria-hidden />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{draft.length}/300. No phone numbers and no outside links. Everyone sees your door number only.</p>
            </div>
          )}
          {err && <p role="alert" className="rounded-xl border border-danger bg-danger/10 p-3 text-sm text-danger">{err}</p>}
        </section>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          <Link href={`/estate/${estateId}/town`} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Back to the town
          </Link>
          {body}
        </div>
      </main>
      <Footer />
    </div>
  )
    }
