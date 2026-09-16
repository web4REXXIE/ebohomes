'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Search, ArrowLeft, Loader2, Trash2, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  role: string | null
  avatar_url: string | null
  phone: string | null
}

type Message = {
  id: string
  listing_id: string | null
  sender_id: string
  receiver_id: string
  message: string
  created_at: string
  read_at: string | null
}

type Conversation = {
  key: string
  userA: string
  userB: string
  messages: Message[]
  lastMessage: Message
  unreadCount: number
}

type Tab = 'all' | 'unread' | 'landlords' | 'tenants'

type PendingDelete =
  | { type: 'message'; id: string; preview: string }
  | { type: 'conversation'; conversation: Conversation; label: string }
  | null

export default function AdminMessagesPage() {
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !msgs) { setLoading(false); return }
    setAllMessages(msgs)

    const userIds = Array.from(new Set(msgs.flatMap((m) => [m.sender_id, m.receiver_id])))
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, phone')
        .in('id', userIds)
      setProfilesById(Object.fromEntries((profiles ?? []).map((p) => [p.id, p])))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const conversationsByKey = new Map<string, Conversation>()
  for (const m of allMessages) {
    const pair = [m.sender_id, m.receiver_id].sort()
    const key = pair.join('::')
    if (!conversationsByKey.has(key)) {
      conversationsByKey.set(key, {
        key, userA: pair[0], userB: pair[1], messages: [], lastMessage: m, unreadCount: 0,
      })
    }
    const convo = conversationsByKey.get(key)!
    convo.messages.push(m)
    if (!m.read_at) convo.unreadCount += 1
  }
  const conversations = Array.from(conversationsByKey.values())
  conversations.forEach((c) => {
    c.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    c.lastMessage = c.messages[c.messages.length - 1]
  })
  conversations.sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime())

  function participantsOf(c: Conversation) {
    return [profilesById[c.userA], profilesById[c.userB]]
  }

  const filtered = conversations.filter((c) => {
    const [pA, pB] = participantsOf(c)
    if (tab === 'unread' && c.unreadCount === 0) return false
    if (tab === 'landlords' && pA?.role !== 'landlord' && pB?.role !== 'landlord') return false
    if (tab === 'tenants' && pA?.role !== 'tenant' && pB?.role !== 'tenant') return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const names = `${pA?.full_name ?? ''} ${pB?.full_name ?? ''}`.toLowerCase()
      if (!names.includes(q)) return false
    }
    return true
  })

  const active = conversations.find((c) => c.key === activeKey) ?? filtered[0]
  const [activeA, activeB] = active ? participantsOf(active) : [null, null]

  const counts = {
    all: conversations.length,
    unread: conversations.filter((c) => c.unreadCount > 0).length,
    landlords: conversations.filter((c) => {
      const [a, b] = participantsOf(c)
      return a?.role === 'landlord' || b?.role === 'landlord'
    }).length,
    tenants: conversations.filter((c) => {
      const [a, b] = participantsOf(c)
      return a?.role === 'tenant' || b?.role === 'tenant'
    }).length,
  }

  function requestDeleteMessage(m: Message) {
    setDeleteError(null)
    setPendingDelete({ type: 'message', id: m.id, preview: m.message })
  }

  function requestDeleteConversation(c: Conversation) {
    setDeleteError(null)
    const [pA, pB] = participantsOf(c)
    setPendingDelete({
      type: 'conversation',
      conversation: c,
      label: `${pA?.full_name ?? 'Unknown'} ↔ ${pB?.full_name ?? 'Unknown'}`,
    })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)

    if (pendingDelete.type === 'message') {
      const { error, count } = await supabase
        .from('messages')
        .delete({ count: 'exact' })
        .eq('id', pendingDelete.id)

      if (error) {
        setDeleteError(error.message)
      } else if (count === 0) {
        setDeleteError("Delete was blocked — you don't have permission to remove this message (check RLS policies).")
      } else {
        setAllMessages((prev) => prev.filter((m) => m.id !== pendingDelete.id))
        setPendingDelete(null)
      }
    } else {
      const ids = pendingDelete.conversation.messages.map((m) => m.id)
      const { error, count } = await supabase
        .from('messages')
        .delete({ count: 'exact' })
        .in('id', ids)

      if (error) {
        setDeleteError(error.message)
      } else if (count === 0) {
        setDeleteError("Delete was blocked — you don't have permission to remove these messages (check RLS policies).")
      } else if (count < ids.length) {
        // partial delete: some rows removed, some blocked
        setAllMessages((prev) => prev.filter((m) => !ids.includes(m.id)))
        setActiveKey(null)
        setMobileView('list')
        setDeleteError(`Only ${count} of ${ids.length} messages were deleted — some were blocked by permissions.`)
      } else {
        setAllMessages((prev) => prev.filter((m) => !ids.includes(m.id)))
        setActiveKey(null)
        setMobileView('list')
        setPendingDelete(null)
      }
    }

    setDeleting(false)
  }

  function Avatar({ profile }: { profile: Profile | null | undefined }) {
    if (profile?.avatar_url) return <img src={profile.avatar_url} className="w-10 h-10 rounded-full object-cover shrink-0" />
    return (
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
        {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
      </div>
    )
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const sameDay = d.toDateString() === new Date().toDateString()
    return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Messages</h1>
      <p className="text-sm text-muted-foreground mb-6">Communicate with users and manage all platform conversations.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 bg-card border border-border rounded-xl overflow-hidden" style={{ minHeight: '70vh' }}>
        {/* Conversation list */}
        <div className={`border-r border-border flex-col ${mobileView === 'thread' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-4 border-b border-border space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'unread', 'landlords', 'tenants'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize transition-colors ${
                    tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                  }`}
                >
                  {t} ({counts[t]})
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">No conversations match.</p>
            ) : (
              filtered.map((c) => {
                const [pA, pB] = participantsOf(c)
                return (
                  <button
                    key={c.key}
                    onClick={() => { setActiveKey(c.key); setMobileView('thread') }}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start border-b border-border/50 hover:bg-secondary/40 ${
                      active?.key === c.key ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Avatar profile={pA} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {pA?.full_name ?? 'Unknown'} <span className="text-muted-foreground font-normal">↔</span> {pB?.full_name ?? 'Unknown'}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(c.lastMessage.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{c.lastMessage.message}</p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-1">
                        {c.unreadCount}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Thread panel */}
        <div className={`flex-col ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a conversation</div>
          ) : (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="lg:hidden" onClick={() => setMobileView('list')}><ArrowLeft size={18} /></button>
                  <Avatar profile={activeA} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {activeA?.full_name ?? 'Unknown'} <span className="text-muted-foreground font-normal text-xs">↔</span> {activeB?.full_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {activeA?.role ?? '—'} · {activeB?.role ?? '—'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => requestDeleteConversation(active)}
                  className="flex items-center gap-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-lg px-3 py-1.5 hover:bg-destructive/10"
                >
                  <Trash2 size={13} /> Delete Conversation
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages.map((m) => {
                  const sender = profilesById[m.sender_id]
                  return (
                    <div key={m.id} className="group flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-foreground">{sender?.full_name ?? 'Unknown'}</span>
                          <span className="text-[10px] text-muted-foreground">{formatTime(m.created_at)}</span>
                          {!m.read_at && <span className="text-[9px] text-primary font-medium">unread</span>}
                        </div>
                        <div className="bg-secondary rounded-xl rounded-tl-sm px-3 py-2 text-sm text-foreground inline-block max-w-[85%]">
                          {m.message}
                        </div>
                      </div>
                      <button
                        onClick={() => requestDeleteMessage(m)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1.5 shrink-0"
                        title="Delete this message"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {active.lastMessage.listing_id && (
                <div className="px-4 py-2 border-t border-border">
                  <a
                    href={`/listing/${active.lastMessage.listing_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink size={12} /> View related listing
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm delete modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleting && setPendingDelete(null)} />
          <div className="relative bg-card border border-border rounded-xl p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {pendingDelete.type === 'message' ? 'Delete this message?' : 'Delete entire conversation?'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pendingDelete.type === 'message'
                    ? `"${pendingDelete.preview.slice(0, 80)}${pendingDelete.preview.length > 80 ? '…' : ''}"`
                    : `All messages between ${pendingDelete.label} will be permanently deleted.`}
                  {' '}This can't be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 border border-border rounded-lg py-2 text-sm font-medium text-foreground hover:bg-secondary/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}