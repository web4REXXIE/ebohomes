'use client'

import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export const MODEL_URL = {
  tree: '/models/tree.glb',
  bush: '/models/bush.glb',
  house: '/models/house.glb',
  car: '/models/car.glb',
  lamp: '/models/lamp.glb',
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

function Loaded({ url, x, z, height, rotY }: { url: string; x: number; z: number; height: number; rotY: number }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const c = scene.clone(true)
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
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    const g = new THREE.Group()
    g.add(c)
    return g
  }, [scene, height])
  return <primitive object={obj} position={[x, 0, z]} rotation={[0, rotY, 0]} />
}

export function Prop({
  kind,
  x = 0,
  z = 0,
  height,
  rotY = 0,
  fallback = null,
}: {
  kind: ModelKind
  x?: number
  z?: number
  height: number
  rotY?: number
  fallback?: ReactNode
}) {
  return (
    <Guard fallback={fallback}>
      <Suspense fallback={fallback}>
        <Loaded url={MODEL_URL[kind]} x={x} z={z} height={height} rotY={rotY} />
      </Suspense>
    </Guard>
  )
}
