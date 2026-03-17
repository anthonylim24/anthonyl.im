import { useState } from 'react'

/** Feature-detect WebGL2 support. Runs once per component mount. */
export function useWebGL2(): boolean {
  const [supported] = useState(() => {
    if (typeof document === 'undefined') return false
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2')
      return gl !== null
    } catch {
      return false
    }
  })
  return supported
}
