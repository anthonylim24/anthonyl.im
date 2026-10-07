/**
 * Bridges a Jelly soft body to a three.js BufferGeometry. The geometry's
 * position attribute *is* the jelly's particle array, so syncing is just
 * flagging it dirty and recomputing smooth normals.
 */
import * as THREE from 'three/webgpu'
import type { Jelly } from './jelly'

export function jellyGeometry(jelly: Jelly, index: ArrayLike<number>): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const pos = new THREE.BufferAttribute(jelly.x, 3)
  pos.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', pos)
  // Rest positions, for materials that want a stable surface coordinate
  // (painted textures, noise) that doesn't swim as the body deforms.
  geo.setAttribute('rest', new THREE.BufferAttribute(Float32Array.from(jelly.x), 3))
  geo.setIndex(Array.from(index))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

export function syncJellyGeometry(geo: THREE.BufferGeometry) {
  geo.attributes.position.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}
