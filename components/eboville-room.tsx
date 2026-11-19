'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { themeOf } from '@/lib/lodge-themes'
import { CHARACTERS, M, Piece, fit } from '@/components/eboville-shared'
import type * as THREE from 'three'

// EboVille: your own room. Only you see it. Items appear as your points grow (see lib/eboville.ts).
// Items are made from simple shapes so the room always loads, even on slow data.

const FOREST = '#0A2E1A'
const WOOD = '#8a6a44'

function Me({ url }: { url: string }) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => fit(scene, 1.7), [scene])
  const { actions, names } = useAnimations(animations, group)
  useEffect(() => {
    const idle = names.find((n) => /idle/i.test(n)) ?? names[0]
    if (idle) actions[idle]?.reset().fadeIn(0.2).play()
  }, [actions, names])
  return (
    <group ref={group} position={[0.2, 0, 0.6]} rotation={[0, 0.5, 0]}>
      <primitive object={obj} />
    </group>
  )
}

function Item({ k, accent }: { k: string; accent: string }) {
  switch (k) {
    case 'plant':
      return <Piece url={M('plant_bush.glb')} height={0.7} position={[2.3, 0, -2.2]} />
    case 'chair':
      return (
        <group position={[-1.9, 0, -1.4]} rotation={[0, 0.5, 0]}>
          <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.7, 0.1, 0.7]} /><meshStandardMaterial color={WOOD} /></mesh>
          <mesh position={[0, 0.75, -0.32]}><boxGeometry args={[0.7, 0.8, 0.08]} /><meshStandardMaterial color={WOOD} /></mesh>
          {[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 0.17, z]}><boxGeometry args={[0.07, 0.34, 0.07]} /><meshStandardMaterial color={WOOD} /></mesh>
          ))}
        </group>
      )
    case 'rug':
      return (
        <mesh position={[0, 0.012, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.3, 32]} />
          <meshStandardMaterial color={accent} />
        </mesh>
      )
    case 'lantern':
      return (
        <group position={[-2.6, 0, -2.4]}>
          <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.04, 0.05, 1.2, 8]} /><meshStandardMaterial color="#2b3a33" /></mesh>
          <mesh position={[0, 1.3, 0]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color="#ffe2a0" emissive="#ffc85a" emissiveIntensity={1.2} />
          </mesh>
          <pointLight position={[0, 1.3, 0]} intensity={4} distance={5} color="#ffc85a" />
        </group>
      )
    case 'table':
      return (
        <group position={[-0.1, 0, -2.3]}>
          <mesh position={[0, 0.5, 0]}><boxGeometry args={[1.3, 0.1, 0.7]} /><meshStandardMaterial color={WOOD} /></mesh>
          {[[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 0.25, z]}><boxGeometry args={[0.08, 0.5, 0.08]} /><meshStandardMaterial color={WOOD} /></mesh>
          ))}
        </group>
      )
    case 'art':
      return (
        <group position={[0.2, 2.0, -2.93]}>
          <mesh><boxGeometry args={[1.2, 0.8, 0.05]} /><meshStandardMaterial color={FOREST} /></mesh>
          <mesh position={[0, 0, 0.03]}><planeGeometry args={[1.05, 0.65]} /><meshStandardMaterial color={accent} /></mesh>
        </group>
      )
    case 'tv':
      return (
        <group position={[-0.1, 0.55, -2.3]}>
          <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.9, 0.55, 0.06]} /><meshStandardMaterial color="#15191a" /></mesh>
          <mesh position={[0, 0.4, 0.035]}><planeGeometry args={[0.8, 0.45]} /><meshStandardMaterial color="#9ec9ff" emissive="#4b8dff" emissiveIntensity={0.6} /></mesh>
        </group>
      )
    case 'water':
      return <Piece url={M('tank.glb')} height={0.9} position={[-2.5, 0, 0.6]} />
    case 'generator':
      return <Piece url={M('generator.glb')} height={0.8} position={[2.4, 0, 1.3]} rotY={-0.6} />
    case 'pot':
      return <Piece url={M('plant_flatTall.glb')} height={1.1} position={[2.6, 0, -0.7]} />
    default:
      return null
  }
}

export default function EbovilleRoom({ character, theme, items }: { character: 'woman' | 'man'; theme?: string | null; items: string[] }) {
  const t = themeOf(theme)
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 3.6, 7], fov: 45 }}>
      <color attach="background" args={['#e9efe9']} />
      <hemisphereLight args={['#ffffff', '#b7c9bd', 1]} />
      <directionalLight position={[4, 8, 5]} intensity={1} />

      {/* floor and the two walls you look at */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={t.plaza} />
      </mesh>
      <mesh position={[0, 1.5, -3]}>
        <boxGeometry args={[6, 3, 0.12]} />
        <meshStandardMaterial color={t.body} />
      </mesh>
      <mesh position={[-3, 1.5, 0]}>
        <boxGeometry args={[0.12, 3, 6]} />
        <meshStandardMaterial color={t.body} />
      </mesh>
      <mesh position={[0, 0.06, -2.97]}>
        <boxGeometry args={[6, 0.12, 0.06]} />
        <meshStandardMaterial color={t.ledge} />
      </mesh>

      <Suspense fallback={null}>
        <Me key={character} url={CHARACTERS[character]} />
        {items.map((k) => (
          <Item key={k} k={k} accent={t.roof} />
        ))}
      </Suspense>

      <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={4} maxDistance={11} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  )
}
