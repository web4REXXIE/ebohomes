'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, ArrowLeft, Loader2, Share2, Eye, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  CATEGORY_LABELS, THREAD_COLUMNS, MESSAGE_COLUMNS, formatTime,
  type SupportThread, type SupportMessage, type SupportStatus,
} from '@/lib/support'

type Person = { id: string; full_name: string | null; role: string | null; phone: string | null }

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-primary/10 text-primary',
  pending: 'bg-amber-100 text-amber-700',
  closed: 'bg-secondary text-muted-foreground',
}

type Filter = 'needs_reply' | 'all' | 'tenants' | 'landlords' | 'closed'

function AdminSupportInner() {
  const searchParams = useSearchParams()
  const [uid, setUid] = useState<string | null>(null)
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<Filter>('needs_reply')
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [originals, setOriginals] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')
  const [listingTitle, setListingTitle] = useState<string | null>(null)
  const [relayFrom, setRelayFrom] = useState<SupportMessage | null>(null)
  const [relayText, setRelayText] = useState('')
  const [relayNote, setRelayNote] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)

  const active = threads.find((t) => t.id === activeId) ?? null
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  const scrollDown = () =>
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)

  const loadThreads = useCallback(async () => {
    const { data } = await supabase
      .from('support_threads').select(THREAD_COLUMNS)
      .order('last_message_at', { ascending: false }).limit(300)
    const list = (data as SupportThread[]) ?? []
    setThreads(list)

    const ids = [...new Set(list.map((t) => t.customer_id))]
    if (ids.length) {
      const { data: ps } = await supabase
        .from('profiles').select('id, full_name, role, phone').in('id', ids)
      setPeople((prev) => ({ ...prev, ...Object.fromEntries((ps ?? []).map((p) => [p.id, p as Person])) }))
    }
    const { data: u } = await supabase
      .from('support_messages').select('thread_id').eq('sender_kind', 'customer').is('read_at', null)
    const counts: Record<string, number> = {}
    for (const r of u ?? []) counts[r.thread_id] = (counts[r.thread_id] ?? 0) + 1
    setUnread(counts)
  }, [])

  const openThread = useCallback(async (id: string) => {
    setActiveId(id)
    setMobileView('thread')
    setError(null)
    setRelayFrom(null)
    setRelayNote(null)
    setRevealed({})
    const { data } = await supabase
      .from('support_messages').select(MESSAGE_COLUMNS)
      .eq('thread_id', id).order('created_at', { ascending: true })
    const list = (data as SupportMessage[]) ?? []
    setMessages(list)
    scrollDown()

    const flaggedIds = list.filter((m) => m.flagged).map((m) => m.id)
    if (flaggedIds.length) {
      const { data: o } = await supabase
        .from('support_message_originals').select('message_id, original').in('message_id', flaggedIds)
      setOriginals(Object.fromEntries((o ?? []).map((r) => [r.message_id, r.original])))
    } else {
      setOriginals({})
    }

    const unreadIds = list.filter((m) => m.sender_kind === 'customer' && !m.read_at).map((m) => m.id)
    if (unreadIds.length) {
      await supabase.from('support_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      setUnread((prev) => ({ ...prev, [id]: 0 }))
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUid(user.id)
      await loadThreads()
      setLoading(false)
      const t = searchParams.get('thread')
      if (t) void openThread(t)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setListingTitle(null)
    if (!active?.listing_id) return
    supabase.from('listings').select('title').eq('id', active.listing_id).maybeSingle()
      .then(({ data }) => setListingTitle(data?.title ?? null))
  }, [active?.listing_id])

  useEffect(() => {
    const channel = supabase
      .channel('support-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const m = payload.new as SupportMessage
        if (m.thread_id === activeIdRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          scrollDown()
          if (m.sender_kind === 'customer') {
            void supabase.from('support_messages').update({ read_at: new Date().toISOString() }).eq('id', m.id)
          }
        }
        void loadThreads()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_threads' }, () => { void loadThreads() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadThreads])

  async function handleSend() {
    const body = draft.trim()
    if (!body || !uid || !activeId || sending) return
    setSending(true); setError(null); setDraft('')
    const { error: err } = await supabase
      .from('support_messages').insert({ thread_id: activeId, sender_id: uid, message: body })
    if (err) { setError(err.message); setDraft(body) } else { await openThread(activeId); await loadThreads() }
    setSending(false)
  }

  async function setStatus(status: SupportStatus) {
    if (!activeId) return
    const { error: err } = await supabase.from('support_threads').update({ status }).eq('id', activeId)
    if (err) setError(err.message); else await loadThreads()
  }

  async function assignToMe() {
    if (!activeId || !uid) return
    const { error: err } = await supabase.from('support_threads').update({ assigned_to: uid }).eq('id', activeId)
    if (err) setError(err.message); else await loadThreads()
  }

  // Find the other party for the thread's application or listing.
  async function findCounterpart(t: SupportThread): Promise<string | null> {
    if (t.application_id) {
      const { data } = await supabase
        .from('applications').select('tenant_id, landlord_id').eq('id', t.application_id).maybeSingle()
      if (data) return t.customer_role === 'tenant' ? data.landlord_id : data.tenant_id
    }
    if (t.listing_id && t.customer_role === 'tenant') {
      const { data } = await supabase.from('listings').select('landlord_id').eq('id', t.listing_id).maybeSingle()
      return data?.landlord_id ?? null
    }
    return null
  }

  async function sendRelay() {
    if (!active || !uid || !relayFrom) return
    const text = relayText.trim()
    if (!text) return
    setSending(true); setError(null); setRelayNote(null)
    try {
      const other = await findCounterpart(active)
      if (!other) {
        setError('No other party found. Link this conversation to an application or a listing first.')
        return
      }
      let q = supabase.from('support_threads').select('id').eq('customer_id', other).neq('status', 'closed')
      q = active.application_id ? q.eq('application_id', active.application_id) : q.eq('listing_id', active.listing_id!)
      const { data: existing } = await q.order('last_message_at', { ascending: false }).limit(1)
      let targetId = existing?.[0]?.id as string | undefined
      if (!targetId) {
        const { data: created, error: cerr } = await supabase
          .from('support_threads')
          .insert({
            customer_id: other,
            category: active.category,
            subject: active.subject,
            listing_id: active.listing_id,
            application_id: active.application_id,
          })
          .select('id').single()
        if (cerr || !created) { setError(cerr?.message ?? 'Could not open a conversation for the other party.'); return }
        targetId = created.id
      }
      const { error: merr } = await supabase.from('support_messages').insert({
        thread_id: targetId, sender_id: uid, message: text, relayed_from_thread_id: active.id,
      })
      if (merr) { setError(merr.message); return }
      setRelayNote('Sent to the other party through EboHomes Support.')
      setRelayFrom(null); setRelayText('')
      await loadThreads()
    } finally {
      setSending(false)
    }
  }

  const visible = threads.filter((t) => {
    if (filter === 'needs_reply') return t.status === 'open'
    if (filter === 'closed') return t.status === 'closed'
    if (filter === 'tenants') return t.customer_role === 'tenant' && t.status !== 'closed'
    if (filter === 'landlords') return t.customer_role === 'landlord' && t.status !== 'closed'
    return true
  })
  const customer = active ? people[active.customer_id] : null

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[500px] -m-4 sm:-m-6">
      <div className={`w-full sm:w-96 border-r border-border flex-col shrink-0 bg-background ${mobileView === 'thread' ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <h1 className="font-bold text-foreground">Support inbox</h1>
          <div className="mt-3 flex flex-wrap gap-1 text-xs font-semibold">
            {([['needs_reply', 'Needs reply'], ['all', 'All'], ['tenants', 'Tenants'], ['landlords', 'Landlords'], ['closed', 'Closed']] as [Filter, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`h-8 px-3 rounded-full ${filter === k ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nothing here.</p>
          ) : visible.map((t) => (
            <button key={t.id} onClick={() => openThread(t.id)}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/40 ${activeId === t.id ? 'bg-primary/5' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground truncate">{people[t.customer_id]?.full_name ?? 'Customer'}</p>
                {(unread[t.id] ?? 0) > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">{unread[t.id]}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded-full bg-secondary capitalize">{t.customer_role}</span>
                <span className="px-2 py-0.5 rounded-full bg-secondary">{CATEGORY_LABELS[t.category]}</span>
                <span className={`px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                <span className="text-muted-foreground ml-auto">{formatTime(t.last_message_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-col flex-1 min-w-0 bg-background ${mobileView === 'list' ? 'hidden sm:flex' : 'flex'}`}>
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a conversation</div>
        ) : (
          <>
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <button className="sm:hidden" onClick={() => setMobileView('list')} aria-label="Back"><ArrowLeft size={18} /></button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {customer?.full_name ?? 'Customer'} <span className="text-xs font-normal text-muted-foreground capitalize">· {active.customer_role}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {CATEGORY_LABELS[active.category]}: {active.subject}
                    {listingTitle ? ` · ${listingTitle}` : ''}
                  </p>
                </div>
                <select value={active.status} onChange={(e) => void setStatus(e.target.value as SupportStatus)}
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs">
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                {customer?.phone && <span>Staff only: {customer.phone}</span>}
                {active.assigned_to === uid ? <span>Assigned to you</span> :
                  <button onClick={() => void assignToMe()} className="underline">Assign to me</button>}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const fromCustomer = m.sender_kind === 'customer'
                const orig = originals[m.id]
                return (
                  <div key={m.id} className={`flex ${fromCustomer ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${fromCustomer ? 'bg-secondary text-foreground rounded-bl-sm' : 'bg-primary text-primary-foreground rounded-br-sm'}`}>
                      {m.relayed_from_thread_id && <p className="text-[10px] opacity-70 mb-0.5">Relayed</p>}
                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                      {m.flagged && (
                        <div className="mt-1 text-[11px] text-amber-700 flex items-center gap-1">
                          <AlertTriangle size={11} /> Contact details hidden
                          {orig && (
                            <button className="ml-1 underline inline-flex items-center gap-0.5"
                              onClick={() => setRevealed((r) => ({ ...r, [m.id]: !r[m.id] }))}>
                              <Eye size={11} /> {revealed[m.id] ? 'Hide' : 'Show original'}
                            </button>
                          )}
                        </div>
                      )}
                      {revealed[m.id] && orig && (
                        <p className="mt-1 rounded bg-background/80 text-foreground px-2 py-1 text-xs whitespace-pre-wrap">{orig}</p>
                      )}
                      <div className={`mt-1 flex items-center gap-2 text-[10px] ${fromCustomer ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                        <span>{formatTime(m.created_at)}</span>
                        {fromCustomer && !m.flagged && (
                          <button className="inline-flex items-center gap-0.5 underline"
                            onClick={() => { setRelayFrom(m); setRelayText(m.message); setRelayNote(null) }}>
                            <Share2 size={10} /> Relay
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {relayFrom && (
              <div className="border-t border-border p-3 bg-secondary/40 space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  Relay to the {active.customer_role === 'tenant' ? 'landlord' : 'tenant'} (edit first; no phone numbers or emails)
                </p>
                <textarea value={relayText} onChange={(e) => setRelayText(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => void sendRelay()} disabled={sending || !relayText.trim()}
                    className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">Send relay</button>
                  <button onClick={() => setRelayFrom(null)} className="h-9 px-4 rounded-full bg-secondary text-xs font-semibold">Cancel</button>
                </div>
              </div>
            )}
            {relayNote && <p className="px-4 py-1 text-xs text-green-700">{relayNote}</p>}
            {error && <p className="px-4 py-1 text-xs text-red-600">{error}</p>}

            <div className="p-3 border-t border-border flex items-center gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
                placeholder="Reply as EboHomes Support…"
                className="flex-1 h-10 px-3 rounded-full border border-border bg-background text-sm" />
              <button onClick={() => void handleSend()} disabled={sending || !draft.trim()} aria-label="Send"
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
      <AdminSupportInner />
    </Suspense>
  )
}