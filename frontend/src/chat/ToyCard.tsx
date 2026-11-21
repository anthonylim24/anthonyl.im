import { useEffect, useRef, useState } from 'react'
import { sx } from '@/styles/merge'
import { chatbot } from '@/styles/chatbot.stylex'
import type { ItemSpec } from './world/spec'
import type { Thumbs } from './scene/thumbs'
import { loadTurn, type ToyArt } from './toyArt'

/**
 * The live picture renderer for toys Lim made up, which have no pre-render:
 * made the first time the box opens with one (it shares the 3D scene's chunk,
 * which is loaded by then) and kept. Null until ready, or where there is no
 * GPU: those cards then show a colour swatch.
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

type Props = { spec: ItemSpec; art?: ToyArt; thumbs: Thumbs | null; reducedMotion: boolean; onGive: () => void }

/** One toy: its picture on top, its name below. The toy turns once when the card is hovered or focused. */
export function ToyCard({ spec, art, thumbs, reducedMotion, onGive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [turning, setTurning] = useState(false)
  useEffect(() => {
    const canvas = canvasRef.current
    if (art || !canvas || !thumbs) return
    return thumbs.mount(canvas, spec)
  }, [art, thumbs, spec])
  const spin = (on: boolean) => {
    if (!art) thumbs?.spin(on ? canvasRef.current : null)
    else if (on && !reducedMotion) void loadTurn(art.turn).then((ready) => ready && setTurning(true))
  }
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
        {art ? (
          <>
            <img src={art.still} alt="" decoding="async" draggable={false} {...sx(chatbot.toyImg, turning && chatbot.toyHidden)} />
            {turning && (
              <span onAnimationEnd={() => setTurning(false)} {...sx(chatbot.toyTurn)} style={{ backgroundImage: `url(${art.turn})` }} />
            )}
          </>
        ) : (
          <>
            {!thumbs && <span {...sx(chatbot.toySwatch)} style={{ backgroundColor: spec.parts[0].color }} />}
            <canvas ref={canvasRef} {...sx(chatbot.toyCanvas, !thumbs && chatbot.toyHidden)} />
          </>
        )}
      </span>
      <span {...sx(chatbot.toyName)}>{spec.name}</span>
    </button>
  )
}
