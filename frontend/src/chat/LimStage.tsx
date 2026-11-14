import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { sx } from '@/styles/merge'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { stage as s, chatbot } from '@/styles/chatbot.stylex'
import { LimArt } from './LimArt'
import type { Stunt } from './eggs'
import type { LimMood, LimReaction, LimScene, LimWorld } from './scene/limScene'
import type { WorldOp } from './world/spec'
import { loadWorld, saveWorld } from './world/worldApi'

export type LimStageHandle = {
  hop(): void
  talk(): void
  cheer(confetti: boolean): void
  lookAt(clientX: number, clientY: number): void
  /** Act out a typed easter egg. False when there's no live Lim to do it. */
  stunt(kind: Stunt): boolean
  react(kind: LimReaction): void
  /** Change Lim's world. False when there is no live scene, or the first thing asked for could not be done. */
  apply(ops: WorldOp[]): boolean
  /** Lim conjures while something is being made. */
  conjure(on: boolean, made?: boolean): void
  /** What is in the world now, or null without a live scene. */
  world(): LimWorld | null
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
export function LimStage({
  mood,
  night,
  onWorld,
  ref,
}: {
  mood: LimMood
  night: boolean
  /** The items or the place changed (also called once when the scene comes up). */
  onWorld?: (world: LimWorld) => void
  ref?: Ref<LimStageHandle>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<LimScene | null>(null)
  const initial = useRef({ mood, night })
  const [live, setLive] = useState(false)
  const [beat, setBeat] = useState<{ kind: 'hop' | 'poke'; n: number }>({ kind: 'hop', n: 0 })
  const [pop, setPop] = useState<{ n: number; word: string } | null>(null)
  const reducedMotion = useReducedMotion()

  const onWorldRef = useRef(onWorld)
  useLayoutEffect(() => {
    initial.current = { mood, night }
    onWorldRef.current = onWorld
  })

  const emote = useCallback((word: string) => {
    setPop((p) => ({ n: (p?.n ?? 0) + 1, word }))
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
      stunt: (kind) => {
        sceneRef.current?.stunt(kind)
        return Boolean(sceneRef.current)
      },
      react: (kind) => sceneRef.current?.react(kind),
      apply: (ops) => {
        const scene = sceneRef.current
        if (!scene) return false
        let did = ops.length === 0
        ops.forEach((op, i) => {
          // One thing at a time, so each gets its moment.
          const run = () => {
            if (sceneRef.current !== scene) return false
            if (op.op === 'item') scene.addItem(op.spec, op.then)
            else if (op.op === 'place') scene.setPlace(op.spec)
            else if (op.op === 'clear') scene.clear(op.what)
            else if (op.op === 'tweak') scene.tweak(op.set)
            else return scene.act(op.action, op.target)
            return true
          }
          // Whether the first thing asked for could be done (there may be nothing by that name to act on).
          if (i === 0) did = run()
          else window.setTimeout(run, i * 900)
        })
        return did
      },
      conjure: (on, made) => sceneRef.current?.conjure(on, made),
      world: () => sceneRef.current?.world() ?? null,
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
        onEmote: emote,
        world: loadWorld(),
        onWorld: (world) => {
          saveWorld(world)
          onWorldRef.current?.(world)
        },
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
        onWorldRef.current?.(created.world())
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
  }, [reducedMotion, emote])

  useEffect(() => {
    sceneRef.current?.setMood(mood)
  }, [mood, live])
  useEffect(() => {
    sceneRef.current?.setNight(night)
  }, [night, live])

  const pokeDrawing = () => {
    if (live || reducedMotion) return
    setBeat((b) => ({ kind: 'poke', n: b.n + 1 }))
    emote(POKE_WORDS[Math.floor(Math.random() * POKE_WORDS.length)])
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
          <span key={pop.n} {...sx(s.hehe, pop.n % 2 === 1 && s.heheAlt, pop.word === 'z' && s.zed)}>
            {pop.word}
          </span>
        )}
      </div>
    </div>
  )
}
