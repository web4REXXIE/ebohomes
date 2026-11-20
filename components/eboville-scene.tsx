'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { themeOf } from '@/lib/lodge-themes'
import { naturalSort } from '@/lib/estate-view'
import type { LightState } from '@/lib/light-status'
import { BENCH, BUILDING, BUSH, CHARACTERS, Piece, TREES, fit } from '@/components/eboville-shared'

// EboVille town. Three layouts, picked from the homes:
//  block    one building with floors: balconies on every floor and an outside staircase.
//  compound several buildings side by side, each with its own staircase.
//  estate   houses along streets (no floors): you walk along the street to each door.
// The Lodge Level changes what you see: level 3 garden, level 5 string lights, level 7 gate lanterns.

export type DoorTone = 'to_let' | 'mine' | 'neighbour' | 'taken'
export type DoorUnit = { id: string; label: string; floor: number | null; tone: DoorTone; building?: string | null }

type Mode = 'block' | 'compound' | 'estate'
type DoorPlaced = DoorUnit & { x: number; y: number; frontZ: number; standZ: number; level: number; b: number }
type Bld = { name: string; cx: number; width: number; levels: number; height: number; bay: number | null }
// The stairwell sits inside the building line. Two half flights per floor: up on the front lane to a half landing at the right, back along the back lane to the next floor at the left.
type Tower = { x: number; x0: number; x1: number; xl: number; xr: number; zF: number; zB: number; levels: number; b: number }
type Row = { front: number; street: number }
type Layout = { mode: Mode; doors: DoorPlaced[]; blds: Bld[]; towers: Tower[]; rows: Row[]; half: number; laneX: number; minZ: number; height: number }
type Cur = { b: number; level: number; mid?: boolean } // b: building (block/compound) or street row (estate). -1 = the plaza.
type Dest = { b: number; level: number; x: number; z: number }

const WALK_SPEED = 2.4 // units per second: raise to walk faster
const FH = 2.4 // height of one floor
const DOOR_GAP = 1.5
const WALL_Z = -8.5 // middle of the building wall
const FRONT = -8 // the face of the wall where the doors are
const STAND_G = -6.6 // where you stand on the ground in front of a door
const STAND_UP = FRONT + 0.5 // where you stand on a balcony
const MIN_Z_BUILDINGS = -6.8
const EST_ROW = 5 // houses per street
const EST_ROWS = 5 // streets shown
const EST_GAP = 3
const ROW_SP = 6.5
const STEPS = 5 // steps in each half flight
const BAY_W = 4.0 // width of the stairwell built into the building
const ZF = -8.5 // front lane of the stairs
const ZB = -9.5 // back lane of the stairs

const GREEN = '#16a34a'
const GOLD = '#d4a017'
const BLUE = '#3b82f6'
const GREY = '#9aa3a0'
const FOREST = '#0A2E1A'
const CREAM = '#FAF7F2'
const TONE_COLOR: Record<DoorTone, string> = { to_let: GREEN, mine: GOLD, neighbour: BLUE, taken: GREY }

type SpotKey = 'board' | 'light' | 'hall' | 'gate' | 'bench'
const SPOTS: Record<SpotKey, [number, number]> = {
  board: [0, -2.4],
  light: [-3.4, 0.9],
  hall: [6.2, 1.8],
  gate: [-6.2, 3.8],
  bench: [3, 0.8],
}

type Obstacle = { x: number; z: number; r: number }
// Round areas a tapped spot is pushed out of. Change a number if something feels blocked or open.
const OBST_PLAZA: Obstacle[] = [
  { x: 0, z: -4, r: 0.9 },
  { x: -4.5, z: 0.5, r: 0.5 },
  { x: 8, z: 2, r: 1.5 },
  { x: -8, z: 5, r: 1.3 },
  { x: -2.2, z: 2.5, r: 0.6 },
  { x: 2.6, z: 2.8, r: 0.6 },
  { x: 3, z: 0.8, r: 1 },
]
const OBST_TREES: Obstacle[] = [
  { x: -7, z: 1, r: 0.9 },
  { x: 7.5, z: -2, r: 0.9 },
  { x: -3.5, z: -2.5, r: 0.8 },
  { x: 4, z: -3, r: 0.8 },
]

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type StairLine = { t: Tower; pts: THREE.Vector3[]; cum: number[] }
// The whole staircase as one line, used to walk it with the joystick. Every 4th point is a floor.
function stairLine(t: Tower): StairLine {
  const pts: THREE.Vector3[] = [V(t.xl, 0, t.zF)]
  for (let f = 0; f < t.levels; f++) {
    pts.push(V(t.xr, f * FH + FH / 2, t.zF), V(t.xr, f * FH + FH / 2, t.zB), V(t.xl, (f + 1) * FH, t.zB), V(t.xl, (f + 1) * FH, t.zF))
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  return { t, pts, cum }
}

// Where am I, when I am somewhere inside the stairwell?
function curFromPos(t: Tower, p: THREE.Vector3): Cur {
  const r = p.y / FH
  const k = Math.round(r)
  if (Math.abs(r - k) < 0.02) return k === 0 ? { b: -1, level: 0 } : { b: t.b, level: k }
  return { b: t.b, level: Math.floor(r), mid: true }
}

function buildLayout(doors: DoorUnit[]): Layout {
  const hasFloors = doors.some((d) => d.floor !== null)

  if (!hasFloors) {
    const list = doors.slice(0, EST_ROW * EST_ROWS)
    const n = Math.max(1, Math.ceil(list.length / EST_ROW))
    const rows: Row[] = Array.from({ length: n }, (_, r) => ({ front: FRONT - r * ROW_SP, street: FRONT - r * ROW_SP + 1.5 }))
    const placed: DoorPlaced[] = list.map((d, i) => {
      const r = Math.floor(i / EST_ROW)
      const inRow = Math.min(EST_ROW, list.length - r * EST_ROW)
      const c = i % EST_ROW
      return { ...d, x: (c - (inRow - 1) / 2) * EST_GAP, y: 0.1, frontZ: rows[r].front, standZ: rows[r].street, level: 0, b: r }
    })
    const rowW = EST_ROW * EST_GAP
    return { mode: 'estate', doors: placed, blds: [], towers: [], rows, half: rowW / 2 + 4.5, laneX: rowW / 2 + 3, minZ: rows[n - 1].street - 1.2, height: 3 }
  }

  const labels = doors.map((d) => (d.building ?? '').trim())
  const unique = Array.from(new Set(labels))
  const names = unique.length > 1 ? unique.sort((a, b) => naturalSort(a, b)) : ['']
  const compound = names.length > 1

  type Raw = { name: string; left: number; width: number; floors: number[]; list: DoorUnit[]; hasTower: boolean }
  const raws: Raw[] = []
  let cursor = 0
  for (const name of names) {
    const list = doors.filter((d) => (compound ? (d.building ?? '').trim() === name : true))
    const floors = Array.from(new Set(list.map((d) => d.floor ?? 0))).sort((a, b) => a - b)
    const most = Math.max(1, ...floors.map((f) => list.filter((d) => (d.floor ?? 0) === f).length))
    const width = Math.max(4, most * DOOR_GAP + 0.8)
    const hasTower = floors.length > 1
    raws.push({ name: name || 'Other', left: cursor, width, floors, list, hasTower })
    cursor += width + (hasTower ? BAY_W + 1.6 : 1.6)
  }
  const last = raws[raws.length - 1]
  const maxX = last.left + last.width + (last.hasTower ? BAY_W : 0)
  const shift = -maxX / 2

  const blds: Bld[] = []
  const towers: Tower[] = []
  const placed: DoorPlaced[] = []
  raws.forEach((r, bi) => {
    const cx = r.left + r.width / 2 + shift
    const levels = r.floors.length
    const bay0 = r.left + r.width + shift
    blds.push({ name: r.name, cx, width: r.width, levels, height: levels * FH, bay: r.hasTower ? bay0 : null })
    if (r.hasTower) towers.push({ x: bay0 + BAY_W / 2, x0: bay0, x1: bay0 + BAY_W, xl: bay0 + 0.55, xr: bay0 + BAY_W - 0.75, zF: ZF, zB: ZB, levels: levels - 1, b: bi })
    r.floors.forEach((f, li) => {
      const row = r.list.filter((d) => (d.floor ?? 0) === f).sort((a, b) => naturalSort(a.label, b.label))
      row.forEach((d, i) => {
        placed.push({ ...d, x: cx + (i - (row.length - 1) / 2) * DOOR_GAP, y: li * FH + 0.1, frontZ: FRONT, standZ: li === 0 ? STAND_G : STAND_UP, level: li, b: bi })
      })
    })
  })
  const tallest = Math.max(...blds.map((b) => b.height))
  return {
    mode: compound ? 'compound' : 'block',
    doors: placed,
    blds,
    towers,
    rows: [],
    half: Math.max(Math.abs(-maxX / 2), Math.abs(maxX / 2)) + 3,
    laneX: 0,
    minZ: MIN_Z_BUILDINGS,
    height: tallest,
  }
}

// Works out the points to walk through, including the stairs, so you never walk through a wall.
function buildRoute(cur: Cur, dest: Dest, L: Layout, pos: THREE.Vector3): { pts: THREE.Vector3[]; stairs: boolean } {
  const pts: THREE.Vector3[] = []
  let stairs = false

  if (L.mode === 'estate') {
    if (cur.b !== dest.b) {
      if (cur.b < 0) {
        pts.push(V(pos.x, 0, -1.2))
        pts.push(V(L.laneX, 0, -1.2))
      } else {
        pts.push(V(L.laneX, 0, pos.z))
      }
      pts.push(V(L.laneX, 0, dest.b < 0 ? -1.2 : L.rows[dest.b].street))
    }
    pts.push(V(dest.x, 0, dest.z))
    return { pts, stairs }
  }

  const towerOf = (bi: number) => L.towers.find((x) => x.b === bi)
  const H = FH / 2
  const upFrom = (t: Tower, f: number) => [V(t.xr, f * FH + H, t.zF), V(t.xr, f * FH + H, t.zB), V(t.xl, (f + 1) * FH, t.zB), V(t.xl, (f + 1) * FH, t.zF)]
  const downFrom = (t: Tower, f: number) => [V(t.xl, (f + 1) * FH, t.zB), V(t.xr, f * FH + H, t.zB), V(t.xr, f * FH + H, t.zF), V(t.xl, f * FH, t.zF)]
  const inBuilding = cur.level > 0 || !!cur.mid
  const tFrom = inBuilding ? towerOf(cur.b) : undefined

  // Already on the right balcony: just walk along it.
  if (tFrom && !cur.mid && dest.level === cur.level && dest.b === cur.b) {
    pts.push(V(dest.x, dest.level * FH, dest.z))
    return { pts, stairs }
  }

  if (tFrom) {
    const sameB = dest.level > 0 && dest.b === cur.b
    const target = sameB ? dest.level : 0
    let node = cur.level
    if (cur.mid) {
      const back = pos.z < (tFrom.zF + tFrom.zB) / 2
      if (target >= cur.level + 1) {
        if (!back) pts.push(V(tFrom.xr, cur.level * FH + H, tFrom.zB))
        pts.push(V(tFrom.xl, (cur.level + 1) * FH, tFrom.zB), V(tFrom.xl, (cur.level + 1) * FH, tFrom.zF))
        node = cur.level + 1
      } else {
        if (back) pts.push(V(tFrom.xr, cur.level * FH + H, tFrom.zF))
        pts.push(V(tFrom.xl, cur.level * FH, tFrom.zF))
        node = cur.level
      }
    } else if (pos.z > FRONT + 0.2) {
      // On the balcony: step back into the stairwell.
      pts.push(V(tFrom.xl, cur.level * FH, STAND_UP), V(tFrom.xl, cur.level * FH, tFrom.zF))
    }
    if (target > node) for (let f = node; f < target; f++) pts.push(...upFrom(tFrom, f))
    else if (target < node) for (let f = node - 1; f >= target; f--) pts.push(...downFrom(tFrom, f))
    if (target > 0) pts.push(V(tFrom.xl, target * FH, STAND_UP))
    else {
      pts.push(V(tFrom.xl, 0, -7.0))
    }
    stairs = true
    if (sameB) {
      pts.push(V(dest.x, dest.level * FH, dest.z))
      return { pts, stairs }
    }
  } else if (!inBuilding && pos.y < 0.05 && pos.z < MIN_Z_BUILDINGS - 0.1) {
    // Standing at the foot of the stairs: step out of the stairwell first.
    pts.push(V(pos.x, 0, -7.0))
  }

  if (dest.level > 0) {
    const t = towerOf(dest.b)
    if (t) {
      pts.push(V(t.xl, 0, -7.0), V(t.xl, 0, t.zF))
      for (let f = 0; f < dest.level; f++) pts.push(...upFrom(t, f))
      pts.push(V(t.xl, dest.level * FH, STAND_UP))
      stairs = true
    }
  }
  pts.push(V(dest.x, dest.level * FH, dest.z))
  return { pts, stairs }
}

// Keeps a tapped spot inside the compound and pushes it out of trees, houses and the Lodge props.
function settle(p: THREE.Vector3, L: Layout): THREE.Vector3 {
  const limit = Math.max(11, L.half)
  const len = Math.hypot(p.x, p.z)
  if (len > limit) {
    p.x = (p.x / len) * limit
    p.z = (p.z / len) * limit
  }
  const list: Obstacle[] = [...OBST_PLAZA]
  if (L.mode !== 'estate') list.push(...OBST_TREES)
  else for (const d of L.doors) list.push({ x: d.x, z: d.frontZ - 1, r: 1.1 })
  for (const o of list) {
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
  if (p.z < L.minZ) p.z = L.minZ
  p.y = 0
  return p
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
  pathRef: MutableRefObject<THREE.Vector3[]>
  posRef: MutableRefObject<THREE.Vector3>
  pendingRef: MutableRefObject<string | null>
  busyRef: MutableRefObject<boolean>
  sitRef: MutableRefObject<boolean>
  onArriveRef: MutableRefObject<(key: string) => void>
  joyRef: MutableRefObject<{ x: number; y: number }>
  joyMoveRef: MutableRefObject<(p: THREE.Vector3, dx: number, dz: number, m: number, dt: number) => number | null | undefined>
  joyBusyRef: MutableRefObject<() => void>
  flushRef: MutableRefObject<(p: THREE.Vector3) => void>
  onStandRef: MutableRefObject<() => void>
}

function Character({ url, height, pathRef, posRef, pendingRef, busyRef, sitRef, onArriveRef, joyRef, joyMoveRef, joyBusyRef, flushRef, onStandRef }: Shared & { url: string; height: number }) {
  const camera = useThree((st) => st.camera)
  const fw = useMemo(() => new THREE.Vector3(), [])
  const group = useRef<THREE.Group>(null)
  const bob = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => fit(scene, height), [scene, height])
  const { actions, names } = useAnimations(animations, group)
  const current = useRef<string | null>(null)
  const moving = useRef(false)

  const idleName = names.find((n) => /idle/i.test(n)) ?? null
  const sitName = names.find((n) => /sit/i.test(n)) ?? null
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
    const j = joyRef.current
    const jm = Math.hypot(j.x, j.y)
    if (jm > 0.12) {
      if (busyRef.current) {
        // On the stairs: finish the current flight, then the joystick takes over.
        joyBusyRef.current()
      } else {
        if (sitRef.current) onStandRef.current()
        pathRef.current.length = 0
        pendingRef.current = null
        camera.getWorldDirection(fw)
        fw.y = 0
        if (fw.lengthSq() > 0.0001) {
          fw.normalize()
          let dx = fw.x * -j.y + -fw.z * j.x
          let dz = fw.z * -j.y + fw.x * j.x
          const len = Math.hypot(dx, dz)
          if (len > 0.0001) {
            dx /= len
            dz /= len
            const m = Math.min(1, jm)
            const hd = joyMoveRef.current(g.position, dx, dz, m, dt)
            if (hd !== null) {
              let diff = (hd === undefined ? Math.atan2(dx, dz) : hd) - g.rotation.y
              diff = Math.atan2(Math.sin(diff), Math.cos(diff))
              g.rotation.y += diff * Math.min(1, dt * 12)
            }
            posRef.current.copy(g.position)
            if (!moving.current) {
              moving.current = true
              play(walkName ?? idleName)
            }
            if (bob.current) bob.current.position.y = !walkName ? Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.07 : 0
            return
          }
        }
      }
    }
    const path = pathRef.current
    const t = path[0]
    let isMoving = false
    if (sitRef.current && !t) {
      // Sitting on the bench: lower onto the seat, face the plaza, play the sitting pose.
      g.position.y += (0.32 - g.position.y) * Math.min(1, dt * 8)
      let dd = -Math.PI / 2 - g.rotation.y
      dd = Math.atan2(Math.sin(dd), Math.cos(dd))
      g.rotation.y += dd * Math.min(1, dt * 8)
      posRef.current.set(g.position.x, g.position.y, g.position.z)
      play(sitName ?? idleName ?? names[0] ?? null)
      moving.current = false
      return
    }
    if (t) {
      const dx = t.x - g.position.x
      const dz = t.z - g.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.08) {
        g.position.y = t.y
        path.shift()
        // A new command that waited for a landing starts here.
        flushRef.current(g.position)
        if (pathRef.current.length === 0) {
          busyRef.current = false
          // Arrived at a door, the board, the pole, the hall or the gate: tell the page to open it.
          const key = pendingRef.current
          pendingRef.current = null
          if (key) onArriveRef.current(key)
        }
      } else {
        isMoving = true
        const step = Math.min(dist, WALK_SPEED * (Math.abs(t.y - g.position.y) > 0.05 ? 0.8 : 1) * dt)
        const f = step / dist
        g.position.x += dx * f
        g.position.z += dz * f
        g.position.y += (t.y - g.position.y) * f
        const want = Math.atan2(dx, dz)
        let diff = want - g.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        g.rotation.y += diff * Math.min(1, dt * 10)
      }
    }
    posRef.current.set(g.position.x, g.position.y, g.position.z)

    if (isMoving !== moving.current) {
      moving.current = isMoving
      play(isMoving ? walkName ?? idleName : idleName ?? names[0] ?? null)
    }
    if (bob.current) {
      bob.current.position.y = isMoving && !walkName ? Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.07 : 0
    }
  })

  return (
    <group ref={group} position={[posRef.current.x, posRef.current.y, posRef.current.z]}>
      <group ref={bob}>
        <primitive object={obj} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.55, 0.8, 32]} />
        <meshBasicMaterial color={GOLD} />
      </mesh>
      <mesh position={[0, height + 0.55, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.2, 0.4, 12]} />
        <meshBasicMaterial color={GOLD} />
      </mesh>
    </group>
  )
}

function Marker({ pathRef }: { pathRef: MutableRefObject<THREE.Vector3[]> }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const p = pathRef.current
    const t = p.length > 0 ? p[p.length - 1] : null
    m.visible = t !== null
    if (t) {
      m.position.set(t.x, t.y + 0.03, t.z)
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

// The camera glides along with the character (also up the stairs), keeping the same angle.
function Follow({ posRef, controls }: { posRef: MutableRefObject<THREE.Vector3>; controls: MutableRefObject<any> }) {
  const camera = useThree((st) => st.camera)
  const first = useRef(true)
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (first.current) {
      first.current = false
      c.target.set(posRef.current.x, posRef.current.y + 1, posRef.current.z)
      camera.position.set(posRef.current.x, posRef.current.y + 3.2, posRef.current.z + 7)
      c.update()
      return
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 22)
    const ky = 1 - Math.exp(-Math.min(dt, 0.1) * 30)
    const dx = (posRef.current.x - c.target.x) * k
    const dy = (posRef.current.y + 1 - c.target.y) * ky
    const dz = (posRef.current.z - c.target.z) * k
    c.target.x += dx
    c.target.y += dy
    c.target.z += dz
    camera.position.x += dx
    camera.position.y += dy
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

const chipBtn: CSSProperties = { minHeight: 40, borderRadius: 999, border: '1px solid rgba(10,46,26,0.25)', background: 'rgba(250,247,242,0.95)', color: FOREST, fontSize: 12, fontWeight: 700, padding: '0 12px' }

// Round joystick: drag the knob any way to walk that way, release to stop.
function Joystick({ joyRef }: { joyRef: MutableRefObject<{ x: number; y: number }> }) {
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const id = useRef<number | null>(null)
  const R = 40
  const move = (e: RPointerEvent) => {
    const b = base.current
    if (!b) return
    const r = b.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > R) {
      dx = (dx / len) * R
      dy = (dy / len) * R
    }
    joyRef.current = { x: dx / R, y: dy / R }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const end = () => {
    id.current = null
    joyRef.current = { x: 0, y: 0 }
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
  }
  return (
    <div
      ref={base}
      aria-label="Walking joystick"
      style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(250,247,242,0.6)', border: '2px solid rgba(10,46,26,0.3)', touchAction: 'none', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onPointerDown={(e) => {
        e.stopPropagation()
        id.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) move(e)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} style={{ width: 52, height: 52, borderRadius: '50%', background: FOREST, opacity: 0.9, pointerEvents: 'none' }} />
    </div>
  )
}

const tap = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()
  fn()
}

// A tree or bush that sways a little in the breeze. The group sits at the base of the plant.
function Sway({ position, seed = 0, amp = 0.03, children }: { position: [number, number, number]; seed?: number; amp?: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st) => {
    const g = ref.current
    if (!g) return
    const tm = st.clock.elapsedTime
    g.rotation.z = Math.sin(tm * 0.9 + seed) * amp
    g.rotation.x = Math.cos(tm * 0.7 + seed * 1.3) * amp * 0.6
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

// A few slow clouds drifting across the sky.
function Clouds({ night }: { night: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st) => {
    const g = ref.current
    if (!g) return
    g.children.forEach((c, i) => {
      c.position.x = ((st.clock.elapsedTime * (0.25 + i * 0.07) + i * 14) % 60) - 30
    })
  })
  return (
    <group ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 11 + (i % 2) * 2, -16 - i * 3]} scale={[3 + i * 0.6, 0.7, 1.4]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color={night ? '#27403a' : '#ffffff'} transparent opacity={night ? 0.5 : 0.85} />
        </mesh>
      ))}
    </group>
  )
}

function Door({ d, selected, lit, onTap }: { d: DoorPlaced; selected: boolean; lit: boolean; onTap: () => void }) {
  const tex = useLabel(d.label, selected ? GOLD : CREAM)
  const color = TONE_COLOR[d.tone]
  const intensity = selected ? 0.7 : d.tone === 'taken' ? 0 : lit ? 0.9 : 0.25
  const leaf = useRef<THREE.MeshStandardMaterial>(null)
  const phase = useMemo(() => (d.x * 1.7 + d.y) % 6.28, [d.x, d.y])
  // Homes to let breathe gently so the eye finds them.
  useFrame((st) => {
    if (leaf.current && d.tone === 'to_let' && !selected) leaf.current.emissiveIntensity = intensity + 0.3 + Math.sin(st.clock.elapsedTime * 2.2 + phase) * 0.3
  })
  return (
    <group position={[d.x, d.y, d.frontZ]} onClick={tap(onTap)}>
      {/* frame, leaf, number plate and a step */}
      <mesh position={[0, 0.65, 0.02]}>
        <boxGeometry args={[1.02, 1.3, 0.06]} />
        <meshStandardMaterial color={selected ? GOLD : FOREST} />
      </mesh>
      <mesh position={[0, 0.62, 0.06]}>
        <boxGeometry args={[0.86, 1.14, 0.04]} />
        <meshStandardMaterial ref={leaf} color={color} emissive={color} emissiveIntensity={intensity} />
      </mesh>
      <mesh position={[0.26, 0.6, 0.1]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#e8d9a0" />
      </mesh>
      <mesh position={[0, 1.55, 0.05]}>
        <planeGeometry args={[0.8, 0.36]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.03, 0.35]}>
        <boxGeometry args={[1.1, 0.06, 0.6]} />
        <meshStandardMaterial color="#c9c4b6" />
      </mesh>
      {/* a bigger invisible box so a thumb can hit the door easily */}
      <mesh position={[0, 0.8, 0.12]}>
        <boxGeometry args={[1.3, 1.7, 0.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// The stairwell built into the building: walls, a roof, switchback stairs with a half landing, and a floor slab at every level.
function Stairs({ t, wall, slab, edge }: { t: Tower; wall: string; slab: string; edge: string }) {
  const H = (t.levels + 1) * FH
  const half = FH / 2
  const run = t.xr - t.xl
  const ang = Math.atan2(half, run)
  const len = Math.hypot(run, half)
  const treadColor = '#e6e1d4'
  const under = '#a39f93'
  const flights = Array.from({ length: t.levels }, (_, f) => f)
  const stepsOf = (f: number, up: boolean) =>
    Array.from({ length: STEPS }, (_, i) => {
      const x = up ? t.xl + (run * (i + 0.5)) / STEPS : t.xr - (run * (i + 0.5)) / STEPS
      const top = f * FH + (up ? 0 : half) + (half * (i + 1)) / STEPS
      return (
        <mesh key={`${f}-${up ? 'a' : 'b'}-${i}`} position={[x, top - 0.07, up ? t.zF : t.zB]}>
          <boxGeometry args={[run / STEPS + 0.02, 0.14, 0.9]} />
          <meshStandardMaterial color={treadColor} />
        </mesh>
      )
    })
  const zMid = (t.zF + t.zB) / 2
  return (
    <group>
      {/* walls: back, right and left. The front stays open so you can see the stairs. */}
      <mesh position={[t.x, H / 2, t.zB - 0.55]}>
        <boxGeometry args={[BAY_W, H, 0.15]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[t.x1 + 0.075, H / 2, zMid - 0.05]}>
        <boxGeometry args={[0.15, H, 2.2]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[t.x0 - 0.075, H / 2, zMid - 0.05]}>
        <boxGeometry args={[0.15, H, 2.2]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[t.x, H + 0.1, zMid - 0.05]}>
        <boxGeometry args={[BAY_W + 0.5, 0.2, 2.8]} />
        <meshStandardMaterial color={edge} />
      </mesh>
      <mesh position={[t.x, 0.04, zMid - 0.05]}>
        <boxGeometry args={[BAY_W, 0.08, 2.1]} />
        <meshStandardMaterial color={slab} />
      </mesh>
      {flights.map((f) => (
        <group key={f}>
          {stepsOf(f, true)}
          {stepsOf(f, false)}
          {/* the sloping concrete under each half flight */}
          <mesh position={[(t.xl + t.xr) / 2, f * FH + half / 2 - 0.2, t.zF]} rotation={[0, 0, ang]}>
            <boxGeometry args={[len, 0.18, 0.9]} />
            <meshStandardMaterial color={under} />
          </mesh>
          <mesh position={[(t.xl + t.xr) / 2, f * FH + half + half / 2 - 0.2, t.zB]} rotation={[0, 0, -ang]}>
            <boxGeometry args={[len, 0.18, 0.9]} />
            <meshStandardMaterial color={under} />
          </mesh>
          {/* half landing at the right end */}
          <mesh position={[(t.xr + t.x1) / 2, f * FH + half - 0.07, zMid - 0.05]}>
            <boxGeometry args={[t.x1 - t.xr, 0.14, 2.1]} />
            <meshStandardMaterial color={slab} />
          </mesh>
          <mesh position={[(t.xr + t.x1) / 2, f * FH + half + 0.22, FRONT]}>
            <boxGeometry args={[t.x1 - t.xr, 0.44, 0.06]} />
            <meshStandardMaterial color={edge} />
          </mesh>
        </group>
      ))}
      {/* a floor slab at every level above the ground */}
      {flights.map((f) => {
        const y = (f + 1) * FH - 0.07
        const wF = t.xl + 0.5 - t.x0
        const wB = t.xl + 0.05 - t.x0
        return (
          <group key={`s${f}`}>
            <mesh position={[t.x0 + wF / 2, y, t.zF]}>
              <boxGeometry args={[wF, 0.14, 1.0]} />
              <meshStandardMaterial color={slab} />
            </mesh>
            <mesh position={[t.x0 + wB / 2, y, t.zB]}>
              <boxGeometry args={[wB, 0.14, 1.0]} />
              <meshStandardMaterial color={slab} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function House({ d, body, roof }: { d: DoorPlaced; body: string; roof: string }) {
  return (
    <group position={[d.x, 0, d.frontZ - 1]}>
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[2.1, 1.5, 2]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[0, 1.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.75, 0.9, 4]} />
        <meshStandardMaterial color={roof} />
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

// The meeting hall: a small hall with a green roof.
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
  const pathRef = useRef<THREE.Vector3[]>([])
  const posRef = useRef(new THREE.Vector3(0, 0, 0.5))
  const pendingRef = useRef<string | null>(null)
  const busyRef = useRef(false) // true while climbing or going down stairs: new taps wait
  const stateRef = useRef<Cur>({ b: -1, level: 0 })
  const sitRef = useRef(false)
  const [sitting, setSitting] = useState(false)
  const onArriveRef = useRef<(key: string) => void>(onArrive)
  onArriveRef.current = (key: string) => {
    if (key === 'bench') {
      sitRef.current = true
      setSitting(true)
    } else onArrive(key)
  }
  const controls = useRef<any>(null)

  const L = useMemo(() => buildLayout(doors), [doors])
  const estate = L.mode === 'estate'

  const queuedRef = useRef<(() => void) | null>(null)
  const joyRef = useRef({ x: 0, y: 0 })
  const lines = useMemo(() => L.towers.map(stairLine), [L])
  const stairRef = useRef<{ line: StairLine; s: number } | null>(null)
  // If the joystick has me on the steps, work out where I really am before a tap or button plans a route.
  const syncStair = () => {
    const st = stairRef.current
    if (!st) return
    stairRef.current = null
    stateRef.current = curFromPos(st.line.t, posRef.current)
  }
  const startNow = (dest: Dest, key: string | null) => {
    syncStair()
    sitRef.current = false
    setSitting(false)
    const { pts, stairs } = buildRoute(stateRef.current, dest, L, posRef.current)
    stateRef.current = dest.level > 0 ? { b: dest.b, level: dest.level } : { b: estate ? dest.b : -1, level: 0 }
    pathRef.current = pts
    pendingRef.current = key
    busyRef.current = stairs
  }
  // On the stairs a new command waits for the next landing (at most one flight), then starts from there.
  const start = (dest: Dest, key: string | null) => {
    if (busyRef.current) {
      queuedRef.current = () => startNow(dest, key)
      return
    }
    queuedRef.current = null
    startNow(dest, key)
  }
  const flushRef = useRef<(p: THREE.Vector3) => void>(() => {})
  flushRef.current = (p: THREE.Vector3) => {
    const q = queuedRef.current
    if (!q) return
    queuedRef.current = null
    if (p.y > 0.05 && L.towers.length > 0) {
      let best = L.towers[0]
      for (const tw of L.towers) if (Math.abs(tw.x - p.x) < Math.abs(best.x - p.x)) best = tw
      stateRef.current = curFromPos(best, p)
    } else stateRef.current = { b: -1, level: 0 }
    busyRef.current = false
    q()
  }
  const joyBusyRef = useRef<() => void>(() => {})
  joyBusyRef.current = () => {
    if (queuedRef.current) return
    queuedRef.current = () => {
      pathRef.current = []
      pendingRef.current = null
    }
  }
  const joyMoveRef = useRef<(p: THREE.Vector3, dx: number, dz: number, m: number, dt: number) => number | null | undefined>(() => undefined)
  const enterStair = (tw: Tower, k: number, p: THREE.Vector3) => {
    const line = lines.find((l) => l.t === tw)
    if (!line) return
    stairRef.current = { line, s: line.cum[k * 4] }
    p.set(tw.xl, k * FH, tw.zF)
  }
  // Walk the staircase with the joystick: push along the steps to go up or down, push toward the camera at a floor to step out.
  const stairStep = (st: { line: StairLine; s: number }, p: THREE.Vector3, dx: number, dz: number, sp: number): number | null => {
    const { pts, cum, t: tw } = st.line
    const n = pts.length
    const total = cum[n - 1]
    const tang = (i: number) => {
      const a = pts[i]
      const b = pts[i + 1]
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
      return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }
    }
    let iF = 0
    while (iF < n - 2 && cum[iF + 1] <= st.s + 1e-6) iF++
    let iB = 0
    while (iB < n - 2 && cum[iB + 1] < st.s - 1e-6) iB++
    // at a floor? then pushing toward the camera steps out
    const nodeK = cum.findIndex((c, i) => i % 4 === 0 && Math.abs(c - st.s) < 0.03)
    if (nodeK >= 0 && dz > 0.6) {
      const k = nodeK / 4
      p.set(tw.xl, k * FH, tw.zF)
      stateRef.current = k === 0 ? { b: -1, level: 0 } : { b: tw.b, level: k }
      stairRef.current = null
      return null
    }
    const uF = tang(iF)
    const uB = tang(iB)
    const fwd = dx * uF.x + dz * uF.z
    const bwd = -(dx * uB.x + dz * uB.z)
    let delta = 0
    let u = uF
    if (fwd >= bwd) {
      if (fwd > 0.15) delta = fwd * sp
    } else if (bwd > 0.15) {
      delta = -bwd * sp
      u = { x: -uB.x, z: -uB.z }
    }
    if (delta === 0) return null
    st.s = Math.min(total, Math.max(0, st.s + delta))
    let j = 0
    while (j < n - 2 && cum[j + 1] <= st.s) j++
    const f = (st.s - cum[j]) / (cum[j + 1] - cum[j] || 1)
    p.set(pts[j].x + (pts[j + 1].x - pts[j].x) * f, pts[j].y + (pts[j + 1].y - pts[j].y) * f, pts[j].z + (pts[j + 1].z - pts[j].z) * f)
    return Math.atan2(u.x, u.z)
  }
  joyMoveRef.current = (p, dx, dz, m, dt) => {
    const sp = WALK_SPEED * 1.3 * m * dt
    const st = stairRef.current
    if (st) return stairStep(st, p, dx, dz, sp)
    const cur = stateRef.current
    if (cur.mid) {
      // Stopped on a half landing: carry on from there.
      const tw = L.towers.find((x) => x.b === cur.b)
      const line = tw ? lines.find((l) => l.t === tw) : undefined
      if (tw && line) {
        const back = p.z < (tw.zF + tw.zB) / 2
        const ns = { line, s: line.cum[cur.level * 4 + (back ? 2 : 1)] }
        stairRef.current = ns
        return stairStep(ns, p, dx, dz, sp)
      }
    }
    if (cur.level > 0 && cur.b >= 0 && L.blds[cur.b]) {
      // On a balcony: slide along it. At the stairwell, push away from the camera to go in.
      const b = L.blds[cur.b]
      const tw = L.towers.find((x) => x.b === cur.b)
      const hi = tw ? tw.xl : b.cx + b.width / 2 - 0.5
      let nx = Math.min(hi, Math.max(b.cx - b.width / 2 + 0.5, p.x + dx * sp))
      p.y = cur.level * FH
      if (tw && Math.abs(nx - tw.xl) < 0.5 && (dz < -0.3 || p.z < FRONT + 0.1)) {
        nx = Math.min(tw.xl + 0.45, Math.max(tw.xl - 0.45, nx))
        p.x = nx
        p.z = Math.max(tw.zF, Math.min(STAND_UP, p.z + dz * sp))
        if (p.z <= tw.zF + 0.02 && Math.abs(p.x - tw.xl) < 0.45) enterStair(tw, cur.level, p)
        return undefined
      }
      p.x = nx
      p.z += (STAND_UP - p.z) * Math.min(1, dt * 8)
      return undefined
    }
    const nx = p.x + dx * sp
    const nz = p.z + dz * sp
    const foot = L.towers.find((tw) => Math.abs(nx - tw.xl) < 0.6)
    if (foot && nz < MIN_Z_BUILDINGS + 0.2 && (dz < 0 || p.z < MIN_Z_BUILDINGS)) {
      // Walking into the foot of the stairs.
      p.x = Math.min(foot.xl + 0.55, Math.max(foot.xl - 0.55, nx))
      p.z = Math.max(foot.zF, nz)
      p.y = 0
      if (p.z <= foot.zF + 0.02 && Math.abs(p.x - foot.xl) < 0.5) enterStair(foot, 0, p)
      return undefined
    }
    const q = settle(V(nx, 0, nz), L)
    p.x = q.x
    p.z = q.z
    p.y = 0
    let row = -1
    if (estate && p.z < -5.2) {
      let best = 0
      L.rows.forEach((r, i) => {
        if (Math.abs(r.street - p.z) < Math.abs(L.rows[best].street - p.z)) best = i
      })
      row = best
    }
    stateRef.current = { b: row, level: 0 }
    return undefined
  }
  const onStandRef = useRef<() => void>(() => {})
  onStandRef.current = () => {
    sitRef.current = false
    setSitting(false)
  }

  const goTo = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    walkToPoint(e.point.clone())
  }
  const walkToPoint = (raw: THREE.Vector3) => {
    const p = settle(raw, L)
    let row = -1
    if (estate && p.z < -5.2) {
      let best = 0
      L.rows.forEach((r, i) => {
        if (Math.abs(r.street - p.z) < Math.abs(L.rows[best].street - p.z)) best = i
      })
      p.z = L.rows[best].street
      row = best
    }
    start({ b: row, level: 0, x: p.x, z: p.z }, null)
  }
  const goBalcony = (bi: number, lvl: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const b = L.blds[bi]
    const x = Math.min(b.cx + b.width / 2 - 0.5, Math.max(b.cx - b.width / 2 + 0.5, e.point.x))
    start({ b: bi, level: lvl, x, z: STAND_UP }, null)
  }
  const goDoor = (d: DoorPlaced) => start({ b: d.b, level: d.level, x: d.x, z: d.standZ }, 'door:' + d.id)
  const goPlace = (k: SpotKey) => start({ b: -1, level: 0, x: SPOTS[k][0], z: SPOTS[k][1] }, k)

  // Up or down one floor using the outside staircase.
  const floor = (dir: 1 | -1) => {
    if (L.towers.length === 0) return
    syncStair()
    const cur = stateRef.current
    let bi = cur.level > 0 || cur.mid ? cur.b : -1
    if (bi < 0) {
      let best = L.towers[0].b
      for (const tw of L.towers) if (Math.abs(L.blds[tw.b].cx - posRef.current.x) < Math.abs(L.blds[best].cx - posRef.current.x)) best = tw.b
      bi = best
    }
    const b = L.blds[bi]
    const here = cur.mid && dir < 0 ? cur.level + 1 : cur.level
    const next = Math.max(0, Math.min(b.levels - 1, here + dir))
    if (next === here && !cur.mid) return
    const x = Math.min(b.cx + b.width / 2 - 0.5, Math.max(b.cx - b.width / 2 + 0.5, posRef.current.x))
    start({ b: bi, level: next, x, z: next === 0 ? STAND_G : STAND_UP }, null)
  }
  const standUp = () => {
    sitRef.current = false
    setSitting(false)
  }
  const zoomMe = (dist: number) => {
    const c = controls.current
    if (!c) return
    const dir = new THREE.Vector3().subVectors(c.object.position, c.target).normalize()
    c.target.set(posRef.current.x, posRef.current.y + 1, posRef.current.z)
    c.object.position.copy(c.target).addScaledVector(dir, dist)
    c.update()
  }

  const sky = night ? '#0b1a14' : '#dff0e6'
  const lamps = night && light === 'on'
  const lampXs = estate ? [0] : L.blds.slice(0, 2).map((b) => b.cx)
  const camY = 3.4
  const camZ = 7.6
  const farOut = Math.max(16, L.half * 1.2, L.height * 2.2)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }} onScroll={(e) => { e.currentTarget.scrollLeft = 0; e.currentTarget.scrollTop = 0 }} onContextMenu={(e) => e.preventDefault()}>
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, camY, camZ], fov: 50 }}>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 24, 60]} />
      <Clouds night={night} />
      <hemisphereLight args={night ? ['#8fa8ff', '#1b2a22', 0.45] : ['#ffffff', '#b7c9bd', 1]} />
      <directionalLight position={[6, 10, 6]} intensity={night ? 0.25 : 1.1} color={night ? '#9db4ff' : '#ffffff'} />

      {/* When the light is on at night: warm glow at the pole and along the doors. */}
      {lamps && (
        <>
          <pointLight position={[-4.5, 3.1, 0.5]} intensity={40} distance={14} decay={2} color="#ffc85a" />
          {lampXs.map((x) => (
            <pointLight key={x} position={[x, 2.6, -6.4]} intensity={30} distance={10} decay={2} color="#ffd89a" />
          ))}
        </>
      )}

      {/* grass and the plaza, in the lodge theme colour. Tap either to walk. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -(L.rows.length > 1 ? (L.rows.length - 1) * ROW_SP * 0.5 : 0)]} onClick={goTo}>
        <circleGeometry args={[Math.max(16, L.half + 6, L.rows.length * ROW_SP + 8), 48]} />
        <meshStandardMaterial color="#b9d7a8" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={goTo}>
        <circleGeometry args={[4.2, 48]} />
        <meshStandardMaterial color={t.plaza} />
      </mesh>

      <Marker pathRef={pathRef} />

      {/* buildings with balconies and an outside staircase (block and compound) */}
      {L.blds.map((b, bi) => (
        <group key={bi}>
          <mesh position={[b.cx, b.height / 2, WALL_Z]} onClick={goTo}>
            <boxGeometry args={[b.width, b.height, 1]} />
            <meshStandardMaterial color={t.body} />
          </mesh>
          <mesh position={[b.cx, b.height + 0.1, WALL_Z]}>
            <boxGeometry args={[b.width + 0.5, 0.2, 1.4]} />
            <meshStandardMaterial color={t.ledge} />
          </mesh>
          {Array.from({ length: Math.max(0, b.levels - 1) }, (_, i) => i + 1).map((lvl) => {
            const left = b.cx - b.width / 2 - 0.15
            const right = b.bay !== null ? b.bay + BAY_W : b.cx + b.width / 2 + 0.15
            const w = right - left
            const x = (left + right) / 2
            return (
              <group key={lvl}>
                <mesh position={[x, lvl * FH - 0.06, FRONT + 0.5]} onClick={goBalcony(bi, lvl)}>
                  <boxGeometry args={[w, 0.12, 1]} />
                  <meshStandardMaterial color={t.ledge} />
                </mesh>
                <mesh position={[x, lvl * FH + 0.2, FRONT + 0.98]}>
                  <boxGeometry args={[w, 0.4, 0.05]} />
                  <meshStandardMaterial color={t.edge} />
                </mesh>
              </group>
            )
          })}
          {L.blds.length > 1 && (
            <Html position={[b.cx, b.height + 0.9, WALL_Z]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
              <div style={labelStyle}>{b.name}</div>
            </Html>
          )}
          {/* level 5: string lights over the doors */}
          {level >= 5 &&
            Array.from({ length: 9 }, (_, i) => {
              const f = i / 8
              return (
                <mesh key={i} position={[b.cx + (f - 0.5) * b.width, 1.9 - Math.sin(f * Math.PI) * 0.18, FRONT + 0.15]}>
                  <sphereGeometry args={[0.07, 8, 8]} />
                  <meshStandardMaterial color="#ffe2a0" emissive="#ffc85a" emissiveIntensity={night ? 3 : 0.8} />
                </mesh>
              )
            })}
        </group>
      ))}
      {L.towers.map((tw) => (
        <Stairs key={tw.b} t={tw} wall={t.body} slab={t.ledge} edge={t.edge} />
      ))}

      {/* estate: a house and a street for every row of homes */}
      {estate &&
        L.rows.map((r, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, r.street]} onClick={goTo}>
            <planeGeometry args={[L.laneX * 2, 2.4]} />
            <meshStandardMaterial color={t.plaza} />
          </mesh>
        ))}
      {estate && L.doors.map((d) => <House key={'h' + d.id} d={d} body={t.body} roof={t.roof} />)}

      {L.doors.map((d) => (
        <Door key={d.id} d={d} selected={d.id === selectedDoor} lit={lamps} onTap={() => goDoor(d)} />
      ))}

      <Board onTap={() => goPlace('board')} />
      <LightPole light={light} night={night} onTap={() => goPlace('light')} />
      <Hall onTap={() => goPlace('hall')} />
      <Gate name={lodgeName} trusted={trusted} level={level} night={night} onTap={() => goPlace('gate')} />

      <Suspense fallback={null}>
        <Character key={character} url={CHARACTERS[character]} height={2.0} pathRef={pathRef} posRef={posRef} pendingRef={pendingRef} busyRef={busyRef} sitRef={sitRef} onArriveRef={onArriveRef} joyRef={joyRef} joyMoveRef={joyMoveRef} joyBusyRef={joyBusyRef} flushRef={flushRef} onStandRef={onStandRef} />
        <Piece url={BUILDING} height={4.5} position={[-(L.half + 3.5), 0, -4.5]} rotY={0.3} />
        <Piece url={BUILDING} height={4.5} position={[L.half + 3.5, 0, -4.5]} rotY={-0.3} />
        {!estate && (
          <>
            <Sway position={[-7, 0, 1]} seed={1.7}><Piece url={TREES[0]} height={3} position={[0, 0, 0]} /></Sway>
            <Sway position={[7.5, 0, -2]} seed={3.4}><Piece url={TREES[1]} height={3.4} position={[0, 0, 0]} /></Sway>
            <Sway position={[-3.5, 0, -2.5]} seed={5.1}><Piece url={TREES[2]} height={2.6} position={[0, 0, 0]} /></Sway>
            <Sway position={[4, 0, -3]} seed={6.8}><Piece url={TREES[0]} height={2.8} position={[0, 0, 0]} /></Sway>
          </>
        )}
        <Sway position={[-2.2, 0, 2.5]} seed={8.5}><Piece url={BUSH} height={0.7} position={[0, 0, 0]} /></Sway>
        <Sway position={[2.6, 0, 2.8]} seed={10.2}><Piece url={BUSH} height={0.6} position={[0, 0, 0]} /></Sway>
        <group onClick={tap(() => goPlace('bench'))}>
          <Piece url={BENCH} height={0.8} position={[3, 0, 0.8]} rotY={-Math.PI / 2} />
          <mesh position={[3, 0.45, 0.8]}>
            <boxGeometry args={[1.2, 0.9, 2.2]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        {level >= 3 && GARDEN.map(([x, z, h]) => (
          <Sway key={`${x}-${z}`} position={[x, 0, z]} seed={x + z}>
            <Piece url={BUSH} height={h} position={[0, 0, 0]} />
          </Sway>
        ))}
      </Suspense>

      <OrbitControls ref={controls} target={[0, 1, 0.5]} enablePan={false} enableDamping={false} minDistance={2.5} maxDistance={farOut} maxPolarAngle={Math.PI / 2.1} />
      <Follow posRef={posRef} controls={controls} />

    </Canvas>
        <Joystick joyRef={joyRef} />
        <div style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
          {L.towers.length > 0 && (
            <>
              <button type="button" style={chipBtn} onClick={() => floor(1)}>⬆ Up a floor</button>
              <button type="button" style={chipBtn} onClick={() => floor(-1)}>⬇ Down a floor</button>
            </>
          )}
          {sitting && <button type="button" style={chipBtn} onClick={standUp}>🧍 Stand up</button>}
          <button type="button" style={chipBtn} onClick={() => zoomMe(5)}>🔍 Zoom to me</button>
          <button type="button" style={chipBtn} onClick={() => zoomMe(Math.max(16, L.half * 1.2, L.height * 2.2))}>🏘️ See all</button>
        </div>
        <div style={{ position: 'absolute', left: 8, top: 8, zIndex: 20, fontSize: 11, color: night ? '#e6f0ea' : FOREST, background: night ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.85)', borderRadius: 8, padding: '4px 8px', pointerEvents: 'none' }}>
          🟢 To let · 🟡 Yours · 🔵 Neighbour · ⚪ Taken
        </div>
    </div>
  )
}
