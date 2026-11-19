'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Shared by the town and your room. Files live in /public/models. Names with spaces are encoded so the browser can find them.
export const M = (file: string) => '/models/' + encodeURIComponent(file)

export const CHARACTERS = {
  woman: M('Woman Casual by Quaternius - jpKRgGDxhk.glb'),
  man: M('Man by Quaternius - HMnuH5geEG.glb'),
}
export const BUILDING = M('building-type-b.glb')
export const TREES = [M('tree_default.glb'), M('tree_cone.glb'), M('tree_blocks.glb')]
export const BUSH = M('plant_bush.glb')
export const BENCH = M('bench.glb')

// Models come in different sizes, so each one is scaled to a height I choose and set on the ground.
export function fit(source: THREE.Object3D, height: number) {
  const obj = cloneSkinned(source)
  // Animated characters are measured with their bones applied (precise), otherwise they come out tiny.
  let skinned = false
  obj.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true
  })
  obj.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(obj, skinned).getSize(new THREE.Vector3())
  const s = size.y > 0 && Number.isFinite(size.y) ? height / size.y : 1
  obj.scale.multiplyScalar(s)
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj, skinned)
  if (Number.isFinite(box.min.y)) obj.position.y -= box.min.y
  return obj
}

export function Piece({ url, height, position, rotY = 0 }: { url: string; height: number; position: [number, number, number]; rotY?: number }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => fit(scene, height), [scene, height])
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <primitive object={obj} />
    </group>
  )
}
