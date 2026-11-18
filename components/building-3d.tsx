'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { naturalSort, type ViewUnit } from '@/lib/estate-view'
import { Prop } from '@/components/scenery'

type Props = {
  units: ViewUnit[]
  toneOf: (u: ViewUnit) => string
  selectedId: string | null
  onSelect?: (id: string) => void
  name?: string
  preview?: boolean
  height?: number
}

const GAP = 1.15
const FLOOR_H = 1.1
const BODY_D = 1.2
const HOUSE_SP = 2.6
const LABEL_DF = 6 // label size: raise to make numbers bigger, lower to make them smaller
const HOUSE_H = 1.6 // house model height: change if your house looks too big or small
const ROOF_H = 0.9 // roof height on blocks of flats
const MODEL_HOUSE_MAX = 24 // above this many homes, use the light built-in house so phones stay fast

const C = {
  sky: '#cfe8f7',
  grass: '#a8d89a',
  plaza: '#ddd6c6',
  body: '#f4efe3',
  forest: '#0A2E1A',
  roof: '#2b3a33',
  green: '#22c55e',
  taken: '#b9b4aa',
  blue: '#3b82f6',
  gold: '#f5b301',
  glass: '#5b7fa6',
  glassLit: '#fff1b8',
  frame: '#fbfaf6',
  trunk: '#7a5230',
  leaf: '#2f8f4e',
  leaf2: '#3da35d',
  door: '#5a3b22',
}

type Mood = 'day' | 'dusk' | 'night'
const MOODS: Record<Mood, { sky: string; grass: string; plaza: string; hemiSky: string; hemiGround: string; hemi: number; sun: string; sunI: number; disc: string; cloud: string }> = {
  day: { sky: '#cfe8f7', grass: '#a8d89a', plaza: '#ddd6c6', hemiSky: '#ffffff', hemiGround: '#9ec79a', hemi: 0.85, sun: '#ffffff', sunI: 1.15, disc: '#fff6c9', cloud: '#ffffff' },
  dusk: { sky: '#f4b58a', grass: '#8fb585', plaza: '#cdbfa8', hemiSky: '#ffd9b0', hemiGround: '#7d9a78', hemi: 0.6, sun: '#ff9d5c', sunI: 0.85, disc: '#ffd27a', cloud: '#ffd9c2' },
  night: { sky: '#0f1b33', grass: '#3f6a4e', plaza: '#7d8294', hemiSky: '#7f96c8', hemiGround: '#2e4a40', hemi: 0.4, sun: '#9bb0e0', sunI: 0.4, disc: '#f1f4ff', cloud: '#56627f' },
}

type Placed = { unit: ViewUnit; x: number; y: number; z: number; floorIdx: number }
type Layout = { hasFloors: boolean; placed: Placed[]; floors: number[]; cols: number; rows: number; w: number; h: number; d: number }

function makeLayout(units: ViewUnit[]): Layout {
  const sorted = [...units].sort((a, b) => naturalSort(a.unit_label, b.unit_label))
  const hasFloors = sorted.some((u) => u.floor_no !== null)
  const placed: Placed[] = []
  if (hasFloors) {
    const floors = Array.from(new Set(sorted.map((u) => u.floor_no ?? 0))).sort((a, b) => a - b)
    let widest = 1
    floors.forEach((f, fi) => {
      const row = sorted.filter((u) => (u.floor_no ?? 0) === f)
      widest = Math.max(widest, row.length)
      row.forEach((u, i) => {
        placed.push({ unit: u, x: (i - (row.length - 1) / 2) * GAP, y: fi * FLOOR_H + 0.55, z: BODY_D / 2 + 0.05, floorIdx: fi })
      })
    })
    return { hasFloors, placed, floors, cols: widest, rows: floors.length, w: widest * GAP + 0.4, h: floors.length * FLOOR_H + 0.1, d: BODY_D }
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)))
  const rows = Math.max(1, Math.ceil(sorted.length / cols))
  sorted.forEach((u, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    placed.push({ unit: u, x: (c - (cols - 1) / 2) * HOUSE_SP, y: 0, z: (r - (rows - 1) / 2) * HOUSE_SP, floorIdx: 0 })
  })
  return { hasFloors, placed, floors: [], cols, rows, w: cols * HOUSE_SP, h: 1.8, d: rows * HOUSE_SP }
}

function toneColor(tone: string, selected: boolean) {
  if (selected) return C.gold
  if (tone === 'to_let') return C.green
  if (tone === 'neighbour') return C.blue
  return C.taken
}

function Pill({ text, dark = true }: { text: string; dark?: boolean }) {
  return (
    <div
      style={{
        background: dark ? 'rgba(10,46,26,0.9)' : 'rgba(250,247,242,0.95)',
        color: dark ? '#fff' : '#0A2E1A',
        fontSize: 14,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 7,
        whiteSpace: 'nowrap',
        fontFamily: 'Poppins, system-ui, sans-serif',
        border: dark ? 'none' : '1px solid rgba(10,46,26,0.25)',
      }}
    >
      {text}
    </div>
  )
}

function Flat({ p, tone, selected, showLabel, mood, onSelect }: { p: Placed; tone: string; selected: boolean; showLabel: boolean; mood: Mood; onSelect?: (id: string) => void }) {
  const base = toneColor(tone, selected)
  const lit = tone === 'to_let' || selected
  const dark = mood !== 'day'
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null)
  // To-let flats breathe softly so they catch the eye
  useFrame(({ clock }) => {
    if (bodyMat.current && tone === 'to_let' && !selected) bodyMat.current.emissiveIntensity = 0.3 + 0.22 * Math.sin(clock.elapsedTime * 2.6)
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect?.(p.unit.id)
  }
  return (
    <group position={[p.x, p.y, p.z]} scale={selected ? 1.07 : 1} onClick={click}>
      <mesh castShadow>
        <boxGeometry args={[1, 0.8, 0.14]} />
        <meshStandardMaterial ref={bodyMat} color={base} emissive={lit ? base : '#000000'} emissiveIntensity={lit ? 0.25 : 0} />
      </mesh>
      {/* White window frame, then the glass in front of it */}
      <mesh position={[0, 0.13, 0.075]}>
        <boxGeometry args={[0.78, 0.38, 0.02]} />
        <meshStandardMaterial color={C.frame} />
      </mesh>
      <mesh position={[0, 0.13, 0.09]}>
        <boxGeometry args={[0.7, 0.3, 0.02]} />
        <meshStandardMaterial color={lit ? C.glassLit : dark ? '#d9c27a' : C.glass} emissive={lit ? C.glassLit : dark ? '#d9c27a' : '#000000'} emissiveIntensity={lit ? (dark ? 1 : 0.5) : dark ? 0.55 : 0} />
      </mesh>
      {showLabel && (
        <Html center position={[0, -0.22, 0.12]} distanceFactor={LABEL_DF} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <Pill text={p.unit.unit_label} />
        </Html>
      )}
    </group>
  )
}

// The light built-in house. Shown if house.glb is missing, still loading, or the estate is big.
function PlainHouse({ roof, lit }: { roof: string; lit: boolean }) {
  return (
    <>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.9, 1.2]} />
        <meshStandardMaterial color={C.body} />
      </mesh>
      <mesh position={[0, 1.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.15, 0.75, 4]} />
        <meshStandardMaterial color={roof} emissive={lit ? roof : '#000000'} emissiveIntensity={lit ? 0.25 : 0} />
      </mesh>
      <mesh position={[0, 0.25, 0.61]}>
        <boxGeometry args={[0.26, 0.5, 0.03]} />
        <meshStandardMaterial color={C.door} />
      </mesh>
      <mesh position={[-0.42, 0.55, 0.61]}>
        <boxGeometry args={[0.25, 0.25, 0.03]} />
        <meshStandardMaterial color={lit ? C.glassLit : C.glass} emissive={lit ? C.glassLit : '#000000'} emissiveIntensity={lit ? 0.5 : 0} />
      </mesh>
      <mesh position={[0.42, 0.55, 0.61]}>
        <boxGeometry args={[0.25, 0.25, 0.03]} />
        <meshStandardMaterial color={lit ? C.glassLit : C.glass} emissive={lit ? C.glassLit : '#000000'} emissiveIntensity={lit ? 0.5 : 0} />
      </mesh>
    </>
  )
}

function House({ p, tone, selected, useModel, onSelect }: { p: Placed; tone: string; selected: boolean; useModel: boolean; onSelect?: (id: string) => void }) {
  const color = toneColor(tone, selected)
  const lit = tone === 'to_let' || selected
  const ringMat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (ringMat.current && tone === 'to_let' && !selected) ringMat.current.emissiveIntensity = 0.5 + 0.4 * Math.sin(clock.elapsedTime * 2.6)
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect?.(p.unit.id)
  }
  const plain = <PlainHouse roof={color} lit={lit} />
  return (
    <group position={[p.x, 0, p.z]} scale={selected ? 1.07 : 1} onClick={click}>
      {/* Status ring on the ground: green to let, grey taken, gold selected */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.0, 1.2, 32]} />
        <meshStandardMaterial ref={ringMat} color={color} emissive={lit ? color : '#000000'} emissiveIntensity={lit ? 0.4 : 0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.0, 32]} />
        <meshStandardMaterial color="#e9e3d3" transparent opacity={0.8} />
      </mesh>
      {useModel ? <Prop kind="house" height={HOUSE_H} shadows={false} fallback={plain} /> : plain}
      <Html center position={[0, HOUSE_H + 0.5, 0]} distanceFactor={LABEL_DF} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <Pill text={`No. ${p.unit.unit_label}`} />
      </Html>
    </group>
  )
}

// The old hand-built tree. Shown only if tree.glb is missing or still loading.
function PlainTree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 0.5, 6]} />
        <meshStandardMaterial color={C.trunk} />
      </mesh>
      <mesh position={[0, 0.8, 0]} castShadow>
        <icosahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color={C.leaf} flatShading />
      </mesh>
      <mesh position={[0.12, 1.1, 0.05]} castShadow>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color={C.leaf2} flatShading />
      </mesh>
    </group>
  )
}

type Spot = { x: number; z: number; s: number }

function treeSpots(l: Layout): Spot[] {
  const t: Spot[] = []
  if (l.hasFloors) {
    const a = l.w / 2 + 1.2
    t.push({ x: -a, z: 1.6, s: 1.1 }, { x: a, z: 1.8, s: 1 }, { x: -a - 1, z: 0.2, s: 0.9 }, { x: a + 1, z: -0.4, s: 1.2 })
    t.push({ x: -l.w / 3, z: -2.4, s: 1.1 }, { x: l.w / 4, z: -2.6, s: 1 })
    return t
  }
  const zEdge = (l.rows * HOUSE_SP) / 2 + 0.9
  const xEdge = (l.cols * HOUSE_SP) / 2 + 0.9
  for (let c = 0; c < l.cols; c += 2) {
    const x = (c - (l.cols - 1) / 2) * HOUSE_SP
    t.push({ x, z: -zEdge, s: 1.1 }, { x: x + 0.8, z: zEdge, s: 0.9 })
  }
  for (let r = 0; r < l.rows; r += 2) {
    const z = (r - (l.rows - 1) / 2) * HOUSE_SP
    t.push({ x: -xEdge, z, s: 1 }, { x: xEdge, z: z + 0.6, s: 1.1 })
  }
  return t
}

// Small extras: lamps, bushes and cars. They only show if their model files exist.
function Extras({ l }: { l: Layout }) {
  if (l.hasFloors) {
    const front = l.d / 2 + 1.5
    return (
      <>
        <Prop kind="lamp" x={-l.w / 2 - 0.2} z={front} height={1.3} />
        <Prop kind="lamp" x={l.w / 2 + 0.2} z={front} height={1.3} />
        <Prop kind="car" x={-l.w / 4} z={front + 0.9} height={0.5} rotY={Math.PI / 2} />
        <Prop kind="car" x={l.w / 5} z={front + 0.9} height={0.5} rotY={-Math.PI / 2} />
        <Prop kind="bush" x={-l.w / 2 + 0.3} z={l.d / 2 + 0.9} height={0.4} />
        <Prop kind="bush" x={l.w / 2 - 0.3} z={l.d / 2 + 0.9} height={0.4} />
      </>
    )
  }
  const front = (l.rows * HOUSE_SP) / 2 + 1.5
  return (
    <>
      <Prop kind="lamp" x={-l.w / 2 + 0.4} z={front} height={1.3} />
      <Prop kind="lamp" x={l.w / 2 - 0.4} z={front} height={1.3} />
      <Prop kind="car" x={-l.w / 5} z={front + 0.3} height={0.5} rotY={Math.PI / 2} />
      <Prop kind="car" x={l.w / 5} z={front + 0.3} height={0.5} rotY={-Math.PI / 2} />
    </>
  )
}

// Soft clouds that drift across the sky
function Cloud({ x, y, z, s, speed, limit, color, opacity }: { x: number; y: number; z: number; s: number; speed: number; limit: number; color: string; opacity: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!g.current) return
    g.current.position.x += dt * speed
    if (g.current.position.x > limit) g.current.position.x = -limit
  })
  return (
    <group ref={g} position={[x, y, z]} scale={s}>
      {[[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.75], [-1.1, -0.2, -0.1, 0.8], [0.4, 0.35, 0, 0.7]].map(([cx, cy, cz, r], i) => (
        <mesh key={i} position={[cx, cy, cz]}>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={color} flatShading transparent opacity={opacity} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

function Sky({ mood, size }: { mood: Mood; size: number }) {
  const m = MOODS[mood]
  const stars = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < 70; i++) {
      const a = (i * 2.399) % (Math.PI * 2)
      const e = 0.25 + ((i * 0.618) % 1) * 1.1
      const r = size * 6
      out.push([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r])
    }
    return out
  }, [size])
  const lim = size * 4
  return (
    <>
      <mesh position={[-size * 3, size * (mood === 'dusk' ? 1.1 : 2.4), -size * 4]}>
        <sphereGeometry args={[size * (mood === 'night' ? 0.28 : 0.4), 20, 20]} />
        <meshBasicMaterial color={m.disc} fog={false} />
      </mesh>
      {mood === 'night' &&
        stars.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[size * 0.05, 4, 4]} />
            <meshBasicMaterial color="#ffffff" fog={false} />
          </mesh>
        ))}
      <Cloud x={-lim * 0.6} y={size * 1.5 + 4} z={-size * 2.5} s={size * 0.28} speed={0.35} limit={lim} color={m.cloud} opacity={0.92} />
      <Cloud x={lim * 0.3} y={size * 1.9 + 5} z={-size * 3.2} s={size * 0.22} speed={0.25} limit={lim} color={m.cloud} opacity={0.9} />
      <Cloud x={lim * 0.8} y={size * 1.3 + 3} z={size * 0.5 - size * 3} s={size * 0.18} speed={0.45} limit={lim} color={m.cloud} opacity={0.85} />
    </>
  )
}

// Fly the camera in from far away when the view opens
function Intro({ target, skip }: { target: [number, number, number]; skip: boolean }) {
  const { camera, invalidate } = useThree()
  const t = useRef(skip ? 1 : 0)
  useFrame((_, dt) => {
    if (t.current >= 1) return
    t.current = Math.min(1, t.current + dt / 1.4)
    const e = 1 - Math.pow(1 - t.current, 3)
    const k = 1 + (1 - e) * 0.9
    camera.position.set(target[0] * k, target[1] * k, target[2] * k)
    invalidate()
  })
  return null
}

function Scene({ layout, toneOf, selectedId, onSelect, name, preview, shadowsOn, mood, camPos }: Props & { layout: Layout; shadowsOn: boolean; mood: Mood; camPos: [number, number, number] }) {
  const { camera } = useThree()
  const [front, setFront] = useState(true)
  const size = Math.max(layout.w, layout.h + ROOF_H, layout.d, 4)
  const trees = useMemo(() => treeSpots(layout), [layout])
  const useHouseModel = layout.placed.length <= MODEL_HOUSE_MAX
  const s = size * 1.3
  const M = MOODS[mood]
  const night = mood !== 'day'
  const roadZ = layout.hasFloors ? layout.d / 2 + 2.4 : (layout.rows * HOUSE_SP) / 2 + 1.8
  const roadLen = Math.max(layout.w, layout.d) + 18
  const lampZ = layout.hasFloors ? layout.d / 2 + 1.5 : (layout.rows * HOUSE_SP) / 2 + 1.5
  const lampX = layout.hasFloors ? layout.w / 2 + 0.2 : layout.w / 2 - 0.4

  return (
    <>
      <color attach="background" args={[M.sky]} />
      <fog attach="fog" args={[M.sky, size * 3, size * 6]} />
      <hemisphereLight args={[M.hemiSky, M.hemiGround, M.hemi]} />
      <Sky mood={mood} size={size} />
      <Intro target={camPos} skip={!!preview} />
      {night && (
        <>
          <pointLight position={[-lampX, 1.3, lampZ]} color="#ffd27a" intensity={8} distance={7} />
          <pointLight position={[lampX, 1.3, lampZ]} color="#ffd27a" intensity={8} distance={7} />
        </>
      )}
      <directionalLight
        color={M.sun}
        position={[8, 14, 10]}
        intensity={M.sunI}
        castShadow={shadowsOn}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-s}
        shadow-camera-right={s}
        shadow-camera-top={s}
        shadow-camera-bottom={-s}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[size * 4, 48]} />
        <meshStandardMaterial color={M.grass} />
      </mesh>
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <boxGeometry args={[layout.w + 2, 0.04, layout.d + 2.4]} />
        <meshStandardMaterial color={M.plaza} />
      </mesh>
      {/* Road in front, with a dashed centre line */}
      <mesh position={[0, 0.01, roadZ]} receiveShadow>
        <boxGeometry args={[roadLen, 0.03, 1.8]} />
        <meshStandardMaterial color={night ? '#2b2f3a' : '#6b6f76'} />
      </mesh>
      {Array.from({ length: Math.floor(roadLen / 1.6) }).map((_, i) => (
        <mesh key={`d${i}`} position={[-roadLen / 2 + 0.8 + i * 1.6, 0.03, roadZ]}>
          <boxGeometry args={[0.7, 0.01, 0.07]} />
          <meshStandardMaterial color="#f5f0d8" />
        </mesh>
      ))}

      {layout.hasFloors && (
        <>
          <mesh position={[0, layout.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[layout.w, layout.h, layout.d]} />
            <meshStandardMaterial color={C.body} />
          </mesh>
          {layout.floors.map((f, fi) => (
            <mesh key={`b${f}`} position={[0, fi * FLOOR_H + 0.12, layout.d / 2 + 0.22]} castShadow receiveShadow>
              <boxGeometry args={[layout.w + 0.2, 0.06, 0.5]} />
              <meshStandardMaterial color="#d8d1c0" />
            </mesh>
          ))}
          {/* Roof edge, then a pitched roof on top */}
          <mesh position={[0, layout.h + 0.04, 0]} castShadow>
            <boxGeometry args={[layout.w + 0.5, 0.14, layout.d + 0.5]} />
            <meshStandardMaterial color={C.forest} />
          </mesh>
          <group position={[0, layout.h + 0.11, 0]} scale={[(layout.w + 0.7) / Math.SQRT2, ROOF_H, (layout.d + 0.7) / Math.SQRT2]}>
            <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[1, 1, 4]} />
              <meshStandardMaterial color={C.roof} flatShading />
            </mesh>
          </group>
          {name && !preview && (
            <Html center position={[0, layout.h + ROOF_H + 0.7, 0]} distanceFactor={LABEL_DF} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <Pill text={name} dark={false} />
            </Html>
          )}
          {front && !preview &&
            layout.floors.map((f, fi) => (
              <Html key={`f${f}`} center position={[-layout.w / 2 - 0.55, fi * FLOOR_H + 0.55, layout.d / 2]} distanceFactor={LABEL_DF} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <Pill text={f === 0 ? 'G' : `F${f}`} dark={false} />
              </Html>
            ))}
        </>
      )}

      {layout.placed.map((p) =>
        layout.hasFloors ? (
          <Flat key={p.unit.id} p={p} tone={toneOf(p.unit)} selected={p.unit.id === selectedId} showLabel={front && !preview} mood={mood} onSelect={onSelect} />
        ) : (
          <House key={p.unit.id} p={p} tone={toneOf(p.unit)} selected={p.unit.id === selectedId} useModel={useHouseModel} onSelect={onSelect} />
        ),
      )}

      {!layout.hasFloors && name && !preview && (
        <Html center position={[0, 0.2, (layout.rows * HOUSE_SP) / 2 + 2.8]} distanceFactor={LABEL_DF} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <Pill text={name} dark={false} />
        </Html>
      )}

      {trees.map((t, i) => (
        <Prop key={i} kind="tree" x={t.x} z={t.z} height={1.5 * t.s} fallback={<PlainTree x={t.x} z={t.z} s={t.s} />} />
      ))}
      <Extras l={layout} />

      <OrbitControls
        target={[0, layout.hasFloors ? (layout.h + ROOF_H) / 2 : 0.6, 0]}
        enablePan={!preview}
        enableZoom={!preview}
        enableRotate={!preview}
        autoRotate={!!preview}
        autoRotateSpeed={1.4}
        enableDamping
        dampingFactor={0.12}
        minDistance={4}
        maxDistance={size * 2.5 + 10}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.1}
        onChange={() => {
          const f = camera.position.z > 0.5
          setFront((prev) => (prev === f ? prev : f))
        }}
      />
    </>
  )
}

export default function Building3D(props: Props) {
  const [ok, setOk] = useState<boolean | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [mood, setMood] = useState<Mood>('day')
  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      setOk(!!(c.getContext('webgl2') || c.getContext('webgl')))
    } catch {
      setOk(false)
    }
  }, [])

  const layout = useMemo(() => makeLayout(props.units), [props.units])
  const size = Math.max(layout.w, layout.h + ROOF_H, layout.d, 4)
  const dist = size * 1.05 + 5
  const camPos: [number, number, number] = layout.hasFloors
    ? [dist * 0.45, layout.h * 0.55 + 3, dist]
    : [dist * 0.6, dist * 0.75, dist * 0.9]
  const height = props.height ?? 460
  const shadowsOn = props.units.length <= 60

  if (ok === false) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">3D does not work on this phone. Please use Flat view.</p>
  }
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-border" style={{ height, touchAction: props.preview ? 'pan-y' : 'none' }}>
        {ok && (
          <Canvas key={resetKey} shadows={shadowsOn} frameloop={props.preview || props.units.length <= 40 ? 'always' : 'demand'} dpr={[1, 1.5]} camera={{ position: camPos, fov: 40 }}>
            <Scene {...props} layout={layout} shadowsOn={shadowsOn} mood={props.preview ? 'day' : mood} camPos={camPos} />
          </Canvas>
        )}
        {!props.preview && (
          <div className="absolute left-2 top-2 flex gap-1">
            {(['day', 'dusk', 'night'] as Mood[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(m)}
                className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${mood === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card/95 text-foreground'}`}
              >
                {m === 'day' ? 'Day' : m === 'dusk' ? 'Dusk' : 'Night'}
              </button>
            ))}
          </div>
        )}
        {!props.preview && (
          <button
            type="button"
            onClick={() => setResetKey((k) => k + 1)}
            className="absolute right-2 top-2 min-h-9 rounded-lg border border-border bg-card/95 px-3 text-xs font-semibold text-foreground"
          >
            Reset view
          </button>
        )}
      </div>
      {!props.preview && <p className="mt-1 text-xs text-muted-foreground">Drag to turn. Pinch to zoom. Tap a home. Touch outside the box to scroll the page.</p>}
    </div>
  )
}
