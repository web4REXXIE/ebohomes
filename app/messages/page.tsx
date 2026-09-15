'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Send, ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  role: string | null
  avatar_url: string | null
}

type Message = {
  id: string
  listing_id: string | null
  sender_id: string
  receiver_id: string
  message: string
  created_at: string
  read_at: string | null
  flagged?: boolean
}

type Conversation = {
  partnerId: string
  partner: Profile | null
  lastMessage: Message
  unreadCount: number
}

function MessagesInner() {
  const searchParams = useSearchParams()
  const startTo = searchParams.get('to')
  const startListing = searchParams.get('listing')

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null)
  const [thread, setThread] = useState<Message[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({})
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingListingId = useRef<string | null>(startListing)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)
    await loadConversations(user.id)

    if (startTo && startTo !== 'undefined') {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url')
        .eq('id', startTo)
        .single()
      if (p) setProfilesById((prev) => ({ ...prev, [p.id]: p }))
      openConversation(startTo, user.id)
      setMobileView('thread')
    }
  }

  async function loadConversations(userId: string) {
    setLoadingConvos(true)
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (error || !msgs) { setLoadingConvos(false); return }

    const byPartner = new Map<string, Message[]>()
    for (const m of msgs) {
      const partnerId = m.sender_id === userId ? m.receiver_id : m.sender_id
      if (!byPartner.has(partnerId)) byPartner.set(partnerId, [])
      byPartner.get(partnerId)!.push(m)
    }

    const partnerIds = Array.from(byPartner.keys())
    let profileMap: Record<string, Profile> = {}
    if (partnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name, role, avatar_url').in('id', partnerIds)
      profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
    }
    setProfilesById((prev) => ({ ...prev, ...profileMap }))

    const convos: Conversation[] = partnerIds.map((partnerId) => {
      const list = byPartner.get(partnerId)!
      const unreadCount = list.filter((m) => m.receiver_id === userId && !m.read_at).length
      return { partnerId, partner: profileMap[partnerId] ?? null, lastMessage: list[0], unreadCount }
    })
    convos.sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime())
    setConversations(convos)
    setLoadingConvos(false)
  }

  async function openConversation(partnerId: string, userId?: string) {
    const me = userId ?? currentUserId
    if (!me) return
    setActivePartnerId(partnerId)
    setMobileView('thread')
    setLoadingThread(true)

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${me},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${me})`)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setThread(data)
      const unreadIds = data.filter((m) => m.receiver_id === me && !m.read_at).map((m) => m.id)
      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
        setConversations((prev) => prev.map((c) => (c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c)))
      }
    }
    setLoadingThread(false)
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50)
  }

  const handleIncoming = useCallback((payload: any) => {
  const m: Message = payload.new
  if (!currentUserId) return
  const isMine = m.sender_id === currentUserId || m.receiver_id === currentUserId
  if (!isMine) return
  const partnerId = m.sender_id === currentUserId ? m.receiver_id : m.sender_id

  setActivePartnerId((active) => {
    if (active === partnerId) {
      setThread((prev) => (prev.some((t) => t.id === m.id) ? prev : [...prev, m]))
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
      if (m.receiver_id === currentUserId) {
        supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id)
      }
    }
    return active
  })
  loadConversations(currentUserId)
}, [currentUserId])

useEffect(() => {
  if (!currentUserId) return
  const channel = supabase
    .channel(`messages-realtime-${currentUserId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleIncoming)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [currentUserId, handleIncoming])
  async function handleSend() {
    if (!draft.trim() || !currentUserId || !activePartnerId) return
    setSending(true)
    const body = draft.trim()
    setDraft('')

    const { error } = await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: activePartnerId,
      listing_id: pendingListingId.current,
      message: body,
    })
    pendingListingId.current = null

    if (error) { console.error('Send failed:', error); setDraft(body) }
    setSending(false)
  }

  const activePartner = activePartnerId ? profilesById[activePartnerId] : null
  const filteredConvos = conversations.filter((c) =>
    (c.partner?.full_name ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const isNewEmptyThread = activePartnerId && thread.length === 0

  return (
    <div className="flex h-full">
      {/* Conversation list — hidden on mobile once a thread is open */}
      <div className={`w-full sm:w-80 border-r border-border flex-col shrink-0 ${mobileView === 'thread' ? 'hidden sm:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <h1 className="font-bold text-foreground">Messages</h1>
          <div className="mt-3 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
          ) : filteredConvos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">No conversations yet. Message a landlord from any property page to get started.</p>
          ) : (
            filteredConvos.map((c) => (
              <button key={c.partnerId} onClick={() => openConversation(c.partnerId)}
                className={`w-full text-left px-4 py-3 flex gap-3 items-start border-b border-border/50 hover:bg-secondary/40 ${activePartnerId === c.partnerId ? 'bg-primary/5' : ''}`}>
                <Avatar profile={c.partner} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{c.partner?.full_name ?? 'Landlord'}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.lastMessage.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.lastMessage.message}</p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-1">{c.unreadCount}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread panel */}
      <div className={`flex-col flex-1 min-w-0 ${mobileView === 'list' ? 'hidden sm:flex' : 'flex'}`}>
        {!activePartnerId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a conversation</div>
        ) : (
          <>
            <div className="p-4 border-b border-border flex items-center gap-3">
              <button className="sm:hidden" onClick={() => setMobileView('list')}><ArrowLeft size={18} /></button>
              <Avatar profile={activePartner} />
              <div>
                <p className="text-sm font-semibold text-foreground">{activePartner?.full_name ?? 'Landlord'}</p>
                <p className="text-xs text-primary capitalize">{activePartner?.role ?? ''}</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
              ) : isNewEmptyThread ? (
                <p className="text-sm text-muted-foreground text-center py-8">Send a message to start the conversation.</p>
              ) : (
                thread.map((m) => {
                  const mine = m.sender_id === currentUserId
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-secondary text-foreground rounded-bl-sm'}`}>
                        <p>{m.message}</p>
                        <p className={`text-[10px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatTime(m.created_at)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-3 border-t border-border flex items-center gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                placeholder="Type a message..."
                className="flex-1 h-10 px-3 rounded-full border border-border bg-background text-sm" />
              <button onClick={handleSend} disabled={sending || !draft.trim()}
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

function Avatar({ profile }: { profile: Profile | null }) {
  if (profile?.avatar_url) return <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
  const initial = profile?.full_name?.[0]?.toUpperCase() ?? '?'
  return <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">{initial}</div>
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
      <MessagesInner />
    </Suspense>
  )
}