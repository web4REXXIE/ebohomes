'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { themeOf } from '@/lib/lodge-themes'
import type { RoomItemKey } from '@/lib/eboville'
import { BENCH, BUSH, CHARACTERS, Piece, fit } from '@/components/eboville-shared'

// Your own room. It starts almost empty. Items appear as your own points grow. Only you see this room.

function Standing({ url, position }: { url: string; position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => fit(scene, 1.8), [scene])
  const { actions, names } = useAnimations(animations, group)
  useEffect(() => {
    const pick = names.find((n) => /idle/i.test(n)) ?? names[0]
    const a = pick ? actions[pick] : undefined
    a?.reset().fadeIn(0.2).play()
    return () => {
      a?.fadeOut(0.2)
    }
  }, [actions, names])
  return (
    <group ref={group} position={position}>
      <primitive object={obj} />
    </group>
  )
}

function Items({ items }: { items: RoomItemKey[] }) {
  const has = (k: RoomItemKey) => items.includes(k)
  return (
    <>
      {has('plant') && <Piece url={BUSH} height={0.7} position={[2.3, 0, -1.8]} />}
      {has('chair') && <Piece url={BENCH} height={0.8} position={[-1.9, 0, -1.7]} rotY={0.4} />}
      {has('rug') && (
        <mesh position={[0, 0.07, 0.7]}>
          <boxGeometry args={[2.2, 0.03, 1.5]} />
          <meshStandardMaterial color="#8b5a3c" />
        </mesh>
      )}
      {has('lantern') && (
        <group position={[-2.3, 2.1, -2.2]}>
          <mesh>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#ffe2a0" emissive="#ffc85a" emissiveIntensity={2.5} />
          </mesh>
          <pointLight intensity={8} distance={6} decay={2} color="#ffc85a" />
        </group>
      )}
      {has('table') && (
        <group position={[1.6, 0, -0.5]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[1, 0.06, 0.6]} />
            <meshStandardMaterial color="#8b6b47" />
          </mesh>
          {[[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.27, z]}>
              <boxGeometry args={[0.06, 0.54, 0.06]} />
              <meshStandardMaterial color="#5b4630" />
            </mesh>
          ))}
        </group>
      )}
      {has('art') && (
        <group position={[0, 1.8, -2.42]}>
          <mesh>
            <boxGeometry args={[1.3, 0.9, 0.05]} />
            <meshStandardMaterial color="#FAF7F2" />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[1.1, 0.7, 0.03]} />
            <meshStandardMaterial color="#3f7a4a" />
          </mesh>
        </group>
      )}
      {has('tv') && (
        <group position={[-1.2, 0, -2.3]}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[1.2, 0.8, 0.4]} />
            <meshStandardMaterial color="#5b4630" />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <boxGeometry args={[1.3, 0.78, 0.08]} />
            <meshStandardMaterial color="#111114" />
          </mesh>
          <mesh position={[0, 1.2, 0.05]}>
            <planeGeometry args={[1.2, 0.68]} />
            <meshStandardMaterial color="#2a4a6a" emissive="#2a4a6a" emissiveIntensity={0.8} />
          </mesh>
        </group>
      )}
      {has('water') && (
        <mesh position={[2.5, 0.35, 0.8]}>
          <cylinderGeometry args={[0.28, 0.3, 0.7, 16]} />
          <meshStandardMaterial color="#2563eb" />
        </mesh>
      )}
      {has('generator') && (
        <group position={[-2.4, 0, 0.5]}>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.9, 0.6, 0.6]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          <mesh position={[0.3, 0.75, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
            <meshStandardMaterial color="#2b3a33" />
          </mesh>
        </group>
      )}
      {has('pot') && (
        <group position={[2.3, 0, 2]}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.22, 0.17, 0.4, 16]} />
            <meshStandardMaterial color="#b4572f" />
          </mesh>
          <mesh position={[0, 0.65, 0]}>
            <sphereGeometry args={[0.32, 16, 16]} />
            <meshStandardMaterial color="#3f7a4a" />
          </mesh>
        </group>
      )}
    </>
  )
}

export default function EbovilleRoom({ character, theme, items }: { character: 'woman' | 'man'; theme?: string | null; items: RoomItemKey[] }) {
  const t = themeOf(theme)
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2.8, 6.8], fov: 42 }}>
      <color attach="background" args={['#efe9dc']} />
      <hemisphereLight args={['#ffffff', '#c9bfa8', 1]} />
      <directionalLight position={[3, 6, 5]} intensity={0.9} />

      {/* floor, back wall and left wall */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[6, 0.1, 5.4]} />
        <meshStandardMaterial color={t.plaza} />
      </mesh>
      <mesh position={[0, 1.5, -2.7]}>
        <boxGeometry args={[6, 3, 0.1]} />
        <meshStandardMaterial color={t.body} />
      </mesh>
      <mesh position={[-3, 1.5, 0]}>
        <boxGeometry args={[0.1, 3, 5.4]} />
        <meshStandardMaterial color={t.ledge} />
      </mesh>

      <Suspense fallback={null}>
        <Standing url={CHARACTERS[character]} position={[0, 0, 1.6]} />
        <Items items={items} />
      </Suspense>

      <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={4} maxDistance={10} minPolarAngle={0.6} maxPolarAngle={Math.PI / 2.1} minAzimuthAngle={-0.9} maxAzimuthAngle={0.9} />
    </Canvas>
  )
}
