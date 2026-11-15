/**
 * Calls `onLost` once if the GPU behind a renderer goes away: a WebGPU
 * device's `lost` promise settling, or the canvas firing
 * `webglcontextlost` on the WebGL2 fallback (driver reset, the OS
 * reclaiming memory, too many contexts). Returns a stop function; call it
 * before disposing on purpose, since destroying a device also settles
 * `lost`.
 */
export function watchContextLoss(backend: unknown, canvas: HTMLCanvasElement, onLost: () => void): () => void {
  let watching = true
  const fire = () => {
    if (!watching) return
    watching = false
    canvas.removeEventListener('webglcontextlost', fire)
    onLost()
  }
  const device = (backend as { device?: { lost?: Promise<unknown> } } | null | undefined)?.device
  device?.lost?.then(fire, () => {})
  canvas.addEventListener('webglcontextlost', fire)
  return () => {
    watching = false
    canvas.removeEventListener('webglcontextlost', fire)
  }
}
