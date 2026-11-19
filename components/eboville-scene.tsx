'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { themeOf } from '@/lib/lodge-themes'
import type { LightState } from '@/lib/light-status'
import { BENCH, BUILDING, BUSH, CHARACTERS, Piece, TREES, fit } from '@/components/eboville-shared'

// EboVille town: doors for every home, Lodge board, light pole, meeting hall and gate.
// The Lodge Level changes what you see: level 3 garden, level 5 string lights, level 7 gate lanterns.

export type DoorTone = 'to_let' | 'mine' | 'neighbour' | 'taken'
export type DoorUnit = { id: string; label: string; floor: number | null; tone: DoorTone }
type PlacedDoor = DoorUnit & { x: number; y: number }

const WALK_SPEED = 2.4 // units per second: raise to walk faster
const LIMIT = 11 // how far from the middle you can walk
const WALL_Z = -8.5 // middle of the door wall
const WALL_FRONT = -8 // the face of the wall where the doors are
const DOOR_GAP = 1.1
const ROW_H = 1.5
const PER_ROW = 8

const GREEN = '#16a34a'
const GOLD = '#d4a017'
const BLUE = '#3b82f6'
const GREY = '#9aa3a0'
const FOREST = '#0A2E1A'
const CREAM = '#FAF7F2'
const TONE_COLOR: Record<DoorTone, string> = { to_let: GREEN, mine: GOLD, neighbour: BLUE, taken: GREY }

type SpotKey = 'board' | 'light' | 'hall' | 'gate'
// Where the character stands when it gets to each place.
const SPOTS: Record<SpotKey, [number, number]> = {
  board: [0, -2.4],
  light: [-3.4, 0.9],
  hall: [6.2, 1.8],
  gate: [-6.2, 3.8],
}

// Round areas a tapped spot is pushed out of. Change a number if something feels blocked or open.
type Obstacle = { x: number; z: number; r: number }
const OBSTACLES: Obstacle[] = [
  { x: -7, z: 1, r: 0.9 },
  { x: 7.5, z: -2, r: 0.9 },
  { x: -3.5, z: -2.5, r: 0.8 },
  { x: 4, z: -3, r: 0.8 },
  { x: 3, z: 0.8, r: 1 },
  { x: -2.2, z: 2.5, r: 0.6 },
  { x: 2.6, z: 2.8, r: 0.6 },
  { x: -9.5, z: -4.5, r: 2.5 },
  { x: 9.5, z: -4.5, r: 2.5 },
  { x: 0, z: -4, r: 0.9 },
  { x: -4.5, z: 0.5, r: 0.5 },
  { x: 8, z: 2, r: 1.5 },
  { x: -8, z: 5, r: 1.3 },
]

function settle(p: THREE.Vector3): THREE.Vector3 {
  const len = Math.hypot(p.x, p.z)
  if (len > LIMIT) {
    p.x = (p.x / len) * LIMIT
    p.z = (p.z / len) * LIMIT
  }
  for (const o of OBSTACLES) {
    const dx = p.x - o.x
    const dz = p.z - o.z
    const d = Math.hypot(dx, dz)
    const min = o.r + 0.4
    if (d < min) {
      const k = d === 0 ? 1 : min / d
      p.x = o.x + (d === 0 ? min : dx * k)
      p.z = o.z + (d === 0 ? 0 : dz * k)
    }
  }
  if (p.z < -6.8) p.z = -6.8 // never walk into the door wall
  p.y = 0
  return p
}

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

// Puts the doors on the wall: one row per floor. Houses without floors, or more than 6 rows, are simply filled row by row.
function layoutDoors(doors: DoorUnit[]) {
  let rows: DoorUnit[][] = []
  if (doors.some((d) => d.floor !== null)) {
    const byFloor = new Map<number, DoorUnit[]>()
    for (const d of doors) {
      const k = d.floor ?? 0
      const list = byFloor.get(k)
      if (list) list.push(d)
      else byFloor.set(k, [d])
    }
    const keys = Array.from(byFloor.keys()).sort((a, b) => a - b)
    rows = keys.flatMap((k) => chunk(byFloor.get(k) ?? [], PER_ROW))
  }
  if (rows.length === 0 || rows.length > 6) rows = chunk(doors, PER_ROW)
  const placed: PlacedDoor[] = []
  let widest = 4
  rows.forEach((row, ri) => {
    widest = Math.max(widest, row.length * DOOR_GAP + 0.8)
    row.forEach((d, i) => placed.push({ ...d, x: (i - (row.length - 1) / 2) * DOOR_GAP, y: ri * ROW_H + 0.1 }))
  })
  return { placed, width: widest, height: Math.max(rows.length, 1) * ROW_H + 0.3 }
}

// The door number, drawn once on a tiny picture. Much lighter on cheap phones than 40 text labels.
function useLabel(text: string, bg: string) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const g = c.getContext('2d')
    if (g) {
      g.fillStyle = bg
      g.fillRect(0, 0, 128, 64)
      g.fillStyle = FOREST
      g.font = `bold ${text.length > 4 ? 28 : 38}px sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text.slice(0, 8), 64, 34)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [text, bg])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

type Shared = {
  targetRef: MutableRefObject<THREE.Vector3 | null>
  posRef: MutableRefObject<THREE.Vector3>
  pendingRef: MutableRefObject<string | null>
  onArriveRef: MutableRefObject<(key: string) => void>
}

function Character({ url, height, targetRef, posRef, pendingRef, onArriveRef }: Shared & { url: string; height: number }) {
  const group = useRef<THREE.Group>(null)
  const bob = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => fit(scene, height), [scene, height])
  const { actions, names } = useAnimations(animations, group)
  const current = useRef<string | null>(null)
  const moving = useRef(false)

  const idleName = names.find((n) => /idle/i.test(n)) ?? null
  const walkName = names.find((n) => /walk/i.test(n)) ?? names.find((n) => /run/i.test(n)) ?? null

  const play = useCallback(
    (name: string | null) => {
      if (current.current === name) return
      const prev = current.current ? actions[current.current] : null
      const next = name ? actions[name] : null
      prev?.fadeOut(0.2)
      next?.reset().fadeIn(0.2).play()
      current.current = name
    },
    [actions],
  )

  useEffect(() => {
    play(idleName ?? names[0] ?? null)
  }, [names, idleName, play])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const t = targetRef.current
    let isMoving = false
    if (t) {
      const dx = t.x - g.position.x
      const dz = t.z - g.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.08) {
        targetRef.current = null
        // Arrived at a door, the board, the pole, the hall or the gate: tell the page to open it.
        const key = pendingRef.current
        pendingRef.current = null
        if (key) onArriveRef.current(key)
      } else {
        isMoving = true
        const step = Math.min(dist, WALK_SPEED * dt)
        g.position.x += (dx / dist) * step
        g.position.z += (dz / dist) * step
        const want = Math.atan2(dx, dz)
        let diff = want - g.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        g.rotation.y += diff * Math.min(1, dt * 10)
      }
    }
    posRef.current.set(g.position.x, 0, g.position.z)

    if (isMoving !== moving.current) {
      moving.current = isMoving
      play(isMoving ? walkName ?? idleName : idleName ?? names[0] ?? null)
    }
    if (bob.current) {
      bob.current.position.y = isMoving && !walkName ? Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.07 : 0
    }
  })

  return (
    <group ref={group} position={[posRef.current.x, 0, posRef.current.z]}>
      <group ref={bob}>
        <primitive object={obj} />
      </group>
    </group>
  )
}

function Marker({ targetRef }: { targetRef: MutableRefObject<THREE.Vector3 | null> }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const t = targetRef.current
    m.visible = t !== null
    if (t) {
      m.position.set(t.x, 0.03, t.z)
      const s = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.12
      m.scale.set(s, s, s)
    }
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.28, 0.4, 32]} />
      <meshBasicMaterial color={GREEN} />
    </mesh>
  )
}

// The camera glides along with the character, keeping the same angle.
function Follow({ posRef, controls }: { posRef: MutableRefObject<THREE.Vector3>; controls: MutableRefObject<any> }) {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const c = controls.current
    if (!c) return
    const dx = (posRef.current.x - c.target.x) * 0.08
    const dz = (posRef.current.z - c.target.z) * 0.08
    c.target.x += dx
    c.target.z += dz
    camera.position.x += dx
    camera.position.z += dz
    c.update()
  })
  return null
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: FOREST,
  background: 'rgba(250,247,242,0.92)',
  borderRadius: 999,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

const tap = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()
  fn()
}

function Door({ d, selected, lit, onTap }: { d: PlacedDoor; selected: boolean; lit: boolean; onTap: () => void }) {
  const tex = useLabel(d.label, selected ? GOLD : CREAM)
  const color = TONE_COLOR[d.tone]
  const intensity = selected ? 0.7 : d.tone === 'taken' ? 0 : lit ? 0.9 : 0.25
  return (
    <group position={[d.x, d.y, WALL_FRONT]} onClick={tap(onTap)}>
      <mesh position={[0, 0.6, 0.02]}>
        <boxGeometry args={[0.86, 1.15, 0.06]} />
        <meshStandardMaterial color={selected ? GOLD : FOREST} />
      </mesh>
      <mesh position={[0, 0.58, 0.06]}>
        <boxGeometry args={[0.72, 1.0, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
      </mesh>
      <mesh position={[0, 1.34, 0.05]}>
        <planeGeometry args={[0.6, 0.3]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* a bigger invisible box so a thumb can hit the door easily */}
      <mesh position={[0, 0.7, 0.1]}>
        <boxGeometry args={[1.0, 1.45, 0.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// The Lodge board: two posts and a green board with a cream face.
function Board({ onTap }: { onTap: () => void }) {
  return (
    <group position={[0, 0, -4]} onClick={tap(onTap)}>
      <mesh position={[-0.95, 0.95, 0]}>
        <boxGeometry args={[0.14, 1.9, 0.14]} />
        <meshStandardMaterial color="#5b4630" />
      </mesh>
      <mesh position={[0.95, 0.95, 0]}>
        <boxGeometry args={[0.14, 1.9, 0.14]} />
        <meshStandardMaterial color="#5b4630" />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[2.3, 1.15, 0.12]} />
        <meshStandardMaterial color={FOREST} />
      </mesh>
      <mesh position={[0, 1.4, 0.07]}>
        <boxGeometry args={[2.05, 0.9, 0.02]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[2.6, 0.12, 0.4]} />
        <meshStandardMaterial color={FOREST} />
      </mesh>
      <Html position={[0, 2.5, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={labelStyle}>Lodge board</div>
      </Html>
    </group>
  )
}

// The light pole. The bulb glows when neighbours say the light is on.
function LightPole({ light, night, onTap }: { light: LightState; night: boolean; onTap: () => void }) {
  const on = light === 'on'
  return (
    <group position={[-4.5, 0, 0.5]} onClick={tap(onTap)}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 3, 12]} />
        <meshStandardMaterial color="#2b3a33" />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={on ? '#ffe2a0' : '#8a8f8c'} emissive={on ? '#ffc85a' : '#000000'} emissiveIntensity={on ? (night ? 3 : 0.5) : 0} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 3.4, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 3.7, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={labelStyle}>{light === 'on' ? 'Light dey' : light === 'off' ? 'No light' : 'Light dey?'}</div>
      </Html>
    </group>
  )
}

// The meeting hall: a small hall with a green roof. Its door faces the plaza.
function Hall({ onTap }: { onTap: () => void }) {
  return (
    <group position={[8, 0, 2]} onClick={tap(onTap)}>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[2.4, 1.8, 2.2]} />
        <meshStandardMaterial color="#e9dfc9" />
      </mesh>
      <mesh position={[0, 2.35, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.8, 1.1, 4]} />
        <meshStandardMaterial color={FOREST} />
      </mesh>
      <mesh position={[-1.22, 0.55, 0]}>
        <boxGeometry args={[0.06, 1.1, 0.7]} />
        <meshStandardMaterial color="#5b4630" />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[3, 2.8, 2.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 3.3, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={labelStyle}>Meeting hall</div>
      </Html>
    </group>
  )
}

// The lodge gate with the lodge name. Level 7 adds lanterns.
function Gate({ name, trusted, level, night, onTap }: { name: string; trusted: boolean; level: number; night: boolean; onTap: () => void }) {
  const shortName = name.length > 24 ? name.slice(0, 23) + '…' : name
  return (
    <group position={[-8, 0, 5]} onClick={tap(onTap)}>
      <mesh position={[0, 1.25, -1.3]}>
        <boxGeometry args={[0.3, 2.5, 0.3]} />
        <meshStandardMaterial color={FOREST} />
      </mesh>
      <mesh position={[0, 1.25, 1.3]}>
        <boxGeometry args={[0.3, 2.5, 0.3]} />
        <meshStandardMaterial color={FOREST} />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[0.3, 0.25, 3.2]} />
        <meshStandardMaterial color={FOREST} />
      </mesh>
      <mesh position={[0.18, 2.05, 0]}>
        <boxGeometry args={[0.06, 0.55, 2]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      {level >= 7 &&
        [-1.3, 1.3].map((z) => (
          <mesh key={z} position={[0, 2.95, z]}>
            <sphereGeometry args={[0.16, 12, 12]} />
            <meshStandardMaterial color="#ffe2a0" emissive="#ffc85a" emissiveIntensity={night ? 3 : 1} />
          </mesh>
        ))}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.2, 3, 3.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 3.6, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={{ ...labelStyle, textAlign: 'center' }}>
          {shortName}
          {trusted && <div style={{ fontSize: 10, fontWeight: 600 }}>🛡️ Trusted Lodge Keeper</div>}
        </div>
      </Html>
    </group>
  )
}

// Level 3: extra plants around the plaza.
const GARDEN: [number, number, number][] = [
  [-3, 3.6, 0.7],
  [3.6, 3.8, 0.6],
  [0, 4.4, 0.8],
  [-5.6, 2.4, 0.6],
  [5.4, 4.2, 0.7],
]

type Props = {
  character: 'woman' | 'man'
  theme?: string | null
  night: boolean
  light: LightState
  level: number
  lodgeName: string
  trusted: boolean
  doors: DoorUnit[]
  selectedDoor: string | null
  onArrive: (key: string) => void
}

export default function EbovilleScene({ character, theme, night, light, level, lodgeName, trusted, doors, selectedDoor, onArrive }: Props) {
  const t = themeOf(theme)
  const targetRef = useRef<THREE.Vector3 | null>(null)
  const posRef = useRef(new THREE.Vector3(0, 0, 0.5))
  const pendingRef = useRef<string | null>(null)
  const onArriveRef = useRef(onArrive)
  onArriveRef.current = onArrive
  const controls = useRef<any>(null)

  const layout = useMemo(() => layoutDoors(doors), [doors])

  const goTo = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    pendingRef.current = null
    targetRef.current = settle(e.point.clone())
  }
  const goSpot = (key: string, x: number, z: number) => {
    pendingRef.current = key
    targetRef.current = new THREE.Vector3(x, 0, z)
  }
  const goPlace = (k: SpotKey) => goSpot(k, SPOTS[k][0], SPOTS[k][1])

  const sky = night ? '#0b1a14' : '#dff0e6'
  const lamps = night && light === 'on'

  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 3.8, 9.5], fov: 45 }}>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 20, 44]} />
      <hemisphereLight args={night ? ['#8fa8ff', '#1b2a22', 0.45] : ['#ffffff', '#b7c9bd', 1]} />
      <directionalLight position={[6, 10, 6]} intensity={night ? 0.25 : 1.1} color={night ? '#9db4ff' : '#ffffff'} />

      {/* When the light is on at night: warm glow at the pole and along the door wall. */}
      {lamps && (
        <>
          <pointLight position={[-4.5, 3.1, 0.5]} intensity={40} distance={14} decay={2} color="#ffc85a" />
          <pointLight position={[-3, 2.6, -6.4]} intensity={30} distance={10} decay={2} color="#ffd89a" />
          <pointLight position={[3, 2.6, -6.4]} intensity={30} distance={10} decay={2} color="#ffd89a" />
        </>
      )}

      {/* grass and the plaza, in the lodge theme colour. Tap either to walk. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} onClick={goTo}>
        <circleGeometry args={[16, 48]} />
        <meshStandardMaterial color="#b9d7a8" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={goTo}>
        <circleGeometry args={[4.2, 48]} />
        <meshStandardMaterial color={t.plaza} />
      </mesh>

      <Marker targetRef={targetRef} />

      {/* the door wall: one door for every home */}
      <mesh position={[0, layout.height / 2, WALL_Z]} onClick={goTo}>
        <boxGeometry args={[layout.width, layout.height, 1]} />
        <meshStandardMaterial color={t.body} />
      </mesh>
      <mesh position={[0, layout.height + 0.1, WALL_Z]}>
        <boxGeometry args={[layout.width + 0.5, 0.2, 1.4]} />
        <meshStandardMaterial color={t.ledge} />
      </mesh>
      {layout.placed.map((d) => (
        <Door key={d.id} d={d} selected={d.id === selectedDoor} lit={lamps} onTap={() => goSpot('door:' + d.id, d.x, -6.6)} />
      ))}

      {/* level 5: string lights over the doors */}
      {level >= 5 &&
        Array.from({ length: 17 }, (_, i) => {
          const f = i / 16
          return (
            <mesh key={i} position={[(f - 0.5) * layout.width, layout.height - 0.2 - Math.sin(f * Math.PI) * 0.18, WALL_FRONT + 0.15]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshStandardMaterial color="#ffe2a0" emissive="#ffc85a" emissiveIntensity={night ? 3 : 0.8} />
            </mesh>
          )
        })}

      <Board onTap={() => goPlace('board')} />
      <LightPole light={light} night={night} onTap={() => goPlace('light')} />
      <Hall onTap={() => goPlace('hall')} />
      <Gate name={lodgeName} trusted={trusted} level={level} night={night} onTap={() => goPlace('gate')} />

      <Suspense fallback={null}>
        <Character key={character} url={CHARACTERS[character]} height={1.8} targetRef={targetRef} posRef={posRef} pendingRef={pendingRef} onArriveRef={onArriveRef} />
        <Piece url={BUILDING} height={4.5} position={[-9.5, 0, -4.5]} rotY={0.3} />
        <Piece url={BUILDING} height={4.5} position={[9.5, 0, -4.5]} rotY={-0.3} />
        <Piece url={TREES[0]} height={3} position={[-7, 0, 1]} />
        <Piece url={TREES[1]} height={3.4} position={[7.5, 0, -2]} />
        <Piece url={TREES[2]} height={2.6} position={[-3.5, 0, -2.5]} />
        <Piece url={TREES[0]} height={2.8} position={[4, 0, -3]} />
        <Piece url={BUSH} height={0.7} position={[-2.2, 0, 2.5]} />
        <Piece url={BUSH} height={0.6} position={[2.6, 0, 2.8]} />
        <Piece url={BENCH} height={0.8} position={[3, 0, 0.8]} rotY={-Math.PI / 2} />
        {level >= 3 && GARDEN.map(([x, z, h]) => <Piece key={`${x}-${z}`} url={BUSH} height={h} position={[x, 0, z]} />)}
      </Suspense>

      <OrbitControls ref={controls} target={[0, 1, 0.5]} enablePan={false} minDistance={4} maxDistance={16} maxPolarAngle={Math.PI / 2.1} />
      <Follow posRef={posRef} controls={controls} />

      <Html fullscreen style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            fontSize: 11,
            color: night ? '#e6f0ea' : FOREST,
            background: night ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
            borderRadius: 8,
            padding: '4px 8px',
          }}
        >
          🟢 To let · 🟡 Yours · 🔵 Neighbour · ⚪ Taken
        </div>
      </Html>
    </Canvas>
  )
}
