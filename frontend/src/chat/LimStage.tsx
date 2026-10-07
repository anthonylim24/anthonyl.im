import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { sx } from '@/styles/merge'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { stage as s, chatbot } from '@/styles/chatbot.stylex'
import { LimArt } from './LimArt'
import type { LimMood, LimScene } from './scene/limScene'

export type LimStageHandle = {
  hop(): void
  talk(): void
  cheer(confetti: boolean): void
  lookAt(clientX: number, clientY: number): void
}

const POKE_WORDS = ['hehe!', 'boop!', 'eep!', 'squish!', 'tee-hee', 'wobble!', 'again!']
const DOT_COLORS = ['#FF7E6B', '#B9A6FF', '#7FD6B5']

const canRender3D = () =>
  typeof navigator !== 'undefined' && ('gpu' in navigator || typeof window.WebGL2RenderingContext !== 'undefined')

/**
 * Lim's stage. The vector drawing paints first (and stays if there's no
 * WebGPU/WebGL2); the jelly scene lazy-loads in a separate chunk and fades in
 * on its first frame. The canvas is created per effect run so StrictMode's
 * double mount never shares a GPU context.
 */
export function LimStage({ mood, night, ref }: { mood: LimMood; night: boolean; ref?: Ref<LimStageHandle> }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<LimScene | null>(null)
  const initial = useRef({ mood, night })
  const [live, setLive] = useState(false)
  const [beat, setBeat] = useState<{ kind: 'hop' | 'poke'; n: number }>({ kind: 'hop', n: 0 })
  const [pop, setPop] = useState<{ n: number; word: string } | null>(null)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    initial.current = { mood, night }
  })

  const poked = useCallback(() => {
    setPop((p) => ({ n: (p?.n ?? 0) + 1, word: POKE_WORDS[Math.floor(Math.random() * POKE_WORDS.length)] }))
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      hop: () => {
        if (sceneRef.current) sceneRef.current.hop()
        else setBeat((b) => ({ kind: 'hop', n: b.n + 1 }))
      },
      talk: () => sceneRef.current?.talk(),
      cheer: (confetti) => sceneRef.current?.cheer(confetti),
      lookAt: (x, y) => sceneRef.current?.lookAt(x, y),
    }),
    [],
  )

  useEffect(() => {
    const host = hostRef.current
    const slot = slotRef.current
    if (!host || !slot || !canRender3D()) return
    let disposed = false
    let scene: LimScene | null = null
    const gl = document.createElement('canvas')
    gl.setAttribute('aria-hidden', 'true')
    Object.assign(gl.style, { width: '100%', height: '100%', display: 'block' })
    slot.appendChild(gl)

    void (async () => {
      const { createLimScene } = await import('./scene/limScene')
      if (disposed) return
      const created = await createLimScene({
        canvas: gl,
        host,
        reducedMotion,
        night: initial.current.night,
        mood: initial.current.mood,
        onPoke: poked,
        onAnchor: (x, y, unit) => {
          const a = anchorRef.current
          if (!a) return
          a.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
          a.style.setProperty('--u', `${unit.toFixed(1)}px`)
        },
        onFirstFrame: () => {
          if (!disposed) setLive(true)
        },
      })
      if (disposed) created.dispose()
      else {
        scene = created
        sceneRef.current = created
        created.setMood(initial.current.mood)
        created.setNight(initial.current.night)
      }
    })().catch((error: unknown) => {
      console.warn('[chat] live Lim unavailable; showing the drawing.', error)
    })

    return () => {
      disposed = true
      scene?.dispose()
      sceneRef.current = null
      gl.remove()
      setLive(false)
      const a = anchorRef.current
      if (a) {
        a.style.transform = ''
        a.style.removeProperty('--u')
      }
    }
  }, [reducedMotion, poked])

  useEffect(() => {
    sceneRef.current?.setMood(mood)
  }, [mood, live])
  useEffect(() => {
    sceneRef.current?.setNight(night)
  }, [night, live])

  const pokeDrawing = () => {
    if (live || reducedMotion) return
    setBeat((b) => ({ kind: 'poke', n: b.n + 1 }))
    poked()
  }

  return (
    <div ref={hostRef} {...sx(s.host)} aria-hidden="true">
      <div {...sx(s.fallback, live && s.hidden)}>
        <div {...sx(s.floorBand)} />
        <div {...sx(s.rug)} />
        <LimArt
          key={beat.n}
          mood={mood}
          shadow
          {...sx(
            s.art,
            !reducedMotion && beat.n === 0 && s.artBreathe,
            !reducedMotion && beat.n > 0 && (beat.kind === 'hop' ? s.artHop : s.artPoke),
          )}
          onPointerDown={pokeDrawing}
        />
      </div>
      <div ref={slotRef} {...sx(s.live, live && s.liveShown)} />
      <div ref={anchorRef} {...sx(s.anchor, !live && s.anchorStatic)}>
        {mood === 'thinking' && (
          <div {...sx(s.thought)}>
            <div {...sx(s.thoughtCloud)}>
              <span {...sx(s.thoughtPuff, s.puffBig)} />
              <span {...sx(s.thoughtPuff, s.puffSmall)} />
              {DOT_COLORS.map((c, i) => (
                <span key={c} {...sx(chatbot.thinkingDot)} style={{ backgroundColor: c, animationDelay: `${i * 140}ms` }} />
              ))}
            </div>
          </div>
        )}
        {pop && !reducedMotion && (
          <span key={pop.n} {...sx(s.hehe)}>
            {pop.word}
          </span>
        )}
      </div>
    </div>
  )
}
