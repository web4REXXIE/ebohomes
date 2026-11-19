'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarClock, Loader2, Megaphone, BarChart3, Plus, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { timeAgo } from '@/lib/light-status'

// The Lodge board: notices, polls and meetings for one building.
// Only the owner and residents can open it. No names are shown: "Management" or a door number.
type Kind = 'notice' | 'poll' | 'meeting'
type Post = {
  id: string
  kind: Kind
  title: string
  body: string
  author: string
  created_at: string
  mine: boolean
  can_hide: boolean
  meeting_at: string | null
  meeting_link: string | null
  options: string[] | null
  counts: number[] | null
  my_vote: number | null
  closed: boolean
}

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const field =
  'w-full min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const KIND_LABEL: Record<Kind, string> = { notice: 'Notice', poll: 'Poll', meeting: 'Meeting' }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function LodgeBoardPage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading')
  const [role, setRole] = useState<string | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('notice')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [meetingAt, setMeetingAt] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [opts, setOpts] = useState<string[]>(['', ''])

  const load = useCallback(async () => {
    if (!isValidListingId(estateId)) {
      setState('denied')
      return
    }
    const { data, error } = await supabase.rpc('lodge_board', { p_estate: estateId })
    if (error) {
      console.error('Lodge board: load failed:', error.message)
      setState('error')
      return
    }
    const r = data as { role: string | null; posts: Post[] } | null
    if (!r || !r.role) {
      setState('denied')
      return
    }
    setRole(r.role)
    setPosts(r.posts ?? [])
    setState('ok')
  }, [estateId])

  useEffect(() => { void load() }, [load])

  const reset = () => {
    setTitle('')
    setBody('')
    setMeetingAt('')
    setMeetingLink('')
    setOpts(['', ''])
    setKind('notice')
  }

  const submit = async () => {
    if (busy || !estateId) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('lodge_post_create', {
      p_estate: estateId,
      p_kind: kind,
      p_title: title,
      p_body: body,
      p_meeting_at: kind === 'meeting' && meetingAt ? new Date(meetingAt).toISOString() : null,
      p_meeting_link: kind === 'meeting' && meetingLink.trim() ? meetingLink.trim() : null,
      p_options: kind === 'poll' ? opts.map((o) => o.trim()).filter(Boolean) : null,
    })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not post. Try again.' })
      return
    }
    setMsg({ ok: true, text: 'E don post. Your neighbours can see it.' })
    reset()
    setOpen(false)
    void load()
  }

  const vote = async (postId: string, idx: number) => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('lodge_poll_vote', { p_post: postId, p_idx: idx })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not save your vote.' })
      return
    }
    void load()
  }

  const remove = async (postId: string) => {
    if (busy) return
    if (!window.confirm('Remove this post for everyone?')) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('lodge_post_hide', { p_post: postId })
    setBusy(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not remove it.' })
      return
    }
    void load()
  }

  const report = async (postId: string) => {
    if (busy) return
    if (!window.confirm('Report this post? Three reports hide it until an admin checks.')) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('lodge_post_report', { p_post: postId, p_reason: '' })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message || 'Could not report it.' } : { ok: true, text: 'Thanks. We got your report.' })
    void load()
  }

  const isOwner = role === 'owner'
  const kinds: Kind[] = isOwner ? ['notice', 'poll', 'meeting'] : ['notice', 'poll']

  let content: React.ReactNode
  if (state === 'loading') {
    content = (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  } else if (state === 'error') {
    content = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">We could not load the board</p>
        <p className="text-sm text-muted-foreground">This is usually temporary. Please try again.</p>
        <button type="button" className={btnP} onClick={() => { setState('loading'); void load() }}>Try again</button>
      </div>
    )
  } else if (state === 'denied') {
    content = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">This board is for the people who live here</p>
        <p className="text-sm text-muted-foreground">Log in with the account you use for your home. The owner and residents can open it.</p>
        <Link href={`/estate/${estateId}`} className={btnS}>Back to the building</Link>
      </div>
    )
  } else {
    content = (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lodge board</h1>
            <p className="text-sm text-muted-foreground">Notices, polls and meetings. No names, no phone numbers.</p>
          </div>
          {!open && (
            <button type="button" className={btnP} onClick={() => { setOpen(true); setMsg(null) }}>
              <Plus size={16} aria-hidden /> Post
            </button>
          )}
        </div>

        {msg && (
          <p role="status" className={`rounded-xl border p-3 text-sm ${msg.ok ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'}`}>{msg.text}</p>
        )}

        {open && (
          <section aria-label="New post" className="space-y-3 rounded-xl border-2 border-primary/40 bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">New post</p>
              <button type="button" aria-label="Close" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-secondary" onClick={() => setOpen(false)}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Type of post">
              {kinds.map((k) => (
                <button key={k} type="button" className={kind === k ? btnP : btnS} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            <label className="block space-y-1 text-sm font-medium text-foreground">
              Title
              <input className={field} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'poll' ? 'Which day for the clean-up?' : kind === 'meeting' ? 'Residents meeting' : 'Water tank cleaning on Saturday'} />
            </label>
            <label className="block space-y-1 text-sm font-medium text-foreground">
              More details (optional)
              <textarea className={field} rows={3} value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} />
            </label>

            {kind === 'poll' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Choices (2 to 4). The poll closes after 7 days.</p>
                {opts.map((o, i) => (
                  <input key={i} className={field} value={o} maxLength={40} aria-label={`Choice ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Choice ${i + 1}`} />
                ))}
                {opts.length < 4 && (
                  <button type="button" className={btnS} onClick={() => setOpts([...opts, ''])}>Add a choice</button>
                )}
              </div>
            )}

            {kind === 'meeting' && (
              <div className="space-y-2">
                <label className="block space-y-1 text-sm font-medium text-foreground">
                  Date and time
                  <input type="datetime-local" className={field} value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
                </label>
                <label className="block space-y-1 text-sm font-medium text-foreground">
                  Meeting link (optional, must start with https://)
                  <input className={field} value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." inputMode="url" />
                </label>
              </div>
            )}

            <button type="button" className={`${btnP} w-full`} disabled={busy || title.trim().length < 3} onClick={() => void submit()}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null} Post to the board
            </button>
          </section>
        )}

        {posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nobody don post anything yet. Be the first.
          </p>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => {
              const total = (p.counts ?? []).reduce((a, b) => a + b, 0)
              const past = p.kind === 'meeting' && p.meeting_at ? new Date(p.meeting_at).getTime() < Date.now() : false
              const Icon = p.kind === 'poll' ? BarChart3 : p.kind === 'meeting' ? CalendarClock : Megaphone
              return (
                <li key={p.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-primary">
                      <Icon size={14} aria-hidden /> {KIND_LABEL[p.kind]}
                    </span>
                    <span>{p.author} · {timeAgo(p.created_at)}</span>
                  </div>
                  <p className="text-base font-bold text-foreground">{p.title}</p>
                  {p.body && <p className="whitespace-pre-wrap text-sm text-foreground">{p.body}</p>}

                  {p.kind === 'meeting' && p.meeting_at && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">{when(p.meeting_at)}{past ? ' (done)' : ''}</p>
                      {p.meeting_link && !past && (
                        <a href={p.meeting_link} target="_blank" rel="noopener noreferrer" className={btnS}>Join the meeting</a>
                      )}
                    </div>
                  )}

                  {p.kind === 'poll' && p.options && (
                    <div className="space-y-2">
                      {p.options.map((o, i) => {
                        const c = p.counts?.[i] ?? 0
                        const pct = total > 0 ? Math.round((c / total) * 100) : 0
                        const mine = p.my_vote === i
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={busy || p.closed}
                            onClick={() => void vote(p.id, i)}
                            aria-pressed={mine}
                            className={`relative flex min-h-11 w-full items-center justify-between gap-2 overflow-hidden rounded-lg border px-3 text-left text-sm font-medium text-foreground disabled:opacity-70 ${mine ? 'border-primary' : 'border-border'}`}
                          >
                            <span aria-hidden className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />
                            <span className="relative">{mine ? '✓ ' : ''}{o}</span>
                            <span className="relative text-xs text-muted-foreground">{c} · {pct}%</span>
                          </button>
                        )
                      })}
                      <p className="text-xs text-muted-foreground">{total} {total === 1 ? 'vote' : 'votes'} · {p.closed ? 'Closed' : 'You can change your vote until it closes.'}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4">
                    {!p.mine && (
                      <button type="button" className="min-h-11 text-xs font-semibold text-muted-foreground hover:underline" onClick={() => void report(p.id)}>Report</button>
                    )}
                    {p.can_hide && (
                      <button type="button" className="min-h-11 text-xs font-semibold text-danger hover:underline" onClick={() => void remove(p.id)}>Remove</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
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
          {content}
        </div>
      </main>
      <Footer />
    </div>
  )
}
