import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { lookupGooglePlacePhoto, lookupPhoto } from "../Korea/placePhoto"
import { focusRingClass, mutedInkClass } from "./ui"

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
    void lookupConciergePhoto({ name, city, lat, lng, size: 640 }).then((found) => {
      if (!cancelled) setUrl(found)
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
      className={`relative block aspect-[16/9] w-full overflow-hidden bg-stone-200/80 text-left dark:bg-stone-800 ${focusRingClass}`}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-display text-3xl text-stone-400 dark:text-stone-500"
          aria-hidden
        >
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
  const [url, setUrl] = useState<string | null>(initialUrl ?? null)
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    initialUrl ? "ready" : "loading",
  )

  useEffect(() => {
    if (initialUrl) return
    let cancelled = false
    void lookupConciergePhoto({ name, city, lat, lng, size: 1200 }).then((found) => {
      if (cancelled) return
      setUrl(found)
      setStatus(found ? "ready" : "empty")
    })
    return () => {
      cancelled = true
    }
  }, [name, city, lat, lng, initialUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] flex flex-col bg-stone-950/92"
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium text-stone-100">
          {name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photos"
          className={`flex h-11 w-11 items-center justify-center rounded-full text-stone-300 hover:bg-white/10 hover:text-white ${focusRingClass}`}
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {status === "loading" ? (
          <p className={`text-sm ${mutedInkClass}`}>Looking up a photo…</p>
        ) : url ? (
          <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="max-w-xs text-center text-sm text-stone-400">
            No photo found for {name}. Try Maps for a street view.
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
