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
  ;(geo.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage)
  geo.computeBoundingSphere()
  return geo
}

/**
 * Per-frame update. Normals and the bounding sphere are computed straight on
 * the typed arrays: three's generic computeVertexNormals goes through
 * Vector3 accessors per corner and was half of every jelly scene's frame.
 */
export function syncJellyGeometry(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  const p = pos.array as Float32Array
  const n = nrm.array as Float32Array
  const idx = geo.index!.array
  n.fill(0)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3
    const b = idx[t + 1] * 3
    const c = idx[t + 2] * 3
    const e1x = p[b] - p[a]
    const e1y = p[b + 1] - p[a + 1]
    const e1z = p[b + 2] - p[a + 2]
    const e2x = p[c] - p[a]
    const e2y = p[c + 1] - p[a + 1]
    const e2z = p[c + 2] - p[a + 2]
    // Area-weighted face normal, like computeVertexNormals.
    const fx = e1y * e2z - e1z * e2y
    const fy = e1z * e2x - e1x * e2z
    const fz = e1x * e2y - e1y * e2x
    n[a] += fx; n[a + 1] += fy; n[a + 2] += fz
    n[b] += fx; n[b + 1] += fy; n[b + 2] += fz
    n[c] += fx; n[c + 1] += fy; n[c + 2] += fz
  }
  let cx = 0
  let cy = 0
  let cz = 0
  const count = p.length / 3
  for (let i = 0; i < p.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l
    n[i + 1] /= l
    n[i + 2] /= l
    cx += p[i]
    cy += p[i + 1]
    cz += p[i + 2]
  }
  cx /= count
  cy /= count
  cz /= count
  let r2 = 0
  for (let i = 0; i < p.length; i += 3) {
    const dx = p[i] - cx
    const dy = p[i + 1] - cy
    const dz = p[i + 2] - cz
    r2 = Math.max(r2, dx * dx + dy * dy + dz * dz)
  }
  const sphere = (geo.boundingSphere ??= new THREE.Sphere())
  sphere.center.set(cx, cy, cz)
  sphere.radius = Math.sqrt(r2)
  pos.needsUpdate = true
  nrm.needsUpdate = true
}
