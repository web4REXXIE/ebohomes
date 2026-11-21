'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type * as THREE from 'three'
import { supabase } from '@/lib/supabase'

// Lets residents of one building see each other in the town.
// Shared: a spot on the ground, a unit label ("Unit 1A" or "Management") and a small action. Nothing else.
// The channel is private: the database (20261224_01_eboville_presence.sql) only lets this building's residents and owner join.

export type Emote = 'hi' | 'clap' | 'jump' | 'sit'
export type CharacterKey = 'woman' | 'man'
export type Other = {
  key: string
  label: string
  character: CharacterKey
  x: number
  y: number
  z: number
  ry: number
  moving: boolean
  emote: Emote | null
  emoteUntil: number
}
export const MAX_OTHERS = 15

const EMOTES: Emote[] = ['hi', 'clap', 'jump', 'sit']
const isEmote = (v: unknown): v is Emote => typeof v === 'string' && (EMOTES as string[]).includes(v)
const n = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const r2 = (v: number) => Math.round(v * 100) / 100
export const emoteMs = (e: Emote) => (e === 'sit' ? 1e9 : e === 'hi' ? 2500 : 2200)

type Meta = { label?: unknown; character?: unknown }

export function useEboVillePresence(opts: { estateId: string | undefined; label: string | null; character: CharacterKey; posRef: MutableRefObject<THREE.Vector3> }) {
  const { estateId, label, character, posRef } = opts
  const store = useRef(new Map<string, Other>())
  const [ids, setIds] = useState<string[]>([])
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const keyRef = useRef('')
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!estateId || !label) return
    let alive = true
    let timer: ReturnType<typeof setInterval> | null = null
    const key = Math.random().toString(36).slice(2, 10)
    keyRef.current = key
    const mine = store.current
    const ch = supabase.channel('eboville:' + estateId, {
      config: { private: true, broadcast: { self: false }, presence: { key } },
    })
    chRef.current = ch

    ch.on('broadcast', { event: 'p' }, ({ payload }) => {
      const p = payload as Record<string, unknown> | null
      const o = p && typeof p.k === 'string' ? mine.get(p.k) : undefined
      if (!p || !o) return
      o.x = n(p.x)
      o.y = n(p.y)
      o.z = n(p.z)
      o.ry = n(p.r)
      o.moving = p.m === 1
      if (o.moving) o.emote = null
    })
    ch.on('broadcast', { event: 'e' }, ({ payload }) => {
      const p = payload as Record<string, unknown> | null
      const o = p && typeof p.k === 'string' ? mine.get(p.k) : undefined
      if (!p || !o || !isEmote(p.e)) return
      o.emote = p.e
      o.emoteUntil = performance.now() + emoteMs(p.e)
    })
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState() as Record<string, Meta[]>
      const keys = Object.keys(st).filter((k) => k !== key).slice(0, MAX_OTHERS)
      for (const k of Array.from(mine.keys())) if (!keys.includes(k)) mine.delete(k)
      for (const k of keys) {
        const meta = st[k]?.[0] ?? {}
        const lbl = typeof meta.label === 'string' ? meta.label.slice(0, 16) : 'Neighbour'
        const chr: CharacterKey = meta.character === 'man' ? 'man' : 'woman'
        const old = mine.get(k)
        if (old) {
          old.label = lbl
          old.character = chr
        } else {
          mine.set(k, { key: k, label: lbl, character: chr, x: 0, y: 0, z: 0.5, ry: 0, moving: false, emote: null, emoteUntil: 0 })
        }
      }
      setIds(keys)
    })

    void (async () => {
      try {
        await supabase.realtime.setAuth()
      } catch {
        /* the channel below will report the problem */
      }
      if (!alive) return
      ch.subscribe(async (status) => {
        if (!alive) return
        if (status === 'SUBSCRIBED') {
          await ch.track({ label, character })
          setLive(true)
          let last = { x: posRef.current.x, y: posRef.current.y, z: posRef.current.z }
          let ry = 0
          let wasMoving = false
          let sentAt = 0
          timer = setInterval(() => {
            if (document.visibilityState !== 'visible') return
            const p = posRef.current
            const dx = p.x - last.x
            const dz = p.z - last.z
            const dy = p.y - last.y
            const moved = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 0.02
            if (Math.abs(dx) + Math.abs(dz) > 0.01) ry = Math.atan2(dx, dz)
            last = { x: p.x, y: p.y, z: p.z }
            const now = Date.now()
            if (moved || wasMoving || now - sentAt > 2000) {
              sentAt = now
              void ch.send({ type: 'broadcast', event: 'p', payload: { k: key, x: r2(p.x), y: r2(p.y), z: r2(p.z), r: r2(ry), m: moved ? 1 : 0 } })
              wasMoving = moved
            }
          }, 250)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLive(false)
        }
      })
    })()

    return () => {
      alive = false
      if (timer) clearInterval(timer)
      mine.clear()
      setIds([])
      setLive(false)
      chRef.current = null
      void supabase.removeChannel(ch)
    }
  }, [estateId, label, character, posRef])

  const sendEmote = useCallback((e: Emote) => {
    void chRef.current?.send({ type: 'broadcast', event: 'e', payload: { k: keyRef.current, e } })
  }, [])

  return { store, ids, live, sendEmote }
}
