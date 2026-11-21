'use client'

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { CHARACTERS, fit } from '@/components/eboville-shared'
import type { Other } from '@/lib/eboville-presence'

// Other residents of this building, walking around in real time. Cosmetic only: tapping them does nothing.
const BUBBLE: Record<string, string> = { hi: '👋', clap: '👏', jump: '🦘', sit: '🪑' }

function Person({ id, store }: { id: string; store: MutableRefObject<Map<string, Other>> }) {
  const first = store.current.get(id)
  const url = CHARACTERS[first?.character ?? 'man']
  const group = useRef<THREE.Group>(null)
  const bob = useRef<THREE.Group>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => fit(scene, 2.0), [scene])
  const { actions, names } = useAnimations(animations, group)
  const current = useRef<string | null>(null)

  const clip = useMemo(
    () => ({
      idle: names.find((x) => /idle/i.test(x)) ?? names[0] ?? null,
      walk: names.find((x) => /walk/i.test(x)) ?? null,
      clap: names.find((x) => /clap/i.test(x)) ?? null,
      jump: names.find((x) => /_jump$/i.test(x)) ?? null,
      sit: names.find((x) => /sit/i.test(x)) ?? null,
    }),
    [names],
  )

  const play = (name: string | null) => {
    if (current.current === name) return
    const prev = current.current ? actions[current.current] : null
    const next = name ? actions[name] : null
    prev?.fadeOut(0.2)
    next?.reset().fadeIn(0.2).play()
    current.current = name
  }

  useEffect(() => {
    play(clip.idle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.idle, actions])

  useFrame((_, dt) => {
    const g = group.current
    const o = store.current.get(id)
    if (!g || !o) return
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 7)
    // A big jump (someone teleports, or first update) snaps instead of sliding through walls.
    if (Math.abs(o.x - g.position.x) + Math.abs(o.z - g.position.z) > 6) {
      g.position.set(o.x, o.y, o.z)
    }
    g.position.x += (o.x - g.position.x) * k
    g.position.y += (o.y - g.position.y) * k
    g.position.z += (o.z - g.position.z) * k
    if (o.moving) {
      let d = o.ry - g.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      g.rotation.y += d * Math.min(1, dt * 10)
    }
    const em = o.emote && (o.emote === 'sit' || performance.now() < o.emoteUntil) ? o.emote : null
    if (!o.moving && em) {
      play(em === 'clap' ? clip.clap : em === 'jump' ? clip.jump : em === 'sit' ? clip.sit : clip.idle)
    } else {
      play(o.moving ? clip.walk ?? clip.idle : clip.idle)
    }
    if (bob.current) bob.current.position.y += ((em === 'sit' ? -0.3 : 0) - bob.current.position.y) * Math.min(1, dt * 8)
    if (nameRef.current && nameRef.current.textContent !== o.label) nameRef.current.textContent = o.label
    if (bubbleRef.current) {
      const text = em ? BUBBLE[em] ?? '' : ''
      if (bubbleRef.current.textContent !== text) bubbleRef.current.textContent = text
      bubbleRef.current.style.display = text ? 'block' : 'none'
    }
  })

  return (
    <group ref={group} position={[first?.x ?? 0, first?.y ?? 0, first?.z ?? 0]}>
      <group ref={bob}>
        <primitive object={obj} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.5, 0.65, 32]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
      <Html position={[0, 2.5, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center' }}>
          <div ref={bubbleRef} style={{ display: 'none', fontSize: 22, lineHeight: 1, marginBottom: 2 }} />
          <div
            ref={nameRef}
            style={{ fontSize: 11, fontWeight: 700, color: '#0A2E1A', background: 'rgba(250,247,242,0.92)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}
          >
            {first?.label ?? 'Neighbour'}
          </div>
        </div>
      </Html>
    </group>
  )
}

export default function OtherPeople({ store, ids }: { store: MutableRefObject<Map<string, Other>>; ids: string[] }) {
  return (
    <>
      {ids.map((id) => {
        const chr = store.current.get(id)?.character ?? 'man'
        return <Person key={id + chr} id={id} store={store} />
      })}
    </>
  )
}
