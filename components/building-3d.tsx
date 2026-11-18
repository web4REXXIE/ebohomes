'use client'

import { useMemo, useState, useEffect } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { naturalSort, type ViewUnit } from '@/lib/estate-view'

type Props = {
  units: ViewUnit[]
  toneOf: (u: ViewUnit) => string
  selectedId: string | null
  onSelect: (id: string) => void
}

const GAP = 1.15
const FLOOR_H = 1.1
const GREEN = '#16a34a'
const GREY = '#9aa3a0'
const GOLD = '#d4a017'
const BLUE = '#3b82f6'
const FOREST = '#0A2E1A'

type Placed = { unit: ViewUnit; x: number; y: number; z: number }

function colorFor(tone: string) {
  if (tone === 'to_let') return GREEN
  if (tone === 'neighbour') return BLUE
  return GREY
}

function Home({ p, tone, selected, house, onSelect }: { p: Placed; tone: string; selected: boolean; house: boolean; onSelect: (id: string) => void }) {
  const color = selected ? GOLD : colorFor(tone)
  const glow = tone === 'to_let' || selected
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect(p.unit.id)
  }
  return (
    <group position={[p.x, p.y, p.z]} onClick={click}>
      <mesh>
        <boxGeometry args={[1, 0.85, 1]} />
        <meshStandardMaterial color={color} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 0.35 : 0} />
      </mesh>
      {house && (
        <mesh position={[0, 0.85, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.85, 0.7, 4]} />
          <meshStandardMaterial color={FOREST} />
        </mesh>
      )}
    </group>
  )
}

function Scene({ units, toneOf, selectedId, onSelect }: Props) {
  const layout = useMemo(() => {
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
          placed.push({ unit: u, x: (i - (row.length - 1) / 2) * GAP, y: fi * FLOOR_H + 0.5, z: 0.35 })
        })
      })
      return { hasFloors, placed, w: widest * GAP, h: floors.length * FLOOR_H, d: 1 }
    }
    const cols = Math.ceil(Math.sqrt(sorted.length))
    const rows = Math.ceil(sorted.length / cols)
    sorted.forEach((u, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      placed.push({ unit: u, x: (c - (cols - 1) / 2) * 1.8, y: 0.45, z: (r - (rows - 1) / 2) * 1.8 })
    })
    return { hasFloors, placed, w: cols * 1.8, h: 1.5, d: rows * 1.8 }
  }, [units])

  const size = Math.max(layout.w, layout.h, layout.d)

  return (
    <>
      <color attach="background" args={['#e6f0ea']} />
      <fog attach="fog" args={['#e6f0ea', size * 2.5, size * 6]} />
      <hemisphereLight args={['#ffffff', '#b7c9bd', 0.9]} />
      <directionalLight position={[6, 12, 8]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[size * 1.6, 48]} />
        <meshStandardMaterial color="#cfe0d4" />
      </mesh>
      {layout.hasFloors && (
        <>
          <mesh position={[0, layout.h / 2, -0.25]}>
            <boxGeometry args={[layout.w + 0.4, layout.h, 1.1]} />
            <meshStandardMaterial color="#f3efe6" />
          </mesh>
          <mesh position={[0, layout.h + 0.1, -0.1]}>
            <boxGeometry args={[layout.w + 0.7, 0.25, 1.6]} />
            <meshStandardMaterial color={FOREST} />
          </mesh>
        </>
      )}
      {layout.placed.map((p) => (
        <Home key={p.unit.id} p={p} tone={toneOf(p.unit)} selected={p.unit.id === selectedId} house={!layout.hasFloors} onSelect={onSelect} />
      ))}
      <OrbitControls
        target={[0, layout.h / 2, 0]}
        enablePan
        enableDamping={false}
        minDistance={3}
        maxDistance={size * 3 + 6}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  )
}

export default function Building3D(props: Props) {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    try {
      const c = document.createElement('canvas')
      setOk(!!(c.getContext('webgl2') || c.getContext('webgl')))
    } catch {
      setOk(false)
    }
  }, [])

  if (ok === false) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">3D does not work on this phone. Please use Flat view.</p>
  }
  const dist = Math.max(props.units.length > 12 ? 14 : 8, 8)
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border" style={{ height: 420, touchAction: 'none' }}>
        {ok && (
          <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [dist * 0.6, dist * 0.7, dist], fov: 45 }}>
            <Scene {...props} />
          </Canvas>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Drag to turn. Pinch to zoom. Tap a home. Touch outside the box to scroll the page.</p>
    </div>
  )
}
