import { useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { withViteBase } from '@/lib/routerBasename'

interface LeafAmbienceProps {
  enabled: boolean
}

export function LeafAmbience({ enabled }: LeafAmbienceProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const reducedMotion = useReducedMotion()
  const visible = enabled && !reducedMotion

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if (!enabled || media.matches) {
        video.pause()
        return
      }
      void video.play().catch(() => {})
    }

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [enabled])

  return (
    <div
      className="chat-ambience"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="chat-ambience-media"
        src={withViteBase('/leaves.mp4')}
        loop
        muted
        playsInline
        preload="auto"
      />
    </div>
  )
}
