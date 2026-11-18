'use client'

import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'

export const MODEL_URL = {
  tree: '/models/tree.glb',
  bush: '/models/bush.glb',
  house: '/models/house.glb',
  car: '/models/car.glb',
  lamp: '/models/lamp.glb',
  generator: '/models/generator.glb',
  tank: '/models/tank.glb',
  gate: '/models/gate.glb',
  person: '/models/person.glb',
  bus: '/models/bus.glb',
  wall: '/models/wall.glb',
} as const
export type ModelKind = keyof typeof MODEL_URL

// If a model file is missing or broken, show the fallback instead of crashing the scene.
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() {
    return { bad: true }
  }
  componentDidCatch() {}
  render() {
    return this.state.bad ? this.props.fallback : this.props.children
  }
}

function Loaded({ url, x, z, height, rotY, shadows, animation }: { url: string; x: number; z: number; height: number; rotY: number; shadows: boolean; animation?: string }) {
  const { scene, animations } = useGLTF(url)
  const obj = useMemo(() => {
    // cloneSkinned also keeps people (models with a skeleton) working when copied
    const c = cloneSkinned(scene)
    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const s = size.y > 0 ? height / size.y : 1
    c.scale.setScalar(s)
    c.position.set(-center.x * s, -box.min.y * s, -center.z * s)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = shadows
        m.receiveShadow = shadows
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false
      }
    })
    const g = new THREE.Group()
    g.add(c)
    return g
  }, [scene, height, shadows])
  // Play a named animation (for example Idle or Walk on the person) if the model has it
  const mixer = useMemo(() => (animation && animations.length ? new THREE.AnimationMixer(obj) : null), [animation, animations, obj])
  useEffect(() => {
    if (!mixer || !animation) return
    const clip = animations.find((a) => a.name.endsWith('|' + animation) || a.name === animation)
    if (clip) mixer.clipAction(clip).play()
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer, animation, animations])
  useFrame((_, dt) => {
    mixer?.update(dt)
  })
  return <primitive object={obj} position={[x, 0, z]} rotation={[0, rotY, 0]} />
}

export function Prop({
  kind,
  x = 0,
  z = 0,
  height,
  rotY = 0,
  shadows = true,
  fallback = null,
  animation,
}: {
  kind: ModelKind
  x?: number
  z?: number
  height: number
  rotY?: number
  shadows?: boolean
  fallback?: ReactNode
  animation?: string
}) {
  return (
    <Guard fallback={fallback}>
      <Suspense fallback={fallback}>
        <Loaded url={MODEL_URL[kind]} x={x} z={z} height={height} rotY={rotY} shadows={shadows} animation={animation} />
      </Suspense>
    </Guard>
  )
}
