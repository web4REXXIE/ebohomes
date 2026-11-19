'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { themeOf } from '@/lib/lodge-themes'

// EboVille, step 2: tap the ground and your character walks there.
// Files live in /public/models. Names with spaces are encoded so the browser can find them.
const M = (file: string) => '/models/' + encodeURIComponent(file)

export const CHARACTERS = {
  woman: M('Woman Casual by Quaternius - jpKRgGDxhk.glb'),
  man: M('Man by Quaternius - HMnuH5geEG.glb'),
}
const BUILDING = M('building-type-b.glb')
const TREES = [M('tree_default.glb'), M('tree_cone.glb'), M('tree_blocks.glb')]
const BUSH = M('plant_bush.glb')
const BENCH = M('bench.glb')

const WALK_SPEED = 2.4 // units per second: raise to walk faster
const LIMIT = 11 // how far from the middle you can walk

// Round areas the character should not stand on. Change a number if something feels blocked or open.
type Obstacle = { x: number; z: number; r: number }
const OBSTACLES: Obstacle[] = [
  { x: -7, z: 1, r: 0.9 },
  { x: 7, z: 0, r: 0.9 },
  { x: -3.5, z: -2.5, r: 0.8 },
  { x: 4, z: -3, r: 0.8 },
  { x: 3, z: 0.8, r: 1 },
  { x: -2.2, z: 2.5, r: 0.6 },
  { x: 2.6, z: 2.8, r: 0.6 },
  { x: -5.5, z: -6, r: 3 },
  { x: 5.5, z: -6, r: 3 },
]

// Keeps a tapped spot inside the compound and pushes it out of trees, the bench and buildings.
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
  p.y = 0
  return p
}

// Models come in different sizes, so each one is scaled to a height I choose and set on the ground.
function fit(source: THREE.Object3D, height: number) {
  const obj = cloneSkinned(source)
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
  const s = size.y > 0 ? height / size.y : 1
  obj.scale.multiplyScalar(s)
  const box = new THREE.Box3().setFromObject(obj)
  obj.position.y -= box.min.y
  return obj
}

function Piece({ url, height, position, rotY = 0 }: { url: string; height: number; position: [number, number, number]; rotY?: number }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => fit(scene, height), [scene, height])
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <primitive object={obj} />
    </group>
  )
}

type Shared = {
  targetRef: React.MutableRefObject<THREE.Vector3 | null>
  posRef: React.MutableRefObject<THREE.Vector3>
}

function Character({ url, height, targetRef, posRef, onAnims }: Shared & { url: string; height: number; onAnims: (names: string[]) => void }) {
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
    onAnims(names)
    play(idleName ?? names[0] ?? null)
  }, [names, idleName, play, onAnims])

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
      } else {
        isMoving = true
        const step = Math.min(dist, WALK_SPEED * dt)
        g.position.x += (dx / dist) * step
        g.position.z += (dz / dist) * step
        // turn to face where we are going, the short way round
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
    // If the model has no walk animation, a small hop shows it is moving.
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

// A small ring where you tapped. It disappears when you arrive.
function Marker({ targetRef }: { targetRef: React.MutableRefObject<THREE.Vector3 | null> }) {
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
      <meshBasicMaterial color="#16a34a" />
    </mesh>
  )
}

// The camera glides along with the character, keeping the same angle.
function Follow({ posRef, controls }: { posRef: React.MutableRefObject<THREE.Vector3>; controls: React.MutableRefObject<any> }) {
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

export default function EbovilleScene({ character, theme }: { character: 'woman' | 'man'; theme?: string | null }) {
  const t = themeOf(theme)
  const targetRef = useRef<THREE.Vector3 | null>(null)
  const posRef = useRef(new THREE.Vector3(0, 0, 0.5))
  const controls = useRef<any>(null)
  const [anims, setAnims] = useState<string[]>([])

  const goTo = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    targetRef.current = settle(e.point.clone())
  }

  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 3.2, 8.5], fov: 45 }}>
      <color attach="background" args={['#dff0e6']} />
      <fog attach="fog" args={['#dff0e6', 16, 34]} />
      <hemisphereLight args={['#ffffff', '#b7c9bd', 1]} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} />

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

      <Suspense fallback={null}>
        <Character key={character} url={CHARACTERS[character]} height={1.8} targetRef={targetRef} posRef={posRef} onAnims={setAnims} />
        <Piece url={BUILDING} height={4.5} position={[-5.5, 0, -6]} rotY={0.2} />
        <Piece url={BUILDING} height={4.5} position={[5.5, 0, -6]} rotY={-0.2} />
        <Piece url={TREES[0]} height={3} position={[-7, 0, 1]} />
        <Piece url={TREES[1]} height={3.4} position={[7, 0, 0]} />
        <Piece url={TREES[2]} height={2.6} position={[-3.5, 0, -2.5]} />
        <Piece url={TREES[0]} height={2.8} position={[4, 0, -3]} />
        <Piece url={BUSH} height={0.7} position={[-2.2, 0, 2.5]} />
        <Piece url={BUSH} height={0.6} position={[2.6, 0, 2.8]} />
        <Piece url={BENCH} height={0.8} position={[3, 0, 0.8]} rotY={-Math.PI / 2} />
      </Suspense>

      <OrbitControls
        ref={controls}
        target={[0, 1, 0.5]}
        enablePan={false}
        minDistance={4}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Follow posRef={posRef} controls={controls} />

      {/* Temporary helper text. Tell me what it says, then I will remove it. */}
      <Html fullscreen style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: 8, top: 8, right: 8, fontSize: 11, color: '#0A2E1A', background: 'rgba(255,255,255,0.8)', borderRadius: 8, padding: '4px 8px' }}>
          Tap the ground to walk. Animations found: {anims.length > 0 ? anims.join(', ') : 'none'}
        </div>
      </Html>
    </Canvas>
  )
}
