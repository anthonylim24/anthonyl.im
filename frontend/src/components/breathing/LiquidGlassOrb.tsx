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
  // Deeper bevel + max refraction so the orb reads as a thick glass marble
  // that bends light dramatically, not a flat lens.
  zRadius: 96,
  refraction: 1.4,
  chromAberration: 0.28,
  edgeHighlight: 0.22,
  specular: 0.45,
  fresnel: 0.0,
  blurAmount: 0.0,
  saturation: 0.3,
  tintStrength: 0.0,
  // Shadow disabled — the library renders the drop shadow into a 20px
  // padding ring outside the glass element, which would be visible as a
  // dark halo past the orb body's edge.
  shadowOpacity: 0.0,
  shadowSpread: 0,
  shadowOffsetY: 0,
  bevelMode: 0,
} as const

// Glass element must stay strictly inside the visible orb body so the
// refraction never extends past the orange edge. ShaderOrb's body radius is
// `0.16 + amp * 0.22` and wobbles up to ~0.08 outward via FBM displacement;
// the library also renders Fresnel + edge highlight up to SHADOW_PAD (20px)
// past the glass element. `INSET_FACTOR` shrinks the glass diameter to ~85%
// of the body's quiescent edge so the full glass effect — including its
// outer rim — stays inside the visible body.
const INSET_FACTOR = 0.85
const orbScaleForAmplitude = (amplitude: number) =>
  (0.2 + amplitude * 0.18) * 2 * INSET_FACTOR

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
      {/* `crossOrigin="anonymous"` is required even though the asset is
          same-origin: drawImage(video, …) → texImage2D(canvas) only stays
          origin-clean when the video was loaded with explicit CORS
          credentials. Without it the WebGL texture upload silently
          produces blank pixels and the leaves disappear from the
          refraction. */}
      <video
        src={LEAVES_VIDEO_SRC}
        crossOrigin="anonymous"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="absolute object-cover"
        style={{
          height: '50%',
          width: '50%',
          top: '50%',
          left: '50%',
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
        }}
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
