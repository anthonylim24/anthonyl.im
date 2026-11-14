import { useEffect, useRef, useState } from 'react'
import { sx } from '@/styles/merge'
import { chatbot } from '@/styles/chatbot.stylex'
import type { ItemSpec } from './world/spec'
import type { Thumbs } from './scene/thumbs'

/**
 * The toy box's picture renderer: made the first time the box opens (it
 * shares the 3D scene's chunk, which is loaded by then) and kept, so the
 * pictures are instant from then on. Null until ready, or where there is no
 * GPU: the cards then show a colour swatch.
 */
export function useThumbs(open: boolean, night: boolean, reducedMotion: boolean): Thumbs | null {
  const [thumbs, setThumbs] = useState<Thumbs | null>(null)
  const [wanted, setWanted] = useState(false)
  if (open && !wanted) setWanted(true)
  const nightRef = useRef(night)
  useEffect(() => {
    nightRef.current = night
    thumbs?.setNight(night)
  }, [night, thumbs])
  useEffect(() => {
    if (!wanted) return
    let gone = false
    let made: Thumbs | null = null
    void (async () => {
      const { createThumbs } = await import('./scene/thumbs')
      const created = await createThumbs({ night: nightRef.current, reducedMotion })
      if (gone) created.dispose()
      else setThumbs((made = created))
    })().catch((error: unknown) => {
      console.warn('[chat] toy pictures unavailable; showing swatches.', error)
    })
    return () => {
      gone = true
      made?.dispose()
      setThumbs(null)
    }
  }, [wanted, reducedMotion])
  return thumbs
}

/** One toy: its model on top, its name below. The model turns while the card is hovered or focused. */
export function ToyCard({ spec, thumbs, onGive }: { spec: ItemSpec; thumbs: Thumbs | null; onGive: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !thumbs) return
    return thumbs.mount(canvas, spec)
  }, [thumbs, spec])
  const spin = (on: boolean) => thumbs?.spin(on ? canvasRef.current : null)
  return (
    <button
      type="button"
      onClick={onGive}
      onPointerEnter={(e) => e.pointerType === 'mouse' && spin(true)}
      onPointerLeave={() => spin(false)}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && spin(true)}
      onBlur={() => spin(false)}
      {...sx(chatbot.toyCard)}
    >
      <span aria-hidden="true" {...sx(chatbot.toyPic)}>
        {!thumbs && <span {...sx(chatbot.toySwatch)} style={{ backgroundColor: spec.parts[0].color }} />}
        <canvas ref={canvasRef} {...sx(chatbot.toyCanvas, !thumbs && chatbot.toyCanvasOff)} />
      </span>
      <span {...sx(chatbot.toyName)}>{spec.name}</span>
    </button>
  )
}
