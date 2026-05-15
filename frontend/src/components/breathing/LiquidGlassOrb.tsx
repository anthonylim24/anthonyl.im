import { useEffect, useRef } from 'react'
import { LiquidGlass } from '@ybouane/liquidglass'
import type { BreathPhase, TechniqueId } from '@/lib/constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ShaderOrb } from './ShaderOrb'

// Served same-origin so the WebGL texture upload isn't blocked by missing
// CORS headers from the Cloudflare worker that hosts the original asset.
const LEAVES_VIDEO_SRC = '/leaves.mp4'

// Per-element glass config. `zRadius` (bevel depth) is tuned for an orb
// whose diameter ranges roughly 32%–76% of the container, not a full-bleed
// dome — see `orbScaleForAmplitude` below.
const GLASS_CONFIG = {
  cornerRadius: 9999,
  zRadius: 36,
  refraction: 0.7,
  chromAberration: 0.06,
  edgeHighlight: 0.16,
  specular: 0.35,
  fresnel: 0.9,
  blurAmount: 0.0,
  saturation: 0.0,
  tintStrength: 0.0,
  shadowOpacity: 0.16,
  shadowSpread: 14,
  shadowOffsetY: 3,
  bevelMode: 0,
} as const

// Mirror ShaderOrb's body diameter so the glass element's bounds land
// exactly on the visible orb body at the current breath amplitude — making
// the glass appear to BE the orb instead of a static dome around it. See
// ShaderOrb's frag shader: `baseRadius = 0.16 + amp * 0.22`, diameter is
// `2 * baseRadius` in normalized canvas units.
const orbScaleForAmplitude = (amplitude: number) =>
  (0.16 + amplitude * 0.22) * 2

interface LiquidGlassOrbProps {
  phase: BreathPhase | null
  amplitude: number
  isActive: boolean
  techniqueId: TechniqueId
  themeColors?: [string, string]
  className?: string
  onClick?: () => void
}

/**
 * Breathing orb rendered as a liquid-glass body that scales with the breath.
 *
 * Layer order inside `rootRef` (all direct children — required for
 * `@ybouane/liquidglass` to sample them as the refraction scene):
 *   1. <video>      — leaves backdrop (drawn live via drawImage every frame)
 *   2. ShaderOrb    — colored breathing body. Renders a <button><canvas/></button>;
 *                     the library samples the inner canvas via drawImage every
 *                     frame so the body ends up inside the refraction.
 *   3. <div data-config> — the glass element. Its `height` (not a CSS
 *                     transform-scale) tracks the orb body diameter so the
 *                     glass IS the orb, not a static dome — see the inline
 *                     comment on the element for why height beats transform.
 *
 * Reduced-motion users skip the entire glass pipeline.
 */
export function LiquidGlassOrb({
  phase,
  amplitude,
  isActive,
  techniqueId,
  themeColors,
  className,
  onClick,
}: LiquidGlassOrbProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const root = rootRef.current
    const glass = glassRef.current
    if (!root || !glass) return

    let instance: LiquidGlass | null = null
    let cancelled = false

    LiquidGlass.init({ root, glassElements: [glass] })
      .then((inst) => {
        if (cancelled) inst.destroy()
        else instance = inst
      })
      .catch((err) => {
        // Don't crash the session if the glass can't initialize — the
        // underlying ShaderOrb still renders and remains interactive.
        console.warn('LiquidGlass init failed; falling back to plain orb', err)
      })

    return () => {
      cancelled = true
      instance?.destroy()
      instance = null
    }
  }, [reducedMotion])

  if (reducedMotion) {
    return (
      <ShaderOrb
        phase={phase}
        amplitude={amplitude}
        isActive={isActive}
        techniqueId={techniqueId}
        themeColors={themeColors}
        className={className}
        onClick={onClick}
      />
    )
  }

  const scale = orbScaleForAmplitude(amplitude)

  return (
    <div
      ref={rootRef}
      // overflow-hidden + rounded-full clips the rectangular leaves frame to
      // a circle so the surrounding video doesn't bleed past the orb area.
      className="absolute inset-0 overflow-hidden rounded-full"
    >
      <video
        src={LEAVES_VIDEO_SRC}
        crossOrigin="anonymous"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <ShaderOrb
        phase={phase}
        amplitude={amplitude}
        isActive={isActive}
        techniqueId={techniqueId}
        themeColors={themeColors}
        className="absolute inset-0"
        onClick={onClick}
      />

      {/* The glass is sized by actual `height` (not CSS transform-scale)
          because the library reads its dimensions from `offsetWidth`/
          `offsetHeight` to allocate the shader canvas — a CSS scale would
          desynchronise that allocation from the transformed
          `getBoundingClientRect` the library uses to crop the scene, which
          shows up as black sampling artifacts at the orb edges.
          `aspect-square` keeps width = height; the (centering-only)
          translate places it at the container's centre. */}
      <div
        ref={glassRef}
        className="absolute aspect-square rounded-full pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          height: `${(scale * 100).toFixed(3)}%`,
          transform: 'translate(-50%, -50%)',
        }}
        data-config={JSON.stringify(GLASS_CONFIG)}
      />
    </div>
  )
}
