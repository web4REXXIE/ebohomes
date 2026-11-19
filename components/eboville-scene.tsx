'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { themeOf } from '@/lib/lodge-themes'

// EboVille, step 1: your character stands in the compound. No walking yet.
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

function Character({ url, height, position }: { url: string; height: number; position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => fit(scene, height), [scene, height])
  const { actions, names } = useAnimations(animations, group)

  // Play an idle animation if there is one. If the model has none, it just stands.
  useEffect(() => {
    const pick = names.find((n) => /idle/i.test(n)) ?? names[0]
    const action = pick ? actions[pick] : undefined
    action?.reset().fadeIn(0.2).play()
    return () => {
      action?.fadeOut(0.2)
    }
  }, [actions, names])

  return (
    <group ref={group} position={position}>
      <primitive object={obj} />
    </group>
  )
}

export default function EbovilleScene({ character, theme }: { character: 'woman' | 'man'; theme?: string | null }) {
  const t = themeOf(theme)
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 3.2, 8.5], fov: 45 }}>
      <color attach="background" args={['#dff0e6']} />
      <fog attach="fog" args={['#dff0e6', 16, 34]} />
      <hemisphereLight args={['#ffffff', '#b7c9bd', 1]} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} />

      {/* grass and the plaza, in the lodge theme colour */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[16, 48]} />
        <meshStandardMaterial color="#b9d7a8" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[4.2, 48]} />
        <meshStandardMaterial color={t.plaza} />
      </mesh>

      <Suspense fallback={null}>
        <Character url={CHARACTERS[character]} height={1.8} position={[0, 0, 0.5]} />
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
        target={[0, 1, 0]}
        enablePan={false}
        minDistance={4}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  )
}
