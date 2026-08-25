import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { lookupGooglePlacePhoto, lookupPhoto } from "../Korea/placePhoto"
import { focusRingClass } from "./ui"
import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'

export async function lookupConciergePhoto(args: {
  name: string
  city?: string
  lat?: number
  lng?: number
  size?: number
}): Promise<string | null> {
  const size = args.size ?? 800
  if (typeof args.lat === "number" && typeof args.lng === "number") {
    const google = await lookupGooglePlacePhoto({
      name: args.name,
      city: args.city ?? "",
      lat: args.lat,
      lng: args.lng,
      maxWidth: size,
    })
    if (google) return google
  }
  const queries = [args.name]
  if (args.city) queries.push(`${args.name} ${args.city}`)
  return lookupPhoto(queries, { size })
}

export function ConciergePhotoThumb({
  name,
  city,
  lat,
  lng,
  onOpen,
}: {
  name: string
  city?: string
  lat?: number
  lng?: number
  onOpen: (url: string | null) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    void lookupConciergePhoto({ name, city, lat, lng, size: 640 })
      .then((found) => {
        if (!cancelled) setUrl(found)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [name, city, lat, lng])

  const showImage = url && !failed

  return (
    <button
      type="button"
      onClick={() => onOpen(showImage ? url : null)}
      aria-label={`View photos of ${name}`}
      {...sx(styles.photoThumbBtn, focusRingClass)}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          {...sx(styles.photoCover)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span {...sx(styles.photoFallback)} aria-hidden>
          {name.trim().slice(0, 1) || "·"}
        </span>
      )}
    </button>
  )
}

export function ConciergePhotoViewer({
  name,
  city,
  lat,
  lng,
  initialUrl,
  onClose,
}: {
  name: string
  city?: string
  lat?: number
  lng?: number
  initialUrl?: string | null
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [url, setUrl] = useState<string | null>(initialUrl ?? null)
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    initialUrl ? "ready" : "loading",
  )

  useEffect(() => {
    if (initialUrl) return
    let cancelled = false
    void lookupConciergePhoto({ name, city, lat, lng, size: 1200 })
      .then((found) => {
        if (cancelled) return
        setUrl(found)
        setStatus(found ? "ready" : "empty")
      })
      .catch(() => {
        if (!cancelled) setStatus("empty")
      })
    return () => {
      cancelled = true
    }
  }, [name, city, lat, lng, initialUrl])

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => {
      restoreRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const root = dialogRef.current
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      {...sx(styles.photoViewerRoot)}
    >
      <header {...sx(styles.photoViewerHeader)}>
        <h2 id={titleId} {...sx(styles.photoViewerTitle)}>
          {name}
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close photos"
          {...sx(styles.photoCloseBtn, focusRingClass)}
        >
          <X {...sx(styles.icon5)} />
        </button>
      </header>
      <div {...sx(styles.photoViewerBody)}>
        {status === "loading" ? (
          <p {...sx(styles.photoViewerMuted)}>Looking up a photo…</p>
        ) : url ? (
          <img src={url} alt={name} decoding="async" {...sx(styles.photoViewerImg)} />
        ) : (
          <p {...sx(styles.photoViewerMutedCenter)}>
            No photo found for {name}. Try Maps for a street view.
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
