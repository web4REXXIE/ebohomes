'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, ArrowLeft, Loader2, Plus, ShieldCheck, Lock, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchTenantNames } from '@/lib/tenant-names'
import { useNotifications } from '@/components/notification-provider'
import {
  CATEGORY_LABELS, TENANT_CATEGORIES, LANDLORD_CATEGORIES, THREAD_COLUMNS, MESSAGE_COLUMNS,
  formatTime,
  type SupportCategory, type SupportThread, type SupportMessage,
} from '@/lib/support'

type Role = 'tenant' | 'landlord'

type ContextOption = { id: string; label: string }

type LegacyMessage = {
  id: string
  sender_id: string
  receiver_id: string
  message: string
  created_at: string
  read_at: string | null
}

type LegacyConversation = {
  partnerId: string
  name: string
  last: LegacyMessage
  unread: number
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-primary/10 text-primary',
  pending: 'bg-amber-100 text-amber-700',
  closed: 'bg-secondary text-muted-foreground',
}

function InboxInner({
  role,
  topOffset,
  noTopOffsetOnDesktop,
}: {
  role: Role
  topOffset: string
  noTopOffsetOnDesktop: boolean
}) {
  const searchParams = useSearchParams()
  const { markMessageNotificationsRead, setActiveConversation } = useNotifications()

  const [uid, setUid] = useState<string | null>(null)
  const [tab, setTab] = useState<'support' | 'past'>('support')
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)

  // new conversation form
  const [composing, setComposing] = useState(false)
  const [newCategory, setNewCategory] = useState<SupportCategory>('general')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newListing, setNewListing] = useState('')
  const [newApplication, setNewApplication] = useState('')
  const [newTenancy, setNewTenancy] = useState('')
  const [listingOptions, setListingOptions] = useState<ContextOption[]>([])
  const [applicationOptions, setApplicationOptions] = useState<ContextOption[]>([])
  const [tenancyOptions, setTenancyOptions] = useState<ContextOption[]>([])
  const [creating, setCreating] = useState(false)

  // past (read-only) conversations
  const [legacy, setLegacy] = useState<LegacyConversation[]>([])
  const [legacyActive, setLegacyActive] = useState<LegacyConversation | null>(null)
  const [legacyThread, setLegacyThread] = useState<LegacyMessage[]>([])

  const categories = role === 'landlord' ? LANDLORD_CATEGORIES : TENANT_CATEGORIES
  const active = threads.find((t) => t.id === activeId) ?? null

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const scrollDown = () =>
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)

  const loadThreads = useCallback(async (userId: string) => {
    const { data: t } = await supabase
      .from('support_threads')
      .select(THREAD_COLUMNS)
      .eq('customer_id', userId)
      .order('last_message_at', { ascending: false })
    setThreads((t as SupportThread[]) ?? [])

    const { data: unread } = await supabase
      .from('support_messages')
      .select('thread_id')
      .eq('sender_kind', 'staff')
      .is('read_at', null)
    const counts: Record<string, number> = {}
    for (const r of unread ?? []) counts[r.thread_id] = (counts[r.thread_id] ?? 0) + 1
    setUnreadByThread(counts)
  }, [])

  const loadContextOptions = useCallback(async (userId: string) => {
    const appCol = role === 'landlord' ? 'landlord_id' : 'tenant_id'
    const { data: apps } = await supabase
      .from('applications').select('id, listing_id, status').eq(appCol, userId)
      .order('created_at', { ascending: false }).limit(50)

    let tens: { id: string; listing_id: string }[] = []
    if (role === 'tenant') {
      const { data } = await supabase
        .from('tenancies').select('id, listing_id').eq('tenant_id', userId).limit(50)
      tens = (data as typeof tens) ?? []
    }

    let ownListings: { id: string; title: string | null }[] = []
    if (role === 'landlord') {
      const { data } = await supabase
        .from('listings').select('id, title').eq('landlord_id', userId).limit(100)
      ownListings = (data as typeof ownListings) ?? []
      const ids = ownListings.map((l) => l.id)
      if (ids.length) {
        const { data: tdata } = await supabase
          .from('tenancies').select('id, listing_id').in('listing_id', ids).limit(100)
        tens = (tdata as typeof tens) ?? []
      }
    }

    const wanted = new Set<string>()
    for (const a of apps ?? []) if (a.listing_id) wanted.add(a.listing_id)
    for (const x of tens) if (x.listing_id) wanted.add(x.listing_id)
    const titles: Record<string, string> = {}
    for (const l of ownListings) titles[l.id] = l.title ?? 'Property'
    const missing = [...wanted].filter((id) => !titles[id])
    if (missing.length) {
      const { data } = await supabase.from('listings').select('id, title').in('id', missing)
      for (const l of data ?? []) titles[l.id] = l.title ?? 'Property'
    }
    const name = (id: string) => titles[id] ?? 'Property'

    setApplicationOptions((apps ?? []).map((a) => ({
      id: a.id, label: `${name(a.listing_id)} (${String(a.status ?? '').replace('_', ' ')})`,
    })))
    setTenancyOptions(tens.map((x) => ({ id: x.id, label: name(x.listing_id) })))
    if (role === 'landlord') setListingOptions(ownListings.map((l) => ({ id: l.id, label: l.title ?? 'Property' })))
  }, [role])

  const loadLegacy = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, message, created_at, read_at')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
    const rows = (data as LegacyMessage[]) ?? []
    const byPartner = new Map<string, LegacyMessage[]>()
    for (const m of rows) {
      const p = m.sender_id === userId ? m.receiver_id : m.sender_id
      if (!byPartner.has(p)) byPartner.set(p, [])
      byPartner.get(p)!.push(m)
    }
    const ids = [...byPartner.keys()]
    const names: Record<string, string> = {}
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      for (const p of ps ?? []) names[p.id] = p.full_name ?? 'User'
      const missing = ids.filter((id) => !names[id])
      if (missing.length) Object.assign(names, await fetchTenantNames(missing))
    }
    setLegacy(ids.map((p) => {
      const list = byPartner.get(p)!
      return {
        partnerId: p,
        name: names[p] ?? 'User',
        last: list[0],
        unread: list.filter((m) => m.receiver_id === userId && !m.read_at).length,
      }
    }))
  }, [])

  const openThread = useCallback(async (id: string) => {
    setActiveId(id)
    setComposing(false)
    setMobileView('thread')
    setLoadingThread(true)
    setError(null)
    const { data } = await supabase
      .from('support_messages')
      .select(MESSAGE_COLUMNS)
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
    const list = (data as SupportMessage[]) ?? []
    setMessages(list)
    setLoadingThread(false)
    scrollDown()

    const unreadIds = list.filter((m) => m.sender_kind === 'staff' && !m.read_at).map((m) => m.id)
    if (unreadIds.length) {
      await supabase.from('support_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      setUnreadByThread((prev) => ({ ...prev, [id]: 0 }))
    }
    void markMessageNotificationsRead(id)
  }, [markMessageNotificationsRead])

  // ---- first load ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      setUid(user.id)
      await Promise.all([loadThreads(user.id), loadLegacy(user.id), loadContextOptions(user.id)])
      if (cancelled) return
      setLoading(false)

      const threadParam = searchParams.get('thread')
      if (threadParam) {
        void openThread(threadParam)
      } else if (searchParams.get('new')) {
        const cat = searchParams.get('category') as SupportCategory | null
        if (cat && cat in CATEGORY_LABELS) setNewCategory(cat)
        setNewSubject(searchParams.get('subject') ?? '')
        setNewListing(searchParams.get('listing') ?? '')
        setNewApplication(searchParams.get('application') ?? '')
        setNewTenancy(searchParams.get('tenancy') ?? '')
        setComposing(true)
        setMobileView('thread')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setActiveConversation(activeId)
    return () => setActiveConversation(null)
  }, [activeId, setActiveConversation])

  // ---- live updates ----
  useEffect(() => {
    if (!uid) return
    const channel = supabase
      .channel(`support-customer-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const m = payload.new as SupportMessage
        if (m.thread_id === activeIdRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          scrollDown()
          if (m.sender_kind === 'staff') {
            void supabase.from('support_messages').update({ read_at: new Date().toISOString() }).eq('id', m.id)
          }
        }
        void loadThreads(uid)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [uid, loadThreads])

  async function handleSend() {
    const body = draft.trim()
    if (!body || !uid || !activeId || sending) return
    setSending(true)
    setError(null)
    setDraft('')
    const { error: err } = await supabase
      .from('support_messages')
      .insert({ thread_id: activeId, sender_id: uid, message: body })
    if (err) {
      setError(err.message)
      setDraft(body)
    } else {
      // realtime may be slow; make sure it shows
      const { data } = await supabase
        .from('support_messages').select(MESSAGE_COLUMNS).eq('thread_id', activeId).order('created_at', { ascending: true })
      setMessages((data as SupportMessage[]) ?? [])
      scrollDown()
      void loadThreads(uid)
    }
    setSending(false)
  }

  async function handleCreate() {
    if (!uid || creating) return
    const subject = newSubject.trim()
    const body = newBody.trim()
    if (!subject || !body) { setError('Please add a subject and a message.'); return }
    setCreating(true)
    setError(null)

    const { data: t, error: terr } = await supabase
      .from('support_threads')
      .insert({
        customer_id: uid,
        category: newCategory,
        subject,
        listing_id: newListing || null,
        application_id: newApplication || null,
        tenancy_id: newTenancy || null,
      })
      .select(THREAD_COLUMNS)
      .single()

    if (terr || !t) {
      setError(terr?.message ?? 'Could not start the conversation.')
      setCreating(false)
      return
    }
    const { error: merr } = await supabase
      .from('support_messages').insert({ thread_id: t.id, sender_id: uid, message: body })
    if (merr) setError(merr.message)

    setNewSubject(''); setNewBody(''); setNewListing(''); setNewApplication(''); setNewTenancy('')
    await loadThreads(uid)
    setCreating(false)
    await openThread(t.id)
  }

  async function openLegacy(c: LegacyConversation) {
    if (!uid) return
    setLegacyActive(c)
    setMobileView('thread')
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, message, created_at, read_at')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${c.partnerId}),and(sender_id.eq.${c.partnerId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
    const list = (data as LegacyMessage[]) ?? []
    setLegacyThread(list)
    const unreadIds = list.filter((m) => m.receiver_id === uid && !m.read_at).map((m) => m.id)
    if (unreadIds.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      setLegacy((prev) => prev.map((x) => (x.partnerId === c.partnerId ? { ...x, unread: 0 } : x)))
    }
    scrollDown()
  }

  const totalUnreadSupport = Object.values(unreadByThread).reduce((a, b) => a + b, 0)
  const totalUnreadPast = legacy.reduce((a, c) => a + c.unread, 0)
  const showRightPanel = mobileView === 'thread'

  return (
    // dvh = the visible screen height on phones (100vh is taller than the visible area).
    // The bottom padding keeps the message box above the mobile bottom menu.
    <div
      className={`flex min-h-[420px] h-[calc(100dvh-var(--inbox-top))] overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 ${noTopOffsetOnDesktop ? 'lg:[--inbox-top:0px]' : ''}`}
      style={{ '--inbox-top': topOffset } as React.CSSProperties}
    >
      {/* left list */}
      <div className={`w-full sm:w-80 border-r border-border flex-col shrink-0 ${showRightPanel ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-bold text-foreground">Messages</h1>
            <button
              onClick={() => { setComposing(true); setActiveId(null); setLegacyActive(null); setTab('support'); setMobileView('thread'); setError(null) }}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
            >
              <Plus size={14} /> New
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 text-xs font-semibold">
            <button onClick={() => setTab('support')}
              className={`h-8 rounded-md ${tab === 'support' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              EboHomes Support{totalUnreadSupport > 0 ? ` (${totalUnreadSupport})` : ''}
            </button>
            <button onClick={() => setTab('past')}
              className={`h-8 rounded-md ${tab === 'past' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              Past chats{totalUnreadPast > 0 ? ` (${totalUnreadPast})` : ''}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
          ) : tab === 'support' ? (
            threads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">
                No conversations yet. Tap <b>New</b> to ask EboHomes about a property, viewing, application, payment or anything else.
              </p>
            ) : threads.map((t) => (
              <button key={t.id} onClick={() => openThread(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/40 ${activeId === t.id ? 'bg-primary/5' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{t.subject}</p>
                  {(unreadByThread[t.id] ?? 0) > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center shrink-0">
                      {unreadByThread[t.id]}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">{CATEGORY_LABELS[t.category]}</span>
                  <span className={`px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                  <span className="text-muted-foreground ml-auto">{formatTime(t.last_message_at)}</span>
                </div>
              </button>
            ))
          ) : legacy.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">No past conversations.</p>
          ) : legacy.map((c) => (
            <button key={c.partnerId} onClick={() => openLegacy(c)}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/40 ${legacyActive?.partnerId === c.partnerId ? 'bg-primary/5' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.last.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.last.message}</p>
              {c.unread > 0 && <span className="text-[10px] font-bold text-primary">{c.unread} unread</span>}
            </button>
          ))}
        </div>
      </div>

      {/* right panel */}
      <div className={`flex-col flex-1 min-w-0 ${showRightPanel ? 'flex' : 'hidden sm:flex'}`}>
        {composing ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center gap-3">
              <button className="sm:hidden" onClick={() => setMobileView('list')} aria-label="Back"><ArrowLeft size={18} /></button>
              <p className="text-sm font-semibold text-foreground">New conversation with EboHomes</p>
            </div>
            <div className="p-4 pb-24 space-y-4 max-w-xl">
              <div className="flex gap-2 rounded-lg bg-primary/5 p-3 text-xs text-foreground">
                <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
                <p>EboHomes handles your {role === 'landlord' ? 'tenant' : 'landlord'} communication for you. Start one conversation per topic so nothing gets mixed up.</p>
              </div>
              <label className="block text-xs font-semibold text-foreground">Topic
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as SupportCategory)}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-normal">
                  {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-foreground">Subject
                <input value={newSubject} maxLength={120} onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Viewing for the 2-bedroom flat"
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-normal" />
              </label>
              {applicationOptions.length > 0 && (
                <label className="block text-xs font-semibold text-foreground">Related application (optional)
                  <select value={newApplication} onChange={(e) => setNewApplication(e.target.value)}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-normal">
                    <option value="">None</option>
                    {applicationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              )}
              {tenancyOptions.length > 0 && (
                <label className="block text-xs font-semibold text-foreground">Related tenancy (optional)
                  <select value={newTenancy} onChange={(e) => setNewTenancy(e.target.value)}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-normal">
                    <option value="">None</option>
                    {tenancyOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              )}
              {listingOptions.length > 0 && (
                <label className="block text-xs font-semibold text-foreground">Related listing (optional)
                  <select value={newListing} onChange={(e) => setNewListing(e.target.value)}
                    className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-normal">
                    <option value="">None</option>
                    {listingOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              )}
              {role === 'tenant' && newListing && (
                <p className="text-xs text-muted-foreground">This conversation is about the property you were viewing.</p>
              )}
              <label className="block text-xs font-semibold text-foreground">Message
                <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={5} maxLength={4000}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-normal" />
              </label>
              <p className="text-[11px] text-muted-foreground flex gap-1"><Info size={12} className="shrink-0 mt-0.5" />
                Please don’t share phone numbers or emails. Messages that contain them are hidden.</p>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={handleCreate} disabled={creating}
                className="w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />} Send to EboHomes
              </button>
            </div>
          </div>
        ) : tab === 'past' && legacyActive ? (
          <>
            <div className="p-4 border-b border-border flex items-center gap-3">
              <button className="sm:hidden" onClick={() => setMobileView('list')} aria-label="Back"><ArrowLeft size={18} /></button>
              <div>
                <p className="text-sm font-semibold text-foreground">{legacyActive.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Lock size={11} /> Past conversation, read only</p>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {legacyThread.map((m) => {
                const mine = m.sender_id === uid
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-foreground rounded-bl-sm'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                      <p className={`text-[10px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatTime(m.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
              New messages go through EboHomes Support. Tap <b>New</b> to start a conversation.
            </div>
          </>
        ) : tab === 'support' && active ? (
          <>
            <div className="p-4 border-b border-border flex items-center gap-3">
              <button className="sm:hidden" onClick={() => setMobileView('list')} aria-label="Back"><ArrowLeft size={18} /></button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{active.subject}</p>
                <p className="text-xs text-muted-foreground">
                  EboHomes Support · {CATEGORY_LABELS[active.category]} · <span className="capitalize">{active.status}</span>
                </p>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
              ) : messages.map((m) => {
                const mine = m.sender_kind === 'customer'
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-foreground rounded-bl-sm'}`}>
                      {!mine && <p className="text-[10px] font-semibold text-primary mb-0.5">EboHomes Support</p>}
                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                      <p className={`text-[10px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatTime(m.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}
            {/* Right padding leaves room for the floating help (?) button so it never covers Send */}
            <div className="shrink-0 py-3 pl-3 pr-[4.75rem] border-t border-border bg-background flex items-center gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
                placeholder={active.status === 'closed' ? 'Reply to reopen this conversation…' : 'Type a message…'}
                className="flex-1 min-w-0 h-11 px-4 rounded-full border border-border bg-background text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <button onClick={() => void handleSend()} disabled={sending || !draft.trim()} aria-label="Send"
                className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
            Select a conversation, or tap New to contact EboHomes.
          </div>
        )}
      </div>
    </div>
  )
}

// topOffset = height of the header above the inbox (so the inbox fills the rest of the screen).
// noTopOffsetOnDesktop = true when that header only exists on phones (the landlord dashboard).
export default function SupportInbox({
  role,
  topOffset = '3.5rem',
  noTopOffsetOnDesktop = false,
}: {
  role: Role
  topOffset?: string
  noTopOffsetOnDesktop?: boolean
}) {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
      <InboxInner role={role} topOffset={topOffset} noTopOffsetOnDesktop={noTopOffsetOnDesktop} />
    </Suspense>
  )
}